from __future__ import annotations

import inspect
import logging
import re
import struct
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx

from sys112_tts.config import (
    FISH_API_KEY,
    FISH_FORMAT,
    FISH_LATENCY,
    FISH_MODEL,
    FISH_OPERATOR_REFERENCE_AUDIO,
    FISH_OPERATOR_REFERENCE_ID,
    FISH_OPERATOR_REFERENCE_TEXT,
    FISH_REFERENCE_AUDIO,
    FISH_REFERENCE_ID,
    FISH_REFERENCE_TEXT,
    FISH_SAMPLE_RATE,
    FISH_VICTIM_REFERENCE_AUDIO,
    FISH_VICTIM_FEMALE_REFERENCE_ID,
    FISH_VICTIM_MALE_REFERENCE_ID,
    FISH_VICTIM_REFERENCE_ID,
    FISH_VICTIM_REFERENCE_TEXT,
    REPO_ROOT,
)

logger = logging.getLogger("sys112_tts")
FISH_API_BASE = "https://api.fish.audio"
_TTS_TIMEOUT = httpx.Timeout(45.0, connect=5.0, pool=5.0)
_TTS_LIMITS = httpx.Limits(max_keepalive_connections=8, max_connections=8, keepalive_expiry=120.0)

DISPATCH_PREFIX = "[serious] [professional broadcast tone] [clear speech] "
_PANIC = {"panic", "panic_high", "fear", "victim_panic"}
_SCARED = {"scared", "anxious", "victim_scared"}
_ANGRY = {"angry", "anger", "rage"}
_CRYING = {"crying", "sad", "confused", "panic_crying"}
_STARTLED = {"startled", "shock", "shocked"}
_WHISPER = {"whisper", "quiet", "soft"}
_MOODS = {
    "panic": ("[panicked]",),
    "scared": ("[nervous]",),
    "angry": ("[angry]",),
    "crying": ("[crying]",),
    "startled": ("[startled]",),
    "whisper": ("[whispering]",),
    "dispatch": ("[confident]", "[clear speech]"),
}
_TAG = re.compile(r"\[[^\[\]]{0,80}\]")
_SPACES = re.compile(r"\s+")
_SEVERE = re.compile(
    r"пожар|взрыв|горит|пламя|\bгаз\b|задых|без сознан|не могу дышать|умира|зажат",
    re.IGNORECASE,
)


def _mood(role: str, emotion: str | None) -> str:
    emo = (emotion or "").strip().lower()
    if emo == "dispatch" or role == "service":
        return "dispatch"
    if role != "victim":
        return "calm"
    if emo in _ANGRY:
        return "angry"
    if emo in _CRYING:
        return "crying"
    if emo in _STARTLED:
        return "startled"
    if emo in _WHISPER:
        return "whisper"
    if emo in _PANIC:
        return "panic"
    if emo in _SCARED or not emo:
        return "scared"
    return "scared"


def apply_fish_prosody(
    text: str,
    *,
    role: str = "operator",
    emotion: str | None = None,
    gender: str | None = None,
) -> str:
    body = _TAG.sub(" ", text or "")
    body = body.replace("...", " [short pause] ").replace("…", " [short pause] ")
    body = _SPACES.sub(" ", body).strip(" ,")
    if not body:
        return ""
    if _mood(role, emotion) == "dispatch":
        tags = list(_MOODS["dispatch"])
    elif role != "victim":
        tags = ["[serious]", "[professional broadcast tone]", "[clear speech]"]
    else:
        tags = list(_MOODS[_mood(role, emotion)])
        if _SEVERE.search(body) and "[breathing heavily]" not in tags:
            tags.insert(0, "[breathing heavily]")
    seen: list[str] = []
    for tag in tags:
        if tag not in seen:
            seen.append(tag)
    return " ".join(seen[:5]) + " " + body


def pcm16_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    if len(pcm) >= 12 and pcm[:4] == b"RIFF":
        return pcm
    if len(pcm) < 2:
        return b""
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


def _resolve_path(raw: str) -> Path | None:
    value = (raw or "").strip()
    if not value:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path


class FishTTSClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        latency: str | None = None,
        audio_format: str | None = None,
        sample_rate: int | None = None,
    ) -> None:
        self.api_key = (api_key if api_key is not None else FISH_API_KEY).strip()
        self.model = (model or FISH_MODEL or "s2.1-pro").strip()
        self.latency = (latency or FISH_LATENCY or "balanced").strip()
        self.audio_format = (audio_format or FISH_FORMAT or "pcm").strip()
        self.sample_rate = int(sample_rate or FISH_SAMPLE_RATE or 44100)
        self._sdk: Any = None
        self._http: httpx.AsyncClient | None = None

    async def aclose(self) -> None:
        sdk = self._sdk
        http = self._http
        self._sdk = None
        self._http = None
        if sdk is not None:
            close = getattr(sdk, "aclose", None) or getattr(sdk, "close", None)
            if close is not None:
                result = close()
                if hasattr(result, "__await__"):
                    await result
                http = None
        if http is not None and not http.is_closed:
            await http.aclose()

    def ready(self) -> bool:
        return bool(self.api_key)

    def _client(self) -> Any:
        if not self.api_key:
            raise RuntimeError("FISH_API_KEY is not set")
        if self._sdk is None:
            from fishaudio import AsyncFishAudio

            params = inspect.signature(AsyncFishAudio.__init__).parameters
            if "httpx_client" in params:
                self._http = httpx.AsyncClient(
                    base_url=FISH_API_BASE,
                    timeout=_TTS_TIMEOUT,
                    limits=_TTS_LIMITS,
                    trust_env=False,
                )
                self._sdk = AsyncFishAudio(api_key=self.api_key, httpx_client=self._http)
            else:
                self._sdk = AsyncFishAudio(api_key=self.api_key)
        return self._sdk

    async def warm(self) -> None:
        if not self.api_key:
            return
        try:
            client = self._client()
            wrapper = getattr(client, "_client_wrapper", None)
            http = getattr(wrapper, "client", None) if wrapper is not None else self._http
            if http is None:
                return
            await http.get("/", timeout=3.0)
        except Exception:
            logger.info("[TTS] http warmup skipped")

    async def _reset_sdk(self) -> None:
        try:
            await self.aclose()
        except Exception:
            self._sdk = None
            self._http = None

    def voice_for(
        self,
        role: str,
        *,
        gender: str | None = None,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> tuple[str | None, list[Any] | None]:
        from fishaudio.types import ReferenceAudio

        role_key = "operator" if role == "operator" else "victim"
        ref_id = (reference_id or "").strip()
        if not ref_id:
            if role_key == "operator":
                ref_id = FISH_OPERATOR_REFERENCE_ID
            elif (gender or "").lower() == "male":
                ref_id = FISH_VICTIM_MALE_REFERENCE_ID or FISH_VICTIM_REFERENCE_ID
            else:
                ref_id = FISH_VICTIM_FEMALE_REFERENCE_ID or FISH_VICTIM_REFERENCE_ID
        if not ref_id:
            ref_id = FISH_REFERENCE_ID
        if ref_id:
            return ref_id, None

        audio_raw = reference_audio
        text = (reference_text or "").strip()
        if audio_raw is None:
            audio_raw = FISH_OPERATOR_REFERENCE_AUDIO if role_key == "operator" else FISH_VICTIM_REFERENCE_AUDIO
        if not audio_raw:
            audio_raw = FISH_REFERENCE_AUDIO
        if not text:
            text = FISH_OPERATOR_REFERENCE_TEXT if role_key == "operator" else FISH_VICTIM_REFERENCE_TEXT
        if not text:
            text = FISH_REFERENCE_TEXT
        if not audio_raw:
            return None, None

        if isinstance(audio_raw, bytes):
            payload = audio_raw
        else:
            path = _resolve_path(str(audio_raw))
            if path is None or not path.is_file():
                raise ValueError(f"reference audio not found: {audio_raw}")
            payload = path.read_bytes()
        if not text:
            raise ValueError("reference_text is required for zero-shot cloning")
        return None, [ReferenceAudio(audio=payload, text=text)]

    def _config(self, reference_id: str | None, references: list[Any] | None, speed: float | None) -> Any:
        from fishaudio.types import Prosody, TTSConfig

        fields: dict[str, Any] = {
            "latency": self.latency or "balanced",
            "format": self.audio_format,
            "chunk_length": 100,
            "min_chunk_length": 20,
            "temperature": 0.5,
            "top_p": 0.65,
            "normalize": False,
            "condition_on_previous_chunks": False,
        }
        if self.audio_format == "pcm":
            fields["sample_rate"] = self.sample_rate
        if reference_id:
            fields["reference_id"] = reference_id
        if references:
            fields["references"] = references
        if speed is not None and 1.02 <= speed <= 1.15:
            fields["prosody"] = Prosody(speed=speed)
        return TTSConfig(**fields)

    async def _audio_frames(self, raw_chunks: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
        pending = b""
        first = True
        first_min = max(2, int(self.sample_rate * 0.004) * 2)
        next_min = max(first_min, int(self.sample_rate * 0.012) * 2)
        async for chunk in raw_chunks:
            if not chunk:
                continue
            if self.audio_format != "pcm" or chunk[:4] == b"RIFF":
                yield chunk
                continue
            pending += chunk
            even = len(pending) - (len(pending) % 2)
            min_bytes = first_min if first else next_min
            if even < min_bytes:
                continue
            first = False
            pcm, pending = pending[:even], pending[even:]
            framed = pcm16_to_wav(pcm, self.sample_rate)
            if framed:
                yield framed
        if self.audio_format == "pcm" and len(pending) >= 2:
            framed = pcm16_to_wav(pending[: len(pending) - (len(pending) % 2)], self.sample_rate)
            if framed:
                yield framed

    async def _iter_raw_audio(
        self,
        client: Any,
        tagged: str,
        ref_id: str | None,
        refs: list[Any] | None,
        config: Any,
    ) -> AsyncIterator[bytes]:
        wrapper = getattr(client, "_client_wrapper", None)
        http = getattr(wrapper, "client", None) if wrapper is not None else None
        if http is not None and hasattr(http, "send") and hasattr(http, "build_request"):
            async for chunk in self._stream_http(http, wrapper, tagged, config):
                yield chunk
            return
        stream = client.tts.stream(
            text=tagged,
            reference_id=ref_id,
            references=refs,
            format=self.audio_format,
            latency=self.latency,
            config=config,
            model=self.model,
        )
        if hasattr(stream, "__await__"):
            stream = await stream
        async for chunk in stream:
            if chunk:
                yield chunk

    async def _stream_http(
        self,
        http: httpx.AsyncClient,
        wrapper: Any,
        tagged: str,
        config: Any,
    ) -> AsyncIterator[bytes]:
        import ormsgpack
        from fishaudio.exceptions import APIError

        payload = config.model_dump(exclude_none=True)
        payload["text"] = tagged
        extra = {"Content-Type": "application/msgpack", "model": self.model}
        get_headers = getattr(wrapper, "get_headers", None)
        headers = get_headers(extra) if callable(get_headers) else extra
        request = http.build_request(
            "POST",
            "/v1/tts",
            headers=headers,
            content=ormsgpack.packb(payload),
            timeout=_TTS_TIMEOUT,
        )
        response = await http.send(request, stream=True)
        try:
            status = getattr(response, "status_code", 200)
            ok = getattr(response, "is_success", status < 400)
            if not ok:
                body = (await response.aread()).decode("utf-8", "replace")
                raise APIError(status, body[:280], body)
            async for chunk in response.aiter_bytes():
                if chunk:
                    yield chunk
        finally:
            await response.aclose()

    async def stream_text(
        self,
        text: str,
        *,
        role: str = "operator",
        emotion: str | None = None,
        gender: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> AsyncIterator[bytes]:
        tagged = apply_fish_prosody(text, role=role, emotion=emotion, gender=gender)
        if not tagged:
            return
        logger.info("[VOICE LATENCY] T7_fish_req role=%s", role)
        started = time.perf_counter()
        first = True
        ref_id, refs = self.voice_for(
            role,
            gender=gender,
            reference_id=reference_id,
            reference_audio=reference_audio,
            reference_text=reference_text,
        )
        pace = speed if (emotion or "").strip().lower() == "dispatch" else None
        config = self._config(ref_id, refs, pace)
        client = self._client()
        try:
            raw = self._iter_raw_audio(client, tagged, ref_id, refs, config)
            async for framed in self._audio_frames(raw):
                if first:
                    first = False
                    logger.info(
                        "[VOICE LATENCY] T8_fish_audio=%.3f role=%s",
                        time.perf_counter() - started,
                        role,
                    )
                yield framed
        except Exception:
            await self._reset_sdk()
            raise

    async def stream_llm(
        self,
        chunks: AsyncIterator[str],
        *,
        role: str = "operator",
        emotion: str | None = None,
        gender: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> AsyncIterator[bytes]:
        ref_id, refs = self.voice_for(
            role,
            gender=gender,
            reference_id=reference_id,
            reference_audio=reference_audio,
            reference_text=reference_text,
        )
        config = self._config(ref_id, refs, speed)

        async def tagged_chunks() -> AsyncIterator[str]:
            first = True
            async for piece in chunks:
                text = piece or ""
                if not text:
                    continue
                if first:
                    first = False
                    text = apply_fish_prosody(text, role=role, emotion=emotion, gender=gender)
                if text:
                    yield text

        client = self._client()
        audio = client.tts.stream_websocket(
            tagged_chunks(),
            reference_id=ref_id,
            references=refs,
            format=self.audio_format,
            latency=self.latency,
            config=config,
            model=self.model,
        )
        if hasattr(audio, "__await__") and not hasattr(audio, "__aiter__"):
            audio = await audio

        async def _raw() -> AsyncIterator[bytes]:
            async for chunk in audio:
                if chunk:
                    yield chunk

        try:
            async for framed in self._audio_frames(_raw()):
                yield framed
        except Exception:
            await self._reset_sdk()
            raise

    async def speak(
        self,
        source: str | AsyncIterator[str],
        *,
        role: str = "operator",
        emotion: str | None = None,
        gender: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> AsyncIterator[bytes]:
        kwargs = {
            "role": role,
            "emotion": emotion,
            "gender": gender,
            "speed": speed,
            "reference_id": reference_id,
            "reference_audio": reference_audio,
            "reference_text": reference_text,
        }
        if isinstance(source, str):
            async for chunk in self.stream_text(source, **kwargs):
                yield chunk
            return
        async for chunk in self.stream_llm(source, **kwargs):
            yield chunk
