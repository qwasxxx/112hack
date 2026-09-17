from __future__ import annotations

import asyncio
import io
import logging
import threading
import time
from collections.abc import AsyncIterator
from typing import Any

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

from sys112_tts.config import (
    TTS_LANGUAGE,
    TTS_SAMPLE_RATE,
    TTS_SILERO_ONNX,
    TTS_SILERO_PT,
    TTS_THREADS,
)
from sys112_tts.text import normalize_text, split_sentences
from sys112_tts.voices import list_voice_ids, resolve_profile

logger = logging.getLogger("sys112_tts")


def _to_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    audio = np.asarray(samples, dtype=np.float32).reshape(-1)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1.0:
        audio = audio / peak
    pcm = np.clip(audio * 32767.0, -32768, 32767).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, sample_rate, pcm)
    return buffer.getvalue()


def _apply_speed(samples: np.ndarray, speed: float) -> np.ndarray:
    rate = float(speed)
    if rate <= 0.05 or abs(rate - 1.0) < 0.02:
        return samples.astype(np.float32)
    up = 100
    down = max(1, int(round(100 * rate)))
    return resample_poly(samples, up, down).astype(np.float32)


class SileroOnnxEngine:
    _instance: SileroOnnxEngine | None = None
    _ctor_lock = threading.Lock()

    def __new__(cls) -> SileroOnnxEngine:
        if cls._instance is None:
            with cls._ctor_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self._model: Any = None
        self._session: Any = None
        self._lock = threading.Lock()
        self.status = "loading"
        self.backend = "silero-onnx"
        self.error: str | None = None
        self.sample_rate = TTS_SAMPLE_RATE

    def load(self) -> None:
        if self._model is not None or self._session is not None:
            self.status = "ready"
            return
        try:
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = TTS_THREADS
            opts.inter_op_num_threads = max(1, TTS_THREADS // 2)
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            if TTS_SILERO_ONNX.is_file() and TTS_SILERO_ONNX.stat().st_size > 1_000_000:
                self._session = ort.InferenceSession(
                    str(TTS_SILERO_ONNX),
                    sess_options=opts,
                    providers=["CPUExecutionProvider"],
                )
                self.backend = "silero-onnx"
                self.status = "ready"
                logger.info("[TTS] ONNX session ready %s", TTS_SILERO_ONNX)
                return
        except Exception:
            logger.exception("[TTS] ONNX session not used, loading Silero package")
        self._load_package()

    def _load_package(self) -> None:
        from sys112_tts.download import ensure_silero_model

        path = ensure_silero_model()
        import torch

        torch.set_num_threads(TTS_THREADS)
        torch.set_num_interop_threads(max(1, TTS_THREADS // 2))
        importer = torch.package.PackageImporter(str(path))
        self._model = importer.load_pickle("tts_models", "model")
        self.backend = "silero-v4"
        self.status = "ready"
        logger.info("[TTS] Silero v4 ready file=%s threads=%s", path, TTS_THREADS)

    def ready(self) -> bool:
        return self.status == "ready" and (self._model is not None or self._session is not None)

    def _synth_numpy(self, text: str, speaker: str, speed: float) -> np.ndarray:
        if self._model is None:
            raise RuntimeError("Silero model is not loaded")
        with self._lock:
            wav = self._model.apply_tts(
                text=text,
                speaker=speaker,
                sample_rate=self.sample_rate,
                put_accent=True,
                put_yo=True,
            )
        audio = np.asarray(wav, dtype=np.float32).reshape(-1)
        return _apply_speed(audio, speed)

    def synthesize_sentence(self, text: str, speaker: str, speed: float) -> bytes:
        return _to_wav_bytes(self._synth_numpy(text, speaker, speed), self.sample_rate)

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        emotion: str | None = None,
        conversation_role: str | None = None,
        ambient_type: str | None = None,
        random_sfx: bool = False,
        role: str | None = None,
    ) -> AsyncIterator[bytes]:
        del ambient_type, random_sfx
        cleaned = normalize_text(text)
        if not cleaned:
            raise ValueError("text is empty")
        if self._model is None and self._session is None:
            await asyncio.to_thread(self.load)
        profile = resolve_profile(role, emotion, conversation_role, voice_id)
        speaker = str(profile["speaker"])
        speed = float(profile["speed"])
        sentences = split_sentences(cleaned)
        started = time.perf_counter()
        first = True
        logger.info(
            "[TTS] Synthesize backend=%s speaker=%s speed=%s sentences=%s chars=%s",
            self.backend,
            speaker,
            speed,
            len(sentences),
            sum(len(item) for item in sentences),
        )
        for index, sentence in enumerate(sentences, start=1):
            chunk = await asyncio.to_thread(self.synthesize_sentence, sentence, speaker, speed)
            if first:
                logger.info(
                    "[TTS] Time-To-Audio %.3fs backend=%s speaker=%s sentence=%s/%s bytes=%s",
                    time.perf_counter() - started,
                    self.backend,
                    speaker,
                    index,
                    len(sentences),
                    len(chunk),
                )
                first = False
            if chunk:
                yield chunk

    async def synthesize_with_emotion(
        self,
        text: str,
        voice_id: str | None = None,
        emotion: str | None = None,
        conversation_role: str | None = None,
        ambient_type: str | None = None,
        random_sfx: bool = False,
        role: str | None = None,
    ) -> bytes:
        parts = [
            chunk
            async for chunk in self.synthesize_stream(
                text,
                voice_id,
                emotion,
                conversation_role,
                ambient_type,
                random_sfx,
                role,
            )
        ]
        if not parts:
            raise RuntimeError("TTS returned empty audio")
        return parts[0] if len(parts) == 1 else parts[0]

    async def synthesize(
        self,
        text: str,
        voice_id: str | None = None,
        emotion: str | None = None,
        conversation_role: str | None = None,
        ambient_type: str | None = None,
        random_sfx: bool = False,
        role: str | None = None,
    ) -> tuple[bytes, str]:
        audio = await self.synthesize_with_emotion(
            text,
            voice_id,
            emotion,
            conversation_role,
            ambient_type,
            random_sfx,
            role,
        )
        return audio, "audio/wav"

    def health(self) -> dict[str, Any]:
        return {
            "status": "ready" if self.ready() else self.status,
            "tts": "ready" if self.ready() else self.status,
            "backend": self.backend,
            "model": "silero-v4-ru",
            "local": True,
            "language": TTS_LANGUAGE,
            "voices": list_voice_ids(),
            "speakers": ["kseniya", "xenia", "baya", "aidar", "eugene"],
            "error": self.error,
        }


engine = SileroOnnxEngine()
TTSEngine = SileroOnnxEngine
