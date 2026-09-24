from __future__ import annotations

import logging
import re
import struct
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

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
    FISH_VICTIM_REFERENCE_ID,
    FISH_VICTIM_REFERENCE_TEXT,
    REPO_ROOT,
)

logger = logging.getLogger("sys112_tts")

DISPATCH_PREFIX = "[serious] [professional broadcast tone] [clear speech] "
VICTIM_PREFIX = "[anxious] [rushed] [clear speech] "
_PANIC = {"panic", "panic_high", "fear", "scared", "panic_crying", "victim_panic", "victim_scared"}
_ANGRY = {"angry", "anger", "rage"}
_CRYING = {"crying", "sad", "confused"}
_ANGRY_PREFIX = "[angry] [shouting] [harsh] [clear speech] "
_CRYING_PREFIX = "[crying] [sad] [trembling] [clear speech] "
_SPACES = re.compile(r"\s+")


def apply_fish_prosody(text: str, *, role: str = "operator", emotion: str | None = None) -> str:
    body = (text or "").strip()
    if not body:
        return ""
    if body.startswith("["):
        return body
    body = body.replace("...", " [pause] ").replace("…", " [pause] ")
    body = _SPACES.sub(" ", body).strip()
    emo = (emotion or "").strip().lower()
    if emo in _ANGRY:
        prefix = _ANGRY_PREFIX
    elif emo in _CRYING:
        prefix = _CRYING_PREFIX
    elif role == "victim" or emo in _PANIC:
        prefix = VICTIM_PREFIX
    else:
        prefix = DISPATCH_PREFIX
    return prefix + body


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

    def ready(self) -> bool:
        return bool(self.api_key)

    def _client(self) -> Any:
        if not self.api_key:
            raise RuntimeError("FISH_API_KEY is not set")
        if self._sdk is None:
            from fishaudio import AsyncFishAudio

            self._sdk = AsyncFishAudio(api_key=self.api_key)
        return self._sdk

    def voice_for(
        self,
        role: str,
        *,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> tuple[str | None, list[Any] | None]:
        from fishaudio.types import ReferenceAudio

        role_key = "operator" if role == "operator" else "victim"
        ref_id = (reference_id or "").strip()
        if not ref_id:
            ref_id = FISH_OPERATOR_REFERENCE_ID if role_key == "operator" else FISH_VICTIM_REFERENCE_ID
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
        }
        if self.audio_format == "pcm":
            fields["sample_rate"] = self.sample_rate
        if reference_id:
            fields["reference_id"] = reference_id
        if references:
            fields["references"] = references
        if speed is not None and abs(speed - 1.0) > 0.01:
            fields["prosody"] = Prosody(speed=speed)
        return TTSConfig(**fields)

    async def _audio_frames(self, raw_chunks: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
        pending = b""
        async for chunk in raw_chunks:
            if not chunk:
                continue
            if self.audio_format != "pcm" or chunk[:4] == b"RIFF":
                yield chunk
                continue
            pending += chunk
            even = len(pending) - (len(pending) % 2)
            if even < 2:
                continue
            pcm, pending = pending[:even], pending[even:]
            framed = pcm16_to_wav(pcm, self.sample_rate)
            if framed:
                yield framed
        if self.audio_format == "pcm" and len(pending) >= 2:
            framed = pcm16_to_wav(pending[: len(pending) - (len(pending) % 2)], self.sample_rate)
            if framed:
                yield framed

    async def stream_text(
        self,
        text: str,
        *,
        role: str = "operator",
        emotion: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> AsyncIterator[bytes]:
        tagged = apply_fish_prosody(text, role=role, emotion=emotion)
        if not tagged:
            return
        ref_id, refs = self.voice_for(
            role,
            reference_id=reference_id,
            reference_audio=reference_audio,
            reference_text=reference_text,
        )
        config = self._config(ref_id, refs, speed)
        client = self._client()
        stream = client.tts.stream(
            text=tagged,
            reference_id=ref_id,
            references=refs,
            format=self.audio_format,
            latency=self.latency,
            speed=speed,
            config=config,
            model=self.model,
        )
        if hasattr(stream, "__await__"):
            stream = await stream

        async def _raw() -> AsyncIterator[bytes]:
            async for chunk in stream:
                if chunk:
                    yield chunk

        async for framed in self._audio_frames(_raw()):
            yield framed

    async def stream_llm(
        self,
        chunks: AsyncIterator[str],
        *,
        role: str = "operator",
        emotion: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> AsyncIterator[bytes]:
        ref_id, refs = self.voice_for(
            role,
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
                    text = apply_fish_prosody(text, role=role, emotion=emotion)
                if text:
                    yield text

        client = self._client()
        audio = client.tts.stream_websocket(
            tagged_chunks(),
            reference_id=ref_id,
            references=refs,
            format=self.audio_format,
            latency=self.latency,
            speed=speed,
            config=config,
            model=self.model,
        )
        if hasattr(audio, "__await__") and not hasattr(audio, "__aiter__"):
            audio = await audio

        async def _raw() -> AsyncIterator[bytes]:
            async for chunk in audio:
                if chunk:
                    yield chunk

        async for framed in self._audio_frames(_raw()):
            yield framed

    async def speak(
        self,
        source: str | AsyncIterator[str],
        *,
        role: str = "operator",
        emotion: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> AsyncIterator[bytes]:
        kwargs = {
            "role": role,
            "emotion": emotion,
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
