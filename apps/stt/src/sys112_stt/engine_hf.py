from __future__ import annotations

import asyncio
import base64
import logging
import math
import struct
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from sys112_stt.config import (
    HF_TOKEN,
    STT_HF_BASE_URL,
    STT_HF_LANGUAGE,
    STT_HF_MODEL,
    STT_SAMPLE_RATE,
)
from sys112_stt.transcript_postprocessor import normalize_transcript

logger = logging.getLogger("sys112_stt")

Transcribe = Callable[[bytes], Awaitable[str]]

_PREROLL_SEC = 0.45
_SILENCE_SEC = 0.28
_MIN_SPEECH_SEC = 0.28
_PARTIAL_SEC = 0.9
_PARTIAL_INTERVAL_SEC = 0.75
_MAX_UTTERANCE_SEC = 18.0
_REUSE_SEC = 0.18
_JUNK = (
    "субтитр",
    "dimatorzok",
    "спасибо за просмотр",
    "thanks for watching",
    "продолжение следует",
    "редактор",
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
    }
)


def clean_transcript(text: str) -> str:
    text = normalize_transcript(text).strip(" .…")
    low = text.lower()
    if len(low) < 2 or any(item in low for item in _JUNK) or low in _GHOST:
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
    if _http is None:
        _http = httpx.AsyncClient(timeout=20)
    return _http


async def transcribe_wav(wav: bytes) -> str:
    if not HF_TOKEN:
        raise HfSttError(401, "Нет HF_TOKEN")
    url = f"{STT_HF_BASE_URL}/hf-inference/models/{STT_HF_MODEL}"
    payload = {
        "inputs": base64.b64encode(wav).decode("ascii"),
        "parameters": {
            "return_timestamps": False,
            "generate_kwargs": {"language": STT_HF_LANGUAGE, "task": "transcribe"},
        },
    }
    client = _http_client()
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    response = await client.post(url, headers=headers, json=payload)
    if response.status_code >= 400:
        response = await client.post(url, headers={**headers, "Content-Type": "audio/wav"}, content=wav)
    if response.status_code >= 400:
        detail = response.text[:280].replace("\n", " ")
        raise HfSttError(response.status_code, detail or f"HTTP {response.status_code}")
    body = response.json()
    if isinstance(body, dict):
        return normalize_transcript(str(body.get("text") or ""))
    if isinstance(body, list) and body and isinstance(body[0], dict):
        return normalize_transcript(str(body[0].get("text") or ""))
    return ""


class HuggingFaceSttSession:
    remote = True
    mock = False

    def __init__(self, transcribe: Transcribe | None = None, sample_rate: int = STT_SAMPLE_RATE) -> None:
        self._transcribe = transcribe or transcribe_wav
        self.sample_rate = sample_rate
        self.preroll = bytearray()
        self.speech = bytearray()
        self.in_speech = False
        self.silence_bytes = 0
        self.audio_seconds = 0.0
        self.utterance_start = 0.0
        self.finals: list[dict[str, Any]] = []
        self.last_partial = ""
        self.partial_bytes = 0
        self.sent_seconds = 0.0
        self.noise_rms = 28.0
        self._failed = False
        self._force_final = False
        self._task: asyncio.Task[None] | None = None
        self.queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self.emitted: list[dict[str, Any]] = []
        self._closed = False

    def feed(self, chunk: bytes) -> None:
        if self._closed or len(chunk) < 2:
            return
        if len(chunk) % 2:
            chunk = chunk[:-1]
        duration = (len(chunk) / 2) / self.sample_rate
        self.audio_seconds += duration
        level = _rms(chunk)
        if not self.in_speech and level < self.noise_rms * 1.7:
            self.noise_rms = self.noise_rms * 0.9 + level * 0.1
        loud = level >= max(32.0, self.noise_rms * 2.1)
        if not self.in_speech:
            if not loud:
                self._push_preroll(chunk)
                return
            self.in_speech = True
            self.speech = bytearray(self.preroll) + bytearray(chunk)
            self.preroll.clear()
            self.silence_bytes = 0
            self.sent_seconds = 0.0
            self.partial_bytes = 0
            self.last_partial = ""
            self.utterance_start = max(0.0, self.audio_seconds - duration - _PREROLL_SEC)
        else:
            self.speech.extend(chunk)
            if loud:
                self.silence_bytes = 0
            else:
                self.silence_bytes += len(chunk)
        self._kick()

    async def accept_pcm(self, chunk: bytes) -> list[dict[str, Any]]:
        start = len(self.emitted)
        self.feed(chunk)
        await self.wait_idle()
        return self.emitted[start:]

    async def finish(self) -> list[dict[str, Any]]:
        self._force_final = True
        self._kick()
        await self.wait_idle()
        if not self._closed:
            text = normalize_transcript(" ".join(str(item["text"]) for item in self.finals))
            self._emit({"type": "session_complete", "text": text, "phrases": self.finals})
            self._closed = True
        return list(self.emitted)

    async def wait_idle(self) -> None:
        while self._task is not None and not self._task.done():
            await self._task

    def _kick(self) -> None:
        if self._task is not None and not self._task.done():
            return
        if self._next_job() is None:
            return
        self._task = asyncio.create_task(self._run())

    def _next_job(self) -> tuple[str, bytes, float, float] | None:
        if self._failed or not self.in_speech:
            return None
        voiced = self._voiced()
        speech_sec = max(0.0, (len(self.speech) - self.silence_bytes) / 2) / self.sample_rate
        silence_sec = (self.silence_bytes / 2) / self.sample_rate
        start = self.utterance_start
        end = self.audio_seconds
        if not voiced:
            return None
        if silence_sec >= _SILENCE_SEC and speech_sec < _MIN_SPEECH_SEC:
            self._reset_utterance()
            return None
        if speech_sec >= _MAX_UTTERANCE_SEC or (silence_sec >= _SILENCE_SEC and speech_sec >= _MIN_SPEECH_SEC) or (
            self._force_final and speech_sec >= _MIN_SPEECH_SEC
        ):
            return ("final", voiced, start, end)
        if self._force_final:
            self._reset_utterance()
            self._force_final = False
            return None
        due = self.sent_seconds == 0 or speech_sec - self.sent_seconds >= _PARTIAL_INTERVAL_SEC
        if speech_sec >= _PARTIAL_SEC and due:
            return ("partial", voiced, start, end)
        return None

    async def _run(self) -> None:
        try:
            while True:
                job = self._next_job()
                if job is None:
                    return
                await self._execute(*job)
        finally:
            self._task = None
            if self._next_job() is not None:
                self._kick()

    async def _execute(self, kind: str, pcm: bytes, start: float, end: float) -> None:
        self.sent_seconds = (len(pcm) / 2) / self.sample_rate
        reuse = (
            kind == "final"
            and bool(self.last_partial)
            and len(self.last_partial) >= 12
            and abs(len(pcm) - self.partial_bytes) / 2 / self.sample_rate < _REUSE_SEC
        )
        cached = self.last_partial
        if kind == "final":
            self._reset_utterance()
            self._force_final = False
        if reuse:
            text, error = cached, None
        else:
            text, error = await self._recognize(pcm)
        if error:
            self._emit(error)
            return
        if not text:
            return
        if kind == "partial":
            self.partial_bytes = len(pcm)
            if text != self.last_partial:
                self.last_partial = text
                self._emit({"type": "partial", "text": text})
            return
        if self.finals and text == self.finals[-1]["text"]:
            return
        phrase = {"text": text, "start": round(start, 2), "end": round(end, 2)}
        self.finals.append(phrase)
        self._emit({"type": "final", **phrase})

    async def _recognize(self, pcm: bytes) -> tuple[str, dict[str, Any] | None]:
        if self._failed or len(pcm) < 2:
            return "", None
        try:
            text = clean_transcript(await self._transcribe(pcm16_wav(pcm, self.sample_rate)))
            return text, None
        except HfSttError as exc:
            logger.warning("stt failed status=%s detail=%s", exc.status, exc.detail)
            return "", None
        except Exception:
            logger.exception("stt request failed")
            return "", None

    def _emit(self, event: dict[str, Any]) -> None:
        self.emitted.append(event)
        self.queue.put_nowait(event)

    def _voiced(self) -> bytes:
        tail = self.silence_bytes
        if tail <= 0 or tail >= len(self.speech):
            return bytes(self.speech)
        keep = int(self.sample_rate * 0.12) * 2
        cut = max(0, tail - keep)
        return bytes(self.speech[: len(self.speech) - cut])

    def _voiced_seconds(self) -> float:
        return (len(self._voiced()) / 2) / self.sample_rate

    def _push_preroll(self, chunk: bytes) -> None:
        self.preroll.extend(chunk)
        limit = int(self.sample_rate * _PREROLL_SEC) * 2
        if len(self.preroll) > limit:
            del self.preroll[: len(self.preroll) - limit]

    def _reset_utterance(self) -> None:
        self.speech.clear()
        self.preroll.clear()
        self.in_speech = False
        self.silence_bytes = 0
        self.sent_seconds = 0.0
        self.partial_bytes = 0
        self.last_partial = ""
