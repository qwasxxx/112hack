from __future__ import annotations

import logging
import threading
import time
from collections.abc import AsyncIterator
from typing import Any

from sys112_tts.config import FISH_MODEL, FISH_SAMPLE_RATE, TTS_LANGUAGE
from sys112_tts.fish_client import FishTTSClient, pcm16_to_wav
from sys112_tts.text import normalize_text
from sys112_tts.voices import list_voice_ids, resolve_profile, resolve_role

logger = logging.getLogger("sys112_tts")


class FishTTSEngine:
    _instance: FishTTSEngine | None = None
    _ctor_lock = threading.Lock()
    streaming = True

    def __new__(cls) -> FishTTSEngine:
        if cls._instance is None:
            with cls._ctor_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self._lock = threading.Lock()
        self.client = FishTTSClient()
        self.status = "loading"
        self.backend = "fish-audio"
        self.error: str | None = None
        self.sample_rate = self.client.sample_rate or FISH_SAMPLE_RATE

    def load(self) -> None:
        with self._lock:
            if self.client.ready():
                self.status = "ready"
                self.error = None
                self.backend = "fish-audio"
                try:
                    self.client._client()
                except Exception:
                    logger.exception("[TTS] Fish client init failed")
                logger.info(
                    "[TTS] Fish Audio ready model=%s latency=%s sr=%s",
                    self.client.model,
                    self.client.latency,
                    self.sample_rate,
                )
                return
            self.status = "not_ready"
            self.error = "FISH_API_KEY is not set"
            raise RuntimeError(self.error)

    def ready(self) -> bool:
        return self.client.ready()

    async def aclose(self) -> None:
        close = getattr(self.client, "aclose", None)
        if close is not None:
            await close()

    async def warm(self) -> None:
        warm = getattr(self.client, "warm", None)
        if warm is not None:
            await warm()

    def _profile(
        self,
        text: str,
        role: str | None,
        emotion: str | None,
        conversation_role: str | None,
        voice_id: str | None,
        gender: str | None,
        speed: float | None,
    ) -> tuple[str, str, float]:
        cleaned = normalize_text(text)
        if not cleaned:
            raise ValueError("text is empty")
        role_key = resolve_role(role, conversation_role, voice_id)
        profile = resolve_profile(role_key, emotion, conversation_role, voice_id, gender, None, speed)
        rate = float(profile["speed"])
        return cleaned, str(profile["role"]), rate

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        emotion: str | None = None,
        conversation_role: str | None = None,
        ambient_type: str | None = None,
        random_sfx: bool = False,
        role: str | None = None,
        gender: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
    ) -> AsyncIterator[bytes]:
        del ambient_type, random_sfx
        if not self.ready():
            self.load()
        cleaned, role_key, rate = self._profile(text, role, emotion, conversation_role, voice_id, gender, speed)
        started = time.perf_counter()
        first = True
        try:
            async for chunk in self.client.speak(
                cleaned,
                role=role_key,
                emotion=emotion,
                gender=gender,
                speed=rate,
                reference_id=reference_id,
            ):
                if first:
                    first = False
                    logger.info(
                        "[TTS] Time-To-Audio %.1fms backend=%s model=%s role=%s bytes=%s",
                        (time.perf_counter() - started) * 1000,
                        self.backend,
                        self.client.model,
                        role_key,
                        len(chunk),
                    )
                yield chunk
        except ValueError:
            raise
        except Exception as exc:
            logger.exception("[TTS] Fish synthesis failed")
            raise RuntimeError(f"Fish Audio synthesis failed: {exc}") from exc

    async def stream_from_llm(
        self,
        chunks: AsyncIterator[str],
        *,
        role: str = "victim",
        emotion: str | None = None,
        gender: str | None = None,
        speed: float | None = None,
        reference_id: str | None = None,
    ) -> AsyncIterator[bytes]:
        if not self.ready():
            self.load()
        role_key = resolve_role(role)
        profile = resolve_profile(role_key, emotion, None, None, None, None, speed)
        started = time.perf_counter()
        first = True
        async for chunk in self.client.speak(
            chunks,
            role=str(profile["role"]),
            emotion=emotion,
            gender=gender,
            speed=float(profile["speed"]),
            reference_id=reference_id,
        ):
            if first:
                first = False
                logger.info(
                    "[TTS] Time-To-Audio %.1fms backend=%s model=%s role=%s bytes=%s",
                    (time.perf_counter() - started) * 1000,
                    self.backend,
                    self.client.model,
                    profile["role"],
                    len(chunk),
                )
            yield chunk

    def synthesize_role(
        self,
        text: str,
        role: str,
        play: bool = True,
        emotion: str | None = None,
        voice_id: str | None = None,
        gender: str | None = None,
        pitch: str | None = None,
        speed: float | None = None,
    ) -> bytes:
        del play, pitch
        import asyncio

        async def _collect() -> bytes:
            pcm = bytearray()
            encoded = bytearray()
            async for chunk in self.synthesize_stream(
                text,
                voice_id,
                emotion,
                role,
                None,
                False,
                role,
                gender,
                speed,
            ):
                if len(chunk) > 44 and chunk[:4] == b"RIFF":
                    pcm.extend(chunk[44:])
                else:
                    encoded.extend(chunk)
            if pcm:
                return pcm16_to_wav(bytes(pcm), self.sample_rate)
            if encoded:
                return bytes(encoded)
            raise RuntimeError("Fish Audio returned empty audio")

        return asyncio.run(_collect())

    def health(self) -> dict[str, Any]:
        ready = self.ready()
        return {
            "status": "ready" if ready else self.status,
            "tts": "ready" if ready else self.status,
            "backend": self.backend,
            "model": self.client.model or FISH_MODEL,
            "local": False,
            "language": TTS_LANGUAGE,
            "sample_rate": self.sample_rate,
            "latency": self.client.latency,
            "voices": list_voice_ids(),
            "error": None if ready else (self.error or "FISH_API_KEY is not set"),
        }
