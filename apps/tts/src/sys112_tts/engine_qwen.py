from __future__ import annotations

import logging
import threading
import time
from collections.abc import AsyncIterator
from typing import Any

import numpy as np
import torch

from sys112_tts.config import (
    TTS_DEVICE,
    TTS_LANGUAGE,
    TTS_QWEN_INSTRUCT_OPERATOR,
    TTS_QWEN_INSTRUCT_VICTIM,
    TTS_QWEN_MODEL,
    TTS_QWEN_OPERATOR_SPEAKER,
    TTS_QWEN_REF_AUDIO,
    TTS_QWEN_REF_TEXT,
    TTS_QWEN_VICTIM_SPEAKER,
    TTS_SAMPLE_RATE,
    TTS_THREADS,
)
from sys112_tts.engine_silero import (
    _keyboard_samples,
    _rate_attr,
    _to_numpy,
    _to_wav_bytes,
)
from sys112_tts.text import normalize_text
from sys112_tts.voices import CHARACTERS, list_voice_ids, resolve_profile, resolve_role

logger = logging.getLogger("sys112_tts")

_SILERO_TO_QWEN = {
    "aidar": TTS_QWEN_OPERATOR_SPEAKER,
    "eugene": "Ryan",
    "xenia": TTS_QWEN_VICTIM_SPEAKER,
    "kseniya": TTS_QWEN_VICTIM_SPEAKER,
    "baya": "Vivian",
}

_LANG = {
    "ru": "Russian",
    "en": "English",
    "zh": "Chinese",
}


def _qwen_language() -> str:
    return _LANG.get((TTS_LANGUAGE or "ru").strip().lower(), "Russian")


def _qwen_speaker(silero_speaker: str, role: str) -> str:
    mapped = _SILERO_TO_QWEN.get((silero_speaker or "").strip().lower())
    if mapped:
        return mapped
    return TTS_QWEN_OPERATOR_SPEAKER if role == "operator" else TTS_QWEN_VICTIM_SPEAKER


def _instruct_for(role: str, speed: float, emotion: str | None) -> str | None:
    emo = (emotion or "").strip().lower()
    if role == "operator":
        return TTS_QWEN_INSTRUCT_OPERATOR or None
    if emo in {"panic", "panic_high", "victim_panic", "fear"} or speed >= 1.1:
        return TTS_QWEN_INSTRUCT_VICTIM or "Speak in Russian, frightened and a bit rushed, as if calling 112."
    if emo in {"scared", "crying", "panic_crying", "victim_scared"}:
        return "Speak in Russian, quietly scared, almost crying."
    return TTS_QWEN_INSTRUCT_VICTIM or None


def _resample(audio: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    if samples.size == 0 or src_rate <= 0 or src_rate == dst_rate:
        return samples
    new_len = max(1, int(round(samples.size * dst_rate / src_rate)))
    x_old = np.linspace(0.0, 1.0, samples.size, dtype=np.float32)
    x_new = np.linspace(0.0, 1.0, new_len, dtype=np.float32)
    return np.interp(x_new, x_old, samples).astype(np.float32)


class Qwen3TTSEngine:
    _instance: Qwen3TTSEngine | None = None
    _ctor_lock = threading.Lock()

    def __new__(cls) -> Qwen3TTSEngine:
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
        self._lock = threading.Lock()
        self._fillers: dict[str, np.ndarray] = {}
        self.status = "loading"
        self.backend = "qwen3-tts"
        self.error: str | None = None
        self.sample_rate = TTS_SAMPLE_RATE
        self._native_rate = TTS_SAMPLE_RATE

    def load(self) -> None:
        with self._lock:
            if self.ready():
                return
            try:
                self._load_unlocked()
            except Exception as exc:
                self.status = "not_ready"
                self.error = str(exc)
                logger.exception("[TTS] Qwen3-TTS load failed")
                raise

    def _load_unlocked(self) -> None:
        torch.set_num_threads(TTS_THREADS)
        try:
            torch.set_num_interop_threads(max(1, TTS_THREADS // 2))
        except RuntimeError:
            pass
        self._model = self._init_qwen()
        self._warmup_unlocked()
        self._prepare_fillers()
        self.backend = "qwen3-tts"
        self.status = "ready"
        self.error = None
        logger.info(
            "[TTS] Qwen3-TTS ready model=%s device=%s threads=%s sr=%s",
            TTS_QWEN_MODEL,
            TTS_DEVICE,
            TTS_THREADS,
            self.sample_rate,
        )

    def _init_qwen(self) -> Any:
        from qwen_tts import Qwen3TTSModel

        kwargs: dict[str, Any] = {
            "device_map": "cpu" if TTS_DEVICE == "cpu" else TTS_DEVICE,
            "dtype": torch.float32,
        }
        try:
            return Qwen3TTSModel.from_pretrained(
                TTS_QWEN_MODEL,
                attn_implementation="sdpa",
                **kwargs,
            )
        except TypeError:
            return Qwen3TTSModel.from_pretrained(TTS_QWEN_MODEL, **kwargs)

    def _warmup_unlocked(self) -> None:
        started = time.perf_counter()
        self._apply_tts("Да, я вас слушаю.", TTS_QWEN_VICTIM_SPEAKER, "victim", 1.0, None)
        logger.info("[TTS] Qwen3 warmup %.3fs", time.perf_counter() - started)

    def _prepare_fillers(self) -> None:
        keyboard = _keyboard_samples(self.sample_rate)
        self._fillers = {"operator": keyboard, "victim": keyboard}

    def ready(self) -> bool:
        return self.status == "ready" and self._model is not None

    def _is_custom_voice(self) -> bool:
        return "customvoice" in TTS_QWEN_MODEL.lower()

    def _generate(self, text: str, speaker: str, instruct: str | None) -> tuple[np.ndarray, int]:
        if self._model is None:
            raise RuntimeError("Qwen3-TTS model is not loaded")
        language = _qwen_language()
        with torch.inference_mode():
            if self._is_custom_voice():
                wavs, sr = self._model.generate_custom_voice(
                    text=text,
                    language=language,
                    speaker=speaker,
                    instruct=instruct or None,
                )
            else:
                if not TTS_QWEN_REF_AUDIO:
                    raise RuntimeError(
                        "Base model needs TTS_QWEN_REF_AUDIO, or set TTS_QWEN_MODEL to "
                        "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
                    )
                wavs, sr = self._model.generate_voice_clone(
                    text=text,
                    language=language,
                    ref_audio=TTS_QWEN_REF_AUDIO,
                    ref_text=TTS_QWEN_REF_TEXT or text,
                )
        if isinstance(wavs, (list, tuple)):
            wav = wavs[0]
        else:
            wav = wavs
        return _to_numpy(wav), int(sr)

    def _apply_tts(
        self,
        text: str,
        speaker: str,
        role: str,
        speed: float,
        emotion: str | None,
    ) -> np.ndarray:
        qwen_speaker = _qwen_speaker(speaker, role)
        instruct = _instruct_for(role, speed, emotion)
        audio, native_rate = self._generate(text, qwen_speaker, instruct)
        self._native_rate = native_rate
        audio = _resample(audio, native_rate, self.sample_rate)
        if abs(speed - 1.0) > 0.02:
            new_len = max(1, int(audio.size / speed))
            x_old = np.linspace(0.0, 1.0, audio.size, dtype=np.float32)
            x_new = np.linspace(0.0, 1.0, new_len, dtype=np.float32)
            audio = np.interp(x_new, x_old, audio).astype(np.float32)
        return audio

    def filler_wav(self, role: str | None = None) -> bytes:
        samples = self._fillers.get(resolve_role(role), _keyboard_samples(self.sample_rate))
        return _to_wav_bytes(samples, self.sample_rate)

    def play_filler(self, role: str | None = None) -> bytes:
        return self.filler_wav(role)

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
        del play
        cleaned = normalize_text(text)
        if not cleaned:
            raise ValueError("text is empty")
        if not self.ready():
            self.load()
        profile = resolve_profile(role, emotion, role, voice_id, gender, pitch, speed)
        speaker = str(profile["speaker"])
        speed = float(profile["speed"])
        with self._lock:
            audio = self._apply_tts(cleaned, speaker, str(profile["role"]), speed, emotion)
        logger.info(
            "[TTS] backend=qwen3 role=%s speaker=%s qwen=%s rate=%s chars=%s samples=%s",
            profile["role"],
            speaker,
            _qwen_speaker(speaker, str(profile["role"])),
            _rate_attr(speed),
            len(cleaned),
            int(audio.size),
        )
        return _to_wav_bytes(audio, self.sample_rate)

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
    ) -> AsyncIterator[bytes]:
        import asyncio

        del ambient_type, random_sfx
        role_key = resolve_role(role, conversation_role, voice_id)
        started = time.perf_counter()
        chunk = await asyncio.to_thread(
            self.synthesize_role,
            text,
            role_key,
            False,
            emotion,
            voice_id,
            gender,
        )
        logger.info(
            "[TTS] Time-To-Audio %.1fms backend=%s role=%s bytes=%s",
            (time.perf_counter() - started) * 1000,
            self.backend,
            role_key,
            len(chunk),
        )
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
        gender: str | None = None,
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
                gender,
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
        gender: str | None = None,
    ) -> tuple[bytes, str]:
        audio = await self.synthesize_with_emotion(
            text,
            voice_id,
            emotion,
            conversation_role,
            ambient_type,
            random_sfx,
            role,
            gender,
        )
        return audio, "audio/wav"

    def health(self) -> dict[str, Any]:
        return {
            "status": "ready" if self.ready() else self.status,
            "tts": "ready" if self.ready() else self.status,
            "backend": self.backend,
            "model": TTS_QWEN_MODEL,
            "local": True,
            "language": TTS_LANGUAGE,
            "sample_rate": self.sample_rate,
            "voices": list_voice_ids(),
            "speakers": [TTS_QWEN_OPERATOR_SPEAKER, TTS_QWEN_VICTIM_SPEAKER],
            "characters": {key: value["name"] for key, value in CHARACTERS.items()},
            "error": self.error,
        }
