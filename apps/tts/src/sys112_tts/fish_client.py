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
    FISH_VICTIM_FEMALE_REFERENCE_ID,
    FISH_VICTIM_MALE_REFERENCE_ID,
    FISH_VICTIM_REFERENCE_ID,
    FISH_VICTIM_REFERENCE_TEXT,
    REPO_ROOT,
)

logger = logging.getLogger("sys112_tts")

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
}
_TAG = re.compile(r"\[[^\[\]]{0,80}\]")
_SPACES = re.compile(r"\s+")
_SEVERE = re.compile(
    r"пожар|взрыв|горит|пламя|\bгаз\b|задых|без сознан|не могу дышать|умира|зажат",
    re.IGNORECASE,
)


def _mood(role: str, emotion: str | None) -> str:
    if role != "victim":
        return "calm"
    emo = (emotion or "").strip().lower()
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
    if role != "victim":
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
        from fishaudio.types import TTSConfig

        del speed
        fields: dict[str, Any] = {
            "latency": self.latency or "balanced",
            "format": self.audio_format,
            "chunk_length": 100,
            "temperature": 0.5,
            "top_p": 0.65,
            "normalize": False,
            "condition_on_previous_chunks": True,
        }
        if self.audio_format == "pcm":
            fields["sample_rate"] = self.sample_rate
        if reference_id:
            fields["reference_id"] = reference_id
        if references:
            fields["references"] = references
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
            if even < 8000:
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
        gender: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
        reference_audio: str | bytes | None = None,
        reference_text: str | None = None,
    ) -> AsyncIterator[bytes]:
        tagged = apply_fish_prosody(text, role=role, emotion=emotion, gender=gender)
        if not tagged:
            return
        ref_id, refs = self.voice_for(
            role,
            gender=gender,
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

        async for framed in self._audio_frames(_raw()):
            yield framed

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
