from __future__ import annotations

import asyncio
import inspect
import io
import logging
import os
import threading
import time
from collections.abc import AsyncIterator
from typing import Any
from xml.sax.saxutils import escape as xml_escape

import numpy as np
import torch
from scipy.io import wavfile

from sys112_tts.config import (
    TTS_DEVICE,
    TTS_LANGUAGE,
    TTS_MODEL_ID,
    TTS_SAMPLE_RATE,
    TTS_THREADS,
)
from sys112_tts.text import normalize_text, split_sentences
from sys112_tts.voices import CHARACTERS, list_voice_ids, resolve_profile, resolve_role

logger = logging.getLogger("sys112_tts")

EMOTIONS = {
    "operator_calm": {"rate": "1.0", "pitch": "medium", "volume": "medium"},
    "calm": {"rate": "1.0", "pitch": "medium", "volume": "medium"},
    "panic_high": {"rate": "1.12", "pitch": "medium", "volume": "medium"},
    "panic": {"rate": "1.12", "pitch": "medium", "volume": "medium"},
    "panic_crying": {"rate": "1.08", "pitch": "medium", "volume": "medium"},
    "victim_panic": {"rate": "1.12", "pitch": "medium", "volume": "medium"},
    "victim_scared": {"rate": "1.08", "pitch": "medium", "volume": "medium"},
}


def _rate_attr(speed: float) -> str:
    if abs(speed - 1.0) < 1e-6:
        return "1.0"
    text = f"{speed:.2f}".rstrip("0").rstrip(".")
    return text or "1.0"


def _ssml_rate_pitch(emotion: str | None, rate: float | str | None, pitch: str | None) -> tuple[str, str]:
    profile = EMOTIONS.get((emotion or "").strip().lower().replace("-", "_"), {})
    rate_value = _rate_attr(float(rate)) if rate is not None else str(profile.get("rate") or "1.0")
    pitch_value = pitch or str(profile.get("pitch") or "medium")
    return rate_value, pitch_value


def build_ssml(
    text: str,
    speaker: str,
    emotion: str | None = None,
    rate: float | str | None = None,
    pitch: str | None = None,
) -> str:
    rate_value, pitch_value = _ssml_rate_pitch(emotion, rate, pitch)
    body = xml_escape((text or "").strip())
    return (
        f'<speak><voice name="{xml_escape(speaker)}">'
        f'<prosody rate="{rate_value}" pitch="{pitch_value}">{body}</prosody>'
        f"</voice></speak>"
    )


def build_silero_ssml(
    text: str,
    emotion: str | None = None,
    rate: float | str | None = None,
    pitch: str | None = None,
) -> str:
    rate_value, pitch_value = _ssml_rate_pitch(emotion, rate, pitch)
    body = xml_escape((text or "").strip())
    return f'<speak><prosody rate="{rate_value}" pitch="{pitch_value}">{body}</prosody></speak>'


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


def _keyboard_samples(sample_rate: int) -> np.ndarray:
    rng = np.random.default_rng(112)
    audio = np.zeros(int(sample_rate * 0.42), dtype=np.float32)
    for delay in (0.03, 0.11, 0.18, 0.27, 0.34):
        start = int(delay * sample_rate)
        n = int(0.012 * sample_rate)
        click = rng.normal(0, 0.22, n).astype(np.float32)
        env = np.linspace(1.0, 0.0, n, dtype=np.float32) ** 3
        end = min(audio.size, start + n)
        audio[start:end] += click[: end - start] * env[: end - start]
    peak = float(np.max(np.abs(audio))) or 1.0
    return audio * (0.35 / peak)


def _to_numpy(wav: Any) -> np.ndarray:
    if hasattr(wav, "detach"):
        wav = wav.detach().cpu().numpy()
    return np.asarray(wav, dtype=np.float32).reshape(-1)


class SileroTTSEngine:
    _instance: SileroTTSEngine | None = None
    _ctor_lock = threading.Lock()

    def __new__(cls) -> SileroTTSEngine:
        if cls._instance is None:
            with cls._ctor_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self._wrapper: Any = None
        self._model: Any = None
        self._lock = threading.Lock()
        self._fillers: dict[str, np.ndarray] = {}
        self.status = "loading"
        self.backend = "silero-tts"
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
                logger.exception("[TTS] Silero TTS load failed")
                raise

    def _load_unlocked(self) -> None:
        torch.set_num_threads(TTS_THREADS)
        try:
            torch.set_num_interop_threads(max(1, TTS_THREADS // 2))
        except RuntimeError:
            pass
        self._model = self._init_silero()
        self._warmup_unlocked()
        self._prepare_fillers()
        self.backend = "silero-tts"
        self.status = "ready"
        self.error = None
        logger.info(
            "[TTS] SileroTTS ready model=%s device=%s threads=%s sr=%s speakers=%s",
            TTS_MODEL_ID,
            TTS_DEVICE,
            TTS_THREADS,
            self.sample_rate,
            ["aidar", "xenia", "eugene"],
        )

    def _init_silero(self) -> Any:
        from silero_tts.silero_tts import SileroTTS

        yml = os.path.join(os.path.dirname(inspect.getfile(SileroTTS)), "latest_silero_models.yml")
        try:
            SileroTTS.download_models_config_static(yml)
        except Exception:
            logger.warning("[TTS] Could not refresh Silero models.yml")
        try:
            self._wrapper = SileroTTS(
                language=TTS_LANGUAGE,
                model_id=TTS_MODEL_ID,
                speaker="aidar",
                sample_rate=self.sample_rate,
                device=TTS_DEVICE,
                num_threads=TTS_THREADS,
            )
            return self._wrapper.tts_model
        except Exception as exc:
            logger.warning("[TTS] SileroTTS(%s) failed: %s; torch.hub fallback", TTS_MODEL_ID, exc)
            self._wrapper = None
            model, _ = torch.hub.load(
                repo_or_dir="snakers4/silero-models",
                model="silero_tts",
                language=TTS_LANGUAGE,
                speaker=TTS_MODEL_ID,
                trust_repo=True,
            )
            model.to(torch.device(TTS_DEVICE))
            return model

    def _warmup_unlocked(self) -> None:
        started = time.perf_counter()
        for speaker in ("aidar", "xenia"):
            self._apply_tts("Да, я вас слушаю.", speaker, 1.0, "medium")
        logger.info("[TTS] Warmup %.3fs", time.perf_counter() - started)

    def _prepare_fillers(self) -> None:
        keyboard = _keyboard_samples(self.sample_rate)
        sigh = self._apply_tts("Мм...", "xenia", 1.0, "medium")
        self._fillers = {
            "operator": keyboard,
            "victim": sigh if sigh.size else keyboard,
        }

    def ready(self) -> bool:
        return self.status == "ready" and self._model is not None

    def _apply_tts(self, text: str, speaker: str, speed: float, pitch: str) -> np.ndarray:
        if self._model is None:
            raise RuntimeError("Silero model is not loaded")
        ssml = build_silero_ssml(text, rate=speed, pitch=pitch)
        used_ssml = True
        with torch.inference_mode():
            try:
                wav = self._model.apply_tts(
                    ssml_text=ssml,
                    speaker=speaker,
                    sample_rate=self.sample_rate,
                )
            except Exception:
                used_ssml = False
                wav = self._model.apply_tts(
                    text=text,
                    speaker=speaker,
                    sample_rate=self.sample_rate,
                    put_accent=True,
                    put_yo=True,
                )
        audio = _to_numpy(wav)
        if not used_ssml and abs(speed - 1.0) > 0.02:
            new_len = max(1, int(audio.size / speed))
            x_old = np.linspace(0.0, 1.0, audio.size, dtype=np.float32)
            x_new = np.linspace(0.0, 1.0, new_len, dtype=np.float32)
            audio = np.interp(x_new, x_old, audio).astype(np.float32)
        return audio

    def _play(self, samples: np.ndarray) -> None:
        try:
            import sounddevice as sd

            sd.stop()
            sd.play(np.asarray(samples, dtype=np.float32), self.sample_rate, blocking=False)
        except Exception as exc:
            logger.debug("[TTS] sounddevice skipped: %s", exc)

    def filler_wav(self, role: str | None = None) -> bytes:
        samples = self._fillers.get(resolve_role(role), _keyboard_samples(self.sample_rate))
        return _to_wav_bytes(samples, self.sample_rate)

    def play_filler(self, role: str | None = None) -> bytes:
        key = resolve_role(role)
        samples = self._fillers.get(key, _keyboard_samples(self.sample_rate))
        self._play(samples)
        return _to_wav_bytes(samples, self.sample_rate)

    def synthesize_role(
        self,
        text: str,
        role: str,
        play: bool = True,
        emotion: str | None = None,
        voice_id: str | None = None,
        gender: str | None = None,
    ) -> bytes:
        cleaned = normalize_text(text)
        if not cleaned:
            raise ValueError("text is empty")
        if not self.ready():
            self.load()
        profile = resolve_profile(role, emotion, role, voice_id, gender)
        speaker = str(profile["speaker"])
        speed = float(profile["speed"])
        pitch = str(profile["pitch"])
        sentences = split_sentences(cleaned)
        parts: list[np.ndarray] = []
        gap = np.zeros(int(self.sample_rate * 0.06), dtype=np.float32)
        with self._lock:
            for index, sentence in enumerate(sentences):
                parts.append(self._apply_tts(sentence, speaker, speed, pitch))
                if index < len(sentences) - 1:
                    parts.append(gap)
        audio = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
        if play:
            self._play(audio)
        logger.info(
            "[TTS] role=%s speaker=%s rate=%s chars=%s samples=%s",
            profile["role"],
            speaker,
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
            "model": TTS_MODEL_ID,
            "local": True,
            "language": TTS_LANGUAGE,
            "sample_rate": self.sample_rate,
            "voices": list_voice_ids(),
            "speakers": ["aidar", "xenia", "eugene"],
            "characters": {key: value["name"] for key, value in CHARACTERS.items()},
            "error": self.error,
        }


engine = SileroTTSEngine()
TTSEngine = SileroTTSEngine
SileroOnnxEngine = SileroTTSEngine
