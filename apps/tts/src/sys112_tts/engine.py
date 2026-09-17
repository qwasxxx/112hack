from __future__ import annotations

import asyncio
import io
import logging
import threading
import time
from collections.abc import AsyncIterator
from typing import Any
import numpy as np
import onnxruntime as ort
from scipy.io import wavfile

from sys112_tts.config import (
    TTS_LANGUAGE,
    TTS_SAMPLE_RATE,
    TTS_SILERO_ONNX,
    TTS_SILERO_PT,
    TTS_THREADS,
)
from sys112_tts.download import ensure_silero_model
from sys112_tts.text import normalize_text, split_sentences
from sys112_tts.voices import list_voice_ids, resolve_profile

logger = logging.getLogger("sys112_tts")


EDGE_VOICES = {
    "kseniya": ("ru-RU-SvetlanaNeural", "+6%"),
    "baya": ("ru-RU-SvetlanaNeural", "-4%"),
    "xenia": ("ru-RU-SvetlanaNeural", "+0%"),
    "aidar": ("ru-RU-DmitryNeural", "+0%"),
    "eugene": ("ru-RU-DmitryNeural", "-4%"),
}


def _session_options() -> ort.SessionOptions:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = TTS_THREADS
    opts.inter_op_num_threads = max(1, TTS_THREADS // 2)
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.enable_mem_pattern = True
    opts.enable_cpu_mem_arena = True
    return opts


def _trim_silence(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    audio = np.asarray(samples, dtype=np.float32).reshape(-1)
    if audio.size == 0:
        return audio
    window = max(1, int(sample_rate * 0.016))
    envelope = np.convolve(np.abs(audio), np.ones(window) / window, mode="same")
    mask = envelope > 0.01
    if not np.any(mask):
        return audio
    idx = np.flatnonzero(mask)
    pad = int(sample_rate * 0.05)
    start = max(0, int(idx[0]) - pad)
    end = min(audio.size, int(idx[-1]) + pad)
    return audio[start:end]


def _humanize(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    audio = np.asarray(samples, dtype=np.float32).reshape(-1)
    if audio.size == 0:
        return audio
    fade = max(1, int(sample_rate * 0.008))
    if audio.size > fade * 2:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        audio[:fade] *= ramp
        audio[-fade:] *= ramp[::-1]
    peak = float(np.max(np.abs(audio)))
    if peak > 1e-6:
        audio = audio * (0.9 / peak)
    return audio


def _to_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    audio = _humanize(_trim_silence(samples, sample_rate), sample_rate)
    pcm = np.clip(audio * 32767.0, -32768, 32767).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, sample_rate, pcm)
    return buffer.getvalue()


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
        self._session: ort.InferenceSession | None = None
        self._accentor: Any = None
        self._edge_ready: bool | None = None
        self._lock = threading.Lock()
        self.status = "loading"
        self.backend = "silero-onnx"
        self.error: str | None = None
        self.sample_rate = TTS_SAMPLE_RATE

    def load(self) -> None:
        with self._lock:
            if self.ready():
                return
            try:
                self._load_unlocked()
            except Exception as exc:
                self.status = "not_ready"
                self.error = str(exc)
                logger.exception("[TTS] Silero load failed")
                raise

    def _load_unlocked(self) -> None:
        opts = _session_options()
        if TTS_SILERO_ONNX.is_file() and TTS_SILERO_ONNX.stat().st_size > 1_000_000:
            self._session = ort.InferenceSession(
                str(TTS_SILERO_ONNX),
                sess_options=opts,
                providers=["CPUExecutionProvider"],
            )
            self.backend = "silero-onnx"
            self._load_accentor()
            self.status = "ready"
            logger.info("[TTS] ONNX Runtime session ready file=%s threads=%s", TTS_SILERO_ONNX, TTS_THREADS)
            return
        path = ensure_silero_model(TTS_SILERO_PT)
        import torch

        torch.set_num_threads(TTS_THREADS)
        try:
            torch.set_num_interop_threads(max(1, TTS_THREADS // 2))
        except RuntimeError:
            pass
        torch._C._jit_set_profiling_mode(False)
        importer = torch.package.PackageImporter(str(path))
        self._model = importer.load_pickle("tts_models", "model")
        if hasattr(self._model, "unpack_q_model"):
            self._model.unpack_q_model()
        self.backend = "silero-onnx-v4"
        self._load_accentor()
        self._warmup_unlocked(torch)
        self.status = "ready"
        self.error = None
        logger.info(
            "[TTS] Silero v4 ready file=%s onnxruntime=%s threads=%s sr=%s",
            path,
            ort.__version__,
            TTS_THREADS,
            self.sample_rate,
        )

    def _warmup_unlocked(self, torch: Any) -> None:
        started = time.perf_counter()
        profiles = ("kseniya", "baya", "aidar")
        with torch.inference_mode():
            for speaker in profiles:
                self._model.apply_tts(
                    text="Да, я вас слушаю.",
                    speaker=speaker,
                    sample_rate=self.sample_rate,
                    put_accent=True,
                    put_yo=True,
                )
        logger.info("[TTS] Warmup %.3fs speakers=%s", time.perf_counter() - started, len(profiles))

    def _load_accentor(self) -> None:
        try:
            from silero_stress import load_accentor

            self._accentor = load_accentor()
            logger.info("[TTS] silero-stress accentor ready")
        except Exception:
            self._accentor = None
            logger.exception("[TTS] silero-stress unavailable")

    def _accent(self, text: str) -> str:
        if self._accentor is None:
            return text
        marked = self._accentor(text)
        if not isinstance(marked, str) or not marked.strip():
            return text
        return marked.strip()

    async def _edge_audio(self, text: str, speaker: str) -> bytes:
        if self._edge_ready is False:
            raise RuntimeError("edge-tts disabled")
        import edge_tts

        voice, rate = EDGE_VOICES.get(speaker, EDGE_VOICES["kseniya"])
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        parts: list[bytes] = []
        async for message in communicate.stream():
            if message.get("type") == "audio" and message.get("data"):
                parts.append(message["data"])
        audio = b"".join(parts)
        if len(audio) < 64:
            raise RuntimeError("edge-tts returned empty audio")
        self._edge_ready = True
        return audio

    def ready(self) -> bool:
        return self.status == "ready" and (self._model is not None or self._session is not None)

    def _synth_numpy(self, text: str, speaker: str, speed: float, pitch: str) -> np.ndarray:
        if self._session is not None and self._model is None:
            raise RuntimeError("Silero ONNX graph is present but has no compatible runner")
        if self._model is None:
            raise RuntimeError("Silero model is not loaded")
        import torch

        own_accent = self._accentor is None
        with torch.inference_mode():
            wav = self._model.apply_tts(
                text=self._accent(text) if not own_accent else text,
                speaker=speaker,
                sample_rate=self.sample_rate,
                put_accent=own_accent,
                put_yo=own_accent,
            )
        return np.asarray(wav.detach().cpu().numpy() if hasattr(wav, "detach") else wav, dtype=np.float32).reshape(-1)

    def synthesize_sentence(self, text: str, speaker: str, speed: float, pitch: str = "medium") -> bytes:
        with self._lock:
            return _to_wav_bytes(self._synth_numpy(text, speaker, speed, pitch), self.sample_rate)

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
        if not self.ready():
            await asyncio.to_thread(self.load)
        profile = resolve_profile(role, emotion, conversation_role, voice_id)
        speaker = str(profile["speaker"])
        speed = float(profile["speed"])
        pitch = str(profile.get("pitch") or "medium")
        sentences = split_sentences(cleaned)
        started = time.perf_counter()
        first = True
        for index, sentence in enumerate(sentences, start=1):
            used = "silero"
            try:
                chunk = await self._edge_audio(sentence, speaker)
                used = "edge-tts"
                self.backend = "edge-tts"
            except Exception as exc:
                self._edge_ready = False
                logger.warning("[TTS] edge-tts fallback to Silero: %s", exc)
                chunk = await asyncio.to_thread(self.synthesize_sentence, sentence, speaker, speed, pitch)
                used = "silero"
                self.backend = "silero-stress" if self._accentor is not None else "silero-onnx-v4"
            if first:
                logger.info(
                    "[TTS] Time-To-Audio %.1fms backend=%s speaker=%s sentence=%s/%s bytes=%s",
                    (time.perf_counter() - started) * 1000,
                    used,
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
        return parts[0]

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
            "model": "edge-tts-ru" if self.backend == "edge-tts" else "silero-v4-ru",
            "local": self.backend != "edge-tts",
            "accentor": "silero-stress" if self._accentor is not None else "silero-builtin",
            "language": TTS_LANGUAGE,
            "sample_rate": self.sample_rate,
            "voices": list_voice_ids(),
            "speakers": ["kseniya", "xenia", "baya", "aidar", "eugene"],
            "error": self.error,
        }


engine = SileroOnnxEngine()
TTSEngine = SileroOnnxEngine