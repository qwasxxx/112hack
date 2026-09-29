from __future__ import annotations

import asyncio
import base64
import logging
import math
import struct
import time
import uuid
from collections import deque
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from sys112_stt.config import (
    HF_TOKEN,
    STT_HF_BASE_URL,
    STT_HF_LANGUAGE,
    STT_HF_TASK,
    STT_HF_LONG_SPEECH_SEC,
    STT_HF_MIN_SPEECH_SEC,
    STT_HF_MODEL,
    STT_HF_PARTIAL_INTERVAL_SEC,
    STT_HF_PARTIAL_SEC,
    STT_HF_PREROLL_SEC,
    STT_HF_SILENCE_FAST_SEC,
    STT_HF_SILENCE_LONG_SEC,
    STT_HF_SILENCE_SEC,
    STT_HF_TRAIL_KEEP_SEC,
    STT_SAMPLE_RATE,
)
from sys112_stt.transcript_postprocessor import normalize_transcript, polish_operator_transcript

logger = logging.getLogger("sys112_stt")

Transcribe = Callable[[bytes], Awaitable[str]]

_MAX_UTTERANCE_SEC = 18.0
_REUSE_SEC = 0.18
_PARTIAL_HOLD_SILENCE_SEC = 0.04
_FORCE_MIN_SPEECH_SEC = 0.10
_PARTIAL_TIMEOUT_SEC = 8.0
_FINAL_TIMEOUT_SEC = 15.0
_NOISE_WINDOW_SEC = 2.0
_START_MIN_RMS = 140.0
_START_HOLD_SEC = 0.06
_NOISE_EMA = 0.08
_JUNK = (
    "субтитр",
    "dimatorzok",
    "спасибо за просмотр",
    "thanks for watching",
    "продолжение следует",
    "редактор",
    "сэньтью",
    "сэнкью",
    "сенкью",
    "сэнк ю",
    "фондюши",
)


class HfSttError(RuntimeError):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def pcm16_wav(pcm: bytes, sample_rate: int) -> bytes:
    if len(pcm) % 2:
        pcm = pcm[:-1]
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(pcm),
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        sample_rate,
        sample_rate * 2,
        2,
        16,
        b"data",
        len(pcm),
    )
    return header + pcm


_GHOST = frozenset(
    {
        "спасибо",
        "спасибо большое",
        "большое спасибо",
        "благодарю",
        "благодарю вас",
        "пожалуйста",
        "окей",
        "ок",
    }
)


def clean_transcript(text: str) -> str:
    text = polish_operator_transcript(text).strip(" …")
    text = text[:-3].rstrip() if text.endswith("...") else text
    low = text.lower()
    core = low.strip(" .!?")
    if len(core) < 2 or any(item in low for item in _JUNK) or core in _GHOST:
        return ""
    return text


def _rms(pcm: bytes) -> float:
    count = len(pcm) // 2
    if count <= 0:
        return 0.0
    total = 0
    for index in range(0, count * 2, 2):
        value = int.from_bytes(pcm[index : index + 2], "little", signed=True)
        total += value * value
    return math.sqrt(total / count)


def access_message(_status: int) -> str:
    return "Не расслышал. Повторите фразу."


_http: httpx.AsyncClient | None = None


def _http_client() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(
            timeout=httpx.Timeout(12.0, connect=5.0, pool=2.0),
            limits=httpx.Limits(max_keepalive_connections=0, max_connections=4),
            trust_env=False,
        )
    return _http


def open_http_client() -> None:
    _http_client()


async def warm_http_client() -> None:
    if not STT_HF_BASE_URL:
        return
    headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}
    urls = [STT_HF_BASE_URL]
    if STT_HF_MODEL:
        urls.append(f"{STT_HF_BASE_URL}/hf-inference/models/{STT_HF_MODEL}")
    for url in urls:
        try:
            await _http_client().get(url, headers=headers, timeout=3.0)
            break
        except Exception:
            continue
    else:
        logger.info("[STT] http warmup skipped")


async def close_http_client() -> None:
    global _http
    client = _http
    _http = None
    if client is not None and not client.is_closed:
        await client.aclose()


def _asr_payload(wav: bytes) -> dict[str, Any]:
    generate = {"language": STT_HF_LANGUAGE, "task": STT_HF_TASK}
    return {
        "inputs": base64.b64encode(wav).decode("ascii"),
        "parameters": {
            "return_timestamps": False,
            "generate_kwargs": generate,
        },
    }


def _parse_asr_body(body: Any) -> str:
    if isinstance(body, dict):
        return normalize_transcript(str(body.get("text") or ""))
    if isinstance(body, list) and body and isinstance(body[0], dict):
        return normalize_transcript(str(body[0].get("text") or ""))
    return ""


async def _post_asr(url: str, wav: bytes, timeout: float) -> httpx.Response:
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    return await _http_client().post(url, headers=headers, json=_asr_payload(wav), timeout=timeout)


async def transcribe_wav(wav: bytes, timeout: float | None = None) -> str:
    if not HF_TOKEN:
        raise HfSttError(401, "Нет HF_TOKEN")
    url = f"{STT_HF_BASE_URL}/hf-inference/models/{STT_HF_MODEL}"
    request_timeout = timeout if timeout is not None else _FINAL_TIMEOUT_SEC
    started = time.monotonic()
    response = await _post_asr(url, wav, request_timeout)
    logger.info(
        "[VOICE LATENCY] stt_http=%.3f language=%s task=%s status=%s",
        time.monotonic() - started,
        STT_HF_LANGUAGE,
        STT_HF_TASK,
        response.status_code,
    )
    if response.status_code < 400:
        return _parse_asr_body(response.json())
    status = response.status_code
    raise HfSttError(status, response.text[:280].replace("\n", " ") or f"HTTP {status}")


class HuggingFaceSttSession:
    remote = True
    mock = False

    def __init__(
        self,
        transcribe: Transcribe | None = None,
        sample_rate: int = STT_SAMPLE_RATE,
        session_id: str | None = None,
    ) -> None:
        self._transcribe = transcribe or transcribe_wav
        self.sample_rate = sample_rate
        self.session_id = session_id or str(uuid.uuid4())
        self.preroll = bytearray()
        self.speech = bytearray()
        self.in_speech = False
        self.silence_bytes = 0
        self.quiet_bytes = 0
        self.loud_bytes = 0
        self.audio_seconds = 0.0
        self.utterance_start = 0.0
        self.finals: list[dict[str, Any]] = []
        self.last_partial = ""
        self.partial_bytes = 0
        self.sent_seconds = 0.0
        self.noise_rms = 28.0
        self._levels: deque[tuple[float, float]] = deque()
        self._levels_sec = 0.0
        self._failed = False
        self._force_final = False
        self._task: asyncio.Task[None] | None = None
        self._inflight_kind: str | None = None
        self._run_id = 0
        self._utt_id = 0
        self._finalized_utt = 0
        self._speech_mono = 0.0
        self._last_speech_mono = 0.0
        self._endpoint_mono = 0.0
        self._candidate_bytes = 0
        self.queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self.emitted: list[dict[str, Any]] = []
        self._closed = False
        self._held = False

    def feed(self, chunk: bytes) -> None:
        if self._closed or self._held or len(chunk) < 2:
            return
        if len(chunk) % 2:
            chunk = chunk[:-1]
        duration = (len(chunk) / 2) / self.sample_rate
        self.audio_seconds += duration
        level = _rms(chunk)
        start_th = max(_START_MIN_RMS, self.noise_rms * 2.6)
        continue_th = max(80.0, self.noise_rms * 1.5)
        end_th = max(40.0, self.noise_rms * 1.1)
        loud = level >= (start_th if not self.in_speech else continue_th)
        very_quiet = level < end_th
        now = time.monotonic()
        if not self.in_speech:
            if not loud:
                self._candidate_bytes = 0
                self._update_noise(level)
                self._push_preroll(chunk)
                return
            self._candidate_bytes += len(chunk)
            self._push_preroll(chunk)
            if self._bytes_sec(self._candidate_bytes) < _START_HOLD_SEC:
                return
            self.in_speech = True
            self._utt_id += 1
            self.speech = bytearray(self.preroll)
            self.preroll.clear()
            self.silence_bytes = 0
            self.quiet_bytes = 0
            self.loud_bytes = self._candidate_bytes
            self._candidate_bytes = 0
            self.sent_seconds = 0.0
            self.partial_bytes = 0
            self.last_partial = ""
            self.utterance_start = max(0.0, self.audio_seconds - self._bytes_sec(len(self.speech)))
            self._speech_mono = now
            self._last_speech_mono = now
            self._endpoint_mono = 0.0
        else:
            self.speech.extend(chunk)
            if loud:
                self.silence_bytes = 0
                self.quiet_bytes = 0
                self.loud_bytes += len(chunk)
                self._last_speech_mono = now
            else:
                self.silence_bytes += len(chunk)
                if very_quiet:
                    self.quiet_bytes += len(chunk)
                else:
                    self.quiet_bytes = 0
        self._kick()

    async def accept_pcm(self, chunk: bytes) -> list[dict[str, Any]]:
        start = len(self.emitted)
        self.feed(chunk)
        await self.wait_idle()
        return self.emitted[start:]

    async def finish(self) -> list[dict[str, Any]]:
        if self._closed:
            return list(self.emitted)
        self._force_final = True
        if self._inflight_kind == "partial":
            self._cancel_inflight()
        self._kick()
        await self.wait_idle()
        if not self._closed:
            text = normalize_transcript(" ".join(str(item["text"]) for item in self.finals))
            self._emit({"type": "session_complete", "text": text, "phrases": self.finals})
            self._closed = True
        await self._join_task()
        return list(self.emitted)

    async def abort(self) -> None:
        self._closed = True
        self._force_final = False
        self._cancel_inflight()
        await self._join_task()
        self._reset_utterance()

    def hold(self) -> None:
        """Drop the live utterance so caller playback cannot leak into the next turn."""
        if self._closed:
            return
        if self._utt_id > 0:
            self._finalized_utt = max(self._finalized_utt, self._utt_id)
        self._force_final = False
        self._cancel_inflight()
        self._reset_utterance()
        self._held = True

    def resume(self) -> None:
        if self._closed:
            return
        self._held = False
        self._force_final = False
        self._reset_utterance()

    async def wait_idle(self) -> None:
        while True:
            if self._held:
                task = self._task
                if task is None or task.done():
                    return
                try:
                    await asyncio.wait_for(task, timeout=0.25)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    return
                return
            task = self._task
            if task is None:
                return
            try:
                await task
            except asyncio.CancelledError:
                if not task.done():
                    raise

    def _kick(self) -> None:
        if self._closed:
            return
        live = self._task
        if live is not None and not live.done():
            if self._inflight_kind == "partial" and self._should_finalize():
                logger.info("[STT] cancel stale partial session=%s utt=%s", self.session_id[:8], self._utt_id)
                live.cancel()
                self._start_run()
            return
        if self._next_job() is None:
            return
        self._start_run()

    def _start_run(self) -> None:
        self._run_id += 1
        run_id = self._run_id
        self._task = asyncio.create_task(self._run(run_id), name=f"stt-hf-{self.session_id[:8]}")

    def _cancel_inflight(self) -> None:
        task = self._task
        if task is not None and not task.done():
            task.cancel()

    async def _join_task(self) -> None:
        task = self._task
        if task is None:
            return
        try:
            await task
        except asyncio.CancelledError:
            pass
        if self._task is task:
            self._task = None

    def _bytes_sec(self, raw: int) -> float:
        return max(0.0, raw / 2) / self.sample_rate

    def _loud_sec(self) -> float:
        return self._bytes_sec(self.loud_bytes)

    def _silence_sec(self) -> float:
        return self._bytes_sec(self.silence_bytes)

    def _quiet_sec(self) -> float:
        return self._bytes_sec(self.quiet_bytes)

    def _endpoint_ready(self, loud_sec: float) -> bool:
        if loud_sec < STT_HF_MIN_SPEECH_SEC:
            return False
        silence_sec = self._silence_sec()
        quiet_sec = self._quiet_sec()
        if quiet_sec >= STT_HF_SILENCE_FAST_SEC:
            return True
        if loud_sec >= STT_HF_LONG_SPEECH_SEC and silence_sec >= STT_HF_SILENCE_LONG_SEC:
            return True
        if silence_sec >= STT_HF_SILENCE_SEC:
            return True
        return False

    def _should_finalize(self) -> bool:
        if self._failed or self._closed or not self.in_speech:
            return False
        loud_sec = self._loud_sec()
        if self._force_final and loud_sec >= _FORCE_MIN_SPEECH_SEC:
            return True
        if loud_sec >= _MAX_UTTERANCE_SEC:
            return True
        return self._endpoint_ready(loud_sec)

    def _next_job(self) -> tuple[str, bytes, float, float, int] | None:
        if self._failed or self._closed or not self.in_speech:
            return None
        voiced = self._voiced()
        if not voiced:
            return None
        loud_sec = self._loud_sec()
        silence_sec = self._silence_sec()
        start = self.utterance_start
        end = self.audio_seconds
        utt_id = self._utt_id
        if loud_sec < STT_HF_MIN_SPEECH_SEC and not (self._force_final and loud_sec >= _FORCE_MIN_SPEECH_SEC):
            if silence_sec >= STT_HF_SILENCE_SEC or self._force_final:
                self._reset_utterance()
                self._force_final = False
            return None
        if self._should_finalize():
            if self._endpoint_mono == 0.0:
                self._endpoint_mono = time.monotonic()
            return ("final", voiced, start, end, utt_id)
        if self._force_final:
            self._reset_utterance()
            self._force_final = False
            return None
        if silence_sec >= _PARTIAL_HOLD_SILENCE_SEC:
            return None
        due = self.sent_seconds == 0 or loud_sec - self.sent_seconds >= STT_HF_PARTIAL_INTERVAL_SEC
        if loud_sec >= STT_HF_PARTIAL_SEC and due:
            return ("partial", voiced, start, end, utt_id)
        return None

    async def _run(self, run_id: int) -> None:
        try:
            while not self._closed and run_id == self._run_id:
                job = self._next_job()
                if job is None:
                    return
                self._inflight_kind = job[0]
                try:
                    await self._execute(*job)
                finally:
                    if run_id == self._run_id:
                        self._inflight_kind = None
        except asyncio.CancelledError:
            raise
        finally:
            if self._task is asyncio.current_task():
                self._task = None
                if run_id == self._run_id:
                    self._inflight_kind = None
                if not self._closed:
                    self._kick()

    async def _execute(self, kind: str, pcm: bytes, start: float, end: float, utt_id: int) -> None:
        self.sent_seconds = (len(pcm) / 2) / self.sample_rate
        reuse = (
            kind == "final"
            and bool(self.last_partial)
            and abs(len(pcm) - self.partial_bytes) / 2 / self.sample_rate < _REUSE_SEC
        )
        cached = self.last_partial
        speech_mono = self._speech_mono
        last_speech_mono = self._last_speech_mono
        endpoint_mono = self._endpoint_mono
        if kind == "final":
            self._reset_utterance()
            self._force_final = False
        if kind == "partial" and (utt_id != self._utt_id or utt_id <= self._finalized_utt):
            return
        if kind == "final" and utt_id <= self._finalized_utt:
            return
        hf_start = time.monotonic()
        if reuse:
            text, error = cached, None
            hf_end = hf_start
        else:
            text, error = await self._recognize(pcm, kind)
            hf_end = time.monotonic()
        if self._closed or self._held:
            return
        if kind == "partial" and (utt_id != self._utt_id or utt_id <= self._finalized_utt):
            return
        if kind == "final" and utt_id <= self._finalized_utt:
            return
        if error:
            self._emit(error)
            return
        if not text:
            return
        request_id = f"{self.session_id}:{utt_id}:{kind}"
        if kind == "partial":
            self.partial_bytes = len(pcm)
            if text != self.last_partial:
                self.last_partial = text
                self._emit({"type": "partial", "text": text, "utt_id": utt_id, "request_id": request_id})
            return
        if self.finals and text == self.finals[-1]["text"]:
            self._finalized_utt = max(self._finalized_utt, utt_id)
            return
        phrase = {"text": text, "start": round(start, 2), "end": round(end, 2)}
        self.finals.append(phrase)
        self._finalized_utt = max(self._finalized_utt, utt_id)
        emitted_at = time.monotonic()
        self._emit({"type": "final", **phrase, "utt_id": utt_id, "request_id": request_id})
        self._log_latency(
            utt_id,
            hf_start,
            hf_end,
            emitted_at,
            reused=reuse,
            speech_mono=speech_mono,
            last_speech_mono=last_speech_mono,
            endpoint_mono=endpoint_mono,
        )

    def _log_latency(
        self,
        utt_id: int,
        hf_start: float,
        hf_end: float,
        emitted_at: float,
        reused: bool,
        speech_mono: float,
        last_speech_mono: float,
        endpoint_mono: float,
    ) -> None:
        speech_start = speech_mono or hf_start
        last_speech = last_speech_mono or speech_start
        endpoint = endpoint_mono or hf_start
        speech = max(0.0, last_speech - speech_start)
        endpoint_wait = max(0.0, endpoint - last_speech)
        hf = 0.0 if reused else max(0.0, hf_end - hf_start)
        total = max(0.0, emitted_at - last_speech)
        hf_label = "reuse" if reused else f"{hf:.3f}"
        logger.info(
            "[STT LATENCY] session=%s utt=%s speech=%.3f endpoint=%.3f hf=%s total=%.3f",
            self.session_id[:8],
            utt_id,
            speech,
            endpoint_wait,
            hf_label,
            total,
        )
        logger.info(
            "[VOICE LATENCY] call=%s turn=%s endpoint_ms=%d stt_ms=%d hf=%s",
            self.session_id[:8],
            utt_id,
            int(endpoint_wait * 1000),
            int(total * 1000),
            hf_label,
        )

    async def _recognize(self, pcm: bytes, kind: str = "final") -> tuple[str, dict[str, Any] | None]:
        if self._failed or self._closed or len(pcm) < 2:
            return "", None
        timeout = _PARTIAL_TIMEOUT_SEC if kind == "partial" else _FINAL_TIMEOUT_SEC
        try:
            raw = await self._call_transcribe(pcm, timeout)
            if self._closed:
                return "", None
            return clean_transcript(raw), None
        except asyncio.CancelledError:
            raise
        except HfSttError as exc:
            logger.warning("stt failed status=%s detail=%s kind=%s", exc.status, exc.detail, kind)
            if exc.status in (401, 403):
                self._failed = True
                return "", {"type": "error", "message": access_message(exc.status), "code": "auth"}
            if kind == "final":
                code = "stt_timeout" if exc.status == 504 else "stt_retry"
                return "", {"type": "error", "message": access_message(exc.status), "code": code}
            return "", None
        except Exception:
            logger.exception("stt request failed kind=%s", kind)
            return "", None

    async def _call_transcribe(self, pcm: bytes, timeout: float) -> str:
        wav = pcm16_wav(pcm, self.sample_rate)
        transcribe = self._transcribe

        async def invoke() -> str:
            try:
                return await transcribe(wav, timeout)  # type: ignore[misc]
            except TypeError:
                return await transcribe(wav)

        try:
            return await asyncio.wait_for(invoke(), timeout)
        except asyncio.TimeoutError:
            await close_http_client()
            logger.warning("stt attempt timed out, opening a new connection")
        except asyncio.CancelledError:
            await close_http_client()
            raise
        try:
            return await asyncio.wait_for(invoke(), timeout)
        except asyncio.TimeoutError as exc:
            await close_http_client()
            raise HfSttError(504, "stt timeout") from exc
        except asyncio.CancelledError:
            await close_http_client()
            raise

    def _emit(self, event: dict[str, Any]) -> None:
        self.emitted.append(event)
        self.queue.put_nowait(event)

    def _voiced(self) -> bytes:
        tail = self.silence_bytes
        if tail <= 0 or tail >= len(self.speech):
            return bytes(self.speech)
        keep = int(self.sample_rate * STT_HF_TRAIL_KEEP_SEC) * 2
        cut = max(0, tail - keep)
        return bytes(self.speech[: len(self.speech) - cut])

    def _voiced_seconds(self) -> float:
        return (len(self._voiced()) / 2) / self.sample_rate

    def _update_noise(self, level: float) -> None:
        ceiling = max(48.0, self.noise_rms * 3.0)
        sample = min(level, ceiling)
        self.noise_rms = (1.0 - _NOISE_EMA) * self.noise_rms + _NOISE_EMA * sample

    def _track_level(self, level: float, duration: float) -> None:
        self._levels.append((level, duration))
        self._levels_sec += duration
        while len(self._levels) > 1 and self._levels_sec - self._levels[0][1] >= _NOISE_WINDOW_SEC:
            self._levels_sec -= self._levels.popleft()[1]

    def _push_preroll(self, chunk: bytes) -> None:
        self.preroll.extend(chunk)
        limit = int(self.sample_rate * STT_HF_PREROLL_SEC) * 2
        if len(self.preroll) > limit:
            del self.preroll[: len(self.preroll) - limit]

    def _reset_utterance(self) -> None:
        self.speech.clear()
        self.preroll.clear()
        self.in_speech = False
        self.silence_bytes = 0
        self.quiet_bytes = 0
        self.loud_bytes = 0
        self.sent_seconds = 0.0
        self.partial_bytes = 0
        self.last_partial = ""
        self._candidate_bytes = 0
        self._endpoint_mono = 0.0
        self._speech_mono = 0.0
        self._last_speech_mono = 0.0
