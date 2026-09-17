from __future__ import annotations

import io
import logging
import random
import wave
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, resample_poly, sosfilt

from sys112_tts.config import AMBIENT_TYPES, TTS_AMBIENT_DIR

logger = logging.getLogger("sys112_tts")

BANDPASS_LOW_HZ = 300
BANDPASS_HIGH_HZ = 3400
TELEPHONE_RATE = 8000
AMBIENT_DB_MIN = -22.0
AMBIENT_DB_MAX = -18.0
TARGET_RATE = 24000

AMBIENT_ALIASES: dict[str, str] = {
    "traffic_siren": "traffic_siren",
    "traffic": "traffic_siren",
    "siren": "traffic_siren",
    "car_crash": "car_crash",
    "crash": "car_crash",
    "kaza": "car_crash",
    "crowd_panic": "crowd_panic",
    "crowd": "crowd_panic",
    "panic_crowd": "crowd_panic",
    "phone_static": "phone_static",
    "static": "phone_static",
    "phone": "phone_static",
    "noise": "phone_static",
}


def resolve_ambient_type(raw: str | None) -> str | None:
    key = (raw or "").strip().lower().replace("-", "_")
    if not key or key in {"none", "off", "false", "0"}:
        return None
    return AMBIENT_ALIASES.get(key)


def _db_to_gain(db: float) -> float:
    return float(10 ** (db / 20.0))


def _to_mono_float(samples: np.ndarray) -> np.ndarray:
    audio = np.asarray(samples, dtype=np.float32)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    if audio.dtype != np.float32:
        audio = audio.astype(np.float32)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1.5:
        audio = audio / 32768.0
    return np.clip(audio, -1.0, 1.0)


def _read_wav_bytes(data: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(data), "rb") as handle:
        rate = handle.getframerate()
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        frames = handle.readframes(handle.getnframes())
    if width == 2:
        samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    else:
        samples = np.frombuffer(frames, dtype=np.uint8).astype(np.float32)
        samples = (samples - 128.0) / 128.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples.astype(np.float32), rate


def _ffmpeg_bin() -> str:
    import shutil

    found = shutil.which("ffmpeg")
    if found:
        return found
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def _decode_mp3(data: bytes) -> tuple[np.ndarray, int]:
    import subprocess

    proc = subprocess.run(
        [
            _ffmpeg_bin(),
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-ac",
            "1",
            "-ar",
            str(TARGET_RATE),
            "-f",
            "wav",
            "pipe:1",
        ],
        input=data,
        capture_output=True,
        check=True,
    )
    if not proc.stdout:
        raise RuntimeError(proc.stderr.decode("utf-8", "ignore") or "ffmpeg returned empty wav")
    return _read_wav_bytes(proc.stdout)


def _decode_speech(data: bytes) -> tuple[np.ndarray, int]:
    if data[:4] == b"RIFF":
        return _read_wav_bytes(data)
    return _decode_mp3(data)


def _resample(samples: np.ndarray, src_rate: int, dest_rate: int) -> np.ndarray:
    if src_rate == dest_rate or samples.size == 0:
        return samples.astype(np.float32)
    return resample_poly(samples, dest_rate, src_rate).astype(np.float32)


def _bandpass(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    nyquist = sample_rate / 2.0
    high = min(BANDPASS_HIGH_HZ, nyquist * 0.95)
    low = min(BANDPASS_LOW_HZ, high * 0.5)
    sos = butter(4, [low / nyquist, high / nyquist], btype="band", output="sos")
    return sosfilt(sos, samples).astype(np.float32)


def _mulaw_roundtrip(samples: np.ndarray) -> np.ndarray:
    mu = 255.0
    clipped = np.clip(samples, -1.0, 1.0)
    compressed = np.sign(clipped) * np.log1p(mu * np.abs(clipped)) / np.log1p(mu)
    expanded = np.sign(compressed) * (np.expm1(np.abs(compressed) * np.log1p(mu)) / mu)
    return expanded.astype(np.float32)


def telephone_effect(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    filtered = _bandpass(samples, sample_rate)
    at_8k = _resample(filtered, sample_rate, TELEPHONE_RATE)
    crushed = _mulaw_roundtrip(at_8k)
    return _resample(crushed, TELEPHONE_RATE, sample_rate)


def _encode_wav(samples: np.ndarray, sample_rate: int) -> bytes:
    audio = np.clip(samples, -1.0, 1.0)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0.98:
        audio = audio * (0.98 / peak)
    pcm = (audio * 32767.0).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, sample_rate, pcm)
    return buffer.getvalue()


def _loop_to_length(samples: np.ndarray, length: int) -> np.ndarray:
    if samples.size == 0 or length <= 0:
        return np.zeros(max(length, 0), dtype=np.float32)
    repeats = int(np.ceil(length / samples.size))
    tiled = np.tile(samples, repeats)
    return tiled[:length].astype(np.float32)


def _overlay(speech: np.ndarray, layer: np.ndarray, gain_db: float) -> np.ndarray:
    length = max(speech.size, layer.size)
    voice = np.zeros(length, dtype=np.float32)
    bg = np.zeros(length, dtype=np.float32)
    voice[: speech.size] = speech
    bg[: layer.size] = layer * _db_to_gain(gain_db)
    mixed = voice + bg
    peak = float(np.max(np.abs(mixed))) if mixed.size else 0.0
    if peak > 0.98:
        mixed *= 0.98 / peak
    return mixed


def _horn_burst(sample_rate: int, seconds: float = 0.35) -> np.ndarray:
    t = np.arange(int(sample_rate * seconds), dtype=np.float32) / sample_rate
    env = np.exp(-t * 6.0)
    return (0.55 * np.sin(2 * np.pi * 410 * t) + 0.35 * np.sin(2 * np.pi * 490 * t)) * env


def _crash_burst(sample_rate: int, seconds: float = 0.45) -> np.ndarray:
    n = int(sample_rate * seconds)
    t = np.arange(n, dtype=np.float32) / sample_rate
    noise = np.random.default_rng(7).normal(0, 1, n).astype(np.float32)
    env = np.exp(-t * 9.0)
    metal = np.sin(2 * np.pi * 1480 * t) * np.exp(-t * 7.0)
    return 0.55 * noise * env + 0.28 * metal


def _siren_burst(sample_rate: int, seconds: float = 0.9) -> np.ndarray:
    t = np.arange(int(sample_rate * seconds), dtype=np.float32) / sample_rate
    freq = 680 + 220 * np.sin(2 * np.pi * 2.2 * t)
    phase = np.cumsum(freq) / sample_rate
    env = np.clip(t * 8.0, 0, 1) * np.clip((seconds - t) * 6.0, 0, 1)
    return 0.4 * np.sin(2 * np.pi * phase) * env


class AudioMixer:
    def __init__(self, ambient_dir: Path = TTS_AMBIENT_DIR) -> None:
        self.ambient_dir = ambient_dir
        self._cache: dict[str, tuple[np.ndarray, int]] = {}

    def ensure_library(self) -> None:
        missing = [name for name in AMBIENT_TYPES if not (self.ambient_dir / f"{name}.wav").is_file()]
        if not missing:
            return
        from sys112_tts.ambient_lib import write_ambient_library

        write_ambient_library(self.ambient_dir)

    def _load_ambient(self, name: str, sample_rate: int) -> np.ndarray:
        cached = self._cache.get(name)
        if cached is None:
            path = self.ambient_dir / f"{name}.wav"
            if not path.is_file():
                self.ensure_library()
            if not path.is_file():
                raise FileNotFoundError(path)
            rate, frames = wavfile.read(path)
            audio = _to_mono_float(frames)
            if rate != sample_rate:
                audio = _resample(audio, rate, sample_rate)
            self._cache[name] = (audio, sample_rate)
            cached = self._cache[name]
        audio, cached_rate = cached
        if cached_rate != sample_rate:
            return _resample(audio, cached_rate, sample_rate)
        return audio

    def _random_sfx(self, length: int, sample_rate: int) -> np.ndarray:
        bed = np.zeros(length, dtype=np.float32)
        bursts = (
            _horn_burst(sample_rate),
            _crash_burst(sample_rate),
            _siren_burst(sample_rate),
        )
        count = random.randint(1, 2)
        for _ in range(count):
            clip = random.choice(bursts)
            if clip.size >= length:
                continue
            start = random.randint(0, length - clip.size)
            bed[start : start + clip.size] += clip.astype(np.float32)
        peak = float(np.max(np.abs(bed))) if bed.size else 0.0
        if peak > 1.0:
            bed /= peak
        return bed

    def mix(
        self,
        speech_bytes: bytes,
        ambient_type: str | None = None,
        random_sfx: bool = False,
    ) -> bytes:
        resolved = resolve_ambient_type(ambient_type)
        speech, rate = _decode_speech(speech_bytes)
        if rate != TARGET_RATE:
            speech = _resample(speech, rate, TARGET_RATE)
            rate = TARGET_RATE
        voice = telephone_effect(speech, rate)
        mixed = voice
        if resolved:
            self.ensure_library()
            bed = _loop_to_length(self._load_ambient(resolved, rate), voice.size)
            gain = random.uniform(AMBIENT_DB_MIN, AMBIENT_DB_MAX)
            mixed = _overlay(voice, bed, gain)
            logger.info("[TTS] mixer ambient=%s gain=%.1fdB", resolved, gain)
        if random_sfx:
            fx = self._random_sfx(mixed.size, rate)
            mixed = _overlay(mixed, fx, -12.0)
            logger.info("[TTS] mixer random_sfx=on")
        return _encode_wav(mixed, rate)


mixer = AudioMixer()
