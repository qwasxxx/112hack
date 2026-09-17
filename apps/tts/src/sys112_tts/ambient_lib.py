from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

from sys112_tts.config import AMBIENT_TYPES, TTS_AMBIENT_DIR

SAMPLE_RATE = 24000
LOOP_SECONDS = 10.0


def _butter_band(samples: np.ndarray, low: float, high: float, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    nyquist = sample_rate / 2.0
    sos = butter(3, [low / nyquist, min(high, nyquist * 0.98) / nyquist], btype="band", output="sos")
    return sosfilt(sos, samples).astype(np.float32)


def _envelope(n: int, sample_rate: int, attack: float = 0.08, release: float = 0.2) -> np.ndarray:
    t = np.arange(n, dtype=np.float32) / sample_rate
    seconds = n / sample_rate
    return np.clip(t / attack, 0, 1) * np.clip((seconds - t) / release, 0, 1)


def _normalize(samples: np.ndarray, peak: float = 0.55) -> np.ndarray:
    current = float(np.max(np.abs(samples))) if samples.size else 0.0
    if current < 1e-9:
        return samples.astype(np.float32)
    return (samples * (peak / current)).astype(np.float32)


def _pink_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    white = rng.normal(0, 1, n).astype(np.float32)
    spectrum = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n)
    spectrum[1:] /= np.maximum(np.sqrt(freqs[1:] * n), 1e-6)
    return np.fft.irfft(spectrum, n).astype(np.float32)


def traffic_siren(n: int, sample_rate: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n, dtype=np.float32) / sample_rate
    rumble = 0.22 * np.sin(2 * np.pi * 38 * t) + 0.12 * np.sin(2 * np.pi * 72 * t)
    traffic = _butter_band(_pink_noise(n, rng) * 0.45, 60, 420, sample_rate)
    freq = 760 + 240 * np.sin(2 * np.pi * 0.35 * t)
    siren = 0.18 * np.sin(2 * np.pi * np.cumsum(freq) / sample_rate)
    whoosh = _butter_band(_pink_noise(n, rng) * 0.2, 200, 1600, sample_rate) * (0.4 + 0.3 * np.sin(2 * np.pi * 0.12 * t))
    return _normalize((rumble + traffic + siren + whoosh) * _envelope(n, sample_rate))


def car_crash(n: int, sample_rate: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n, dtype=np.float32) / sample_rate
    bed = _butter_band(_pink_noise(n, rng) * 0.22, 80, 900, sample_rate)
    hits = np.zeros(n, dtype=np.float32)
    for start in (0.4, 3.6, 7.1):
        idx = int(start * sample_rate)
        width = int(0.55 * sample_rate)
        sl = slice(idx, min(n, idx + width))
        local = np.arange(sl.stop - sl.start, dtype=np.float32) / sample_rate
        burst = rng.normal(0, 1, sl.stop - sl.start).astype(np.float32) * np.exp(-local * 8.0)
        metal = np.sin(2 * np.pi * 1320 * local) * np.exp(-local * 6.5)
        glass = np.sin(2 * np.pi * 2750 * local) * np.exp(-local * 11.0)
        hits[sl] += 0.7 * burst + 0.28 * metal + 0.16 * glass
    return _normalize(bed + hits)


def crowd_panic(n: int, sample_rate: int, rng: np.random.Generator) -> np.ndarray:
    murmur = _butter_band(_pink_noise(n, rng), 180, 780, sample_rate)
    shouts = np.zeros(n, dtype=np.float32)
    for start, freq in ((1.1, 420), (2.8, 510), (4.4, 390), (6.7, 470), (8.3, 355)):
        idx = int(start * sample_rate)
        width = int(0.28 * sample_rate)
        sl = slice(idx, min(n, idx + width))
        local = np.arange(sl.stop - sl.start, dtype=np.float32) / sample_rate
        env = np.sin(np.pi * np.clip(local / max(local[-1], 1e-4), 0, 1)) ** 2
        shouts[sl] += env * np.sin(2 * np.pi * freq * local) * (0.35 + 0.15 * rng.random())
    return _normalize(0.7 * murmur + 0.55 * shouts)


def phone_static(n: int, sample_rate: int, rng: np.random.Generator) -> np.ndarray:
    hiss = rng.normal(0, 0.08, n).astype(np.float32)
    crackle = (rng.random(n) > 0.995).astype(np.float32) * rng.normal(0, 0.4, n)
    hum = 0.03 * np.sin(2 * np.pi * 50 * np.arange(n) / sample_rate)
    return _normalize(_butter_band(hiss + crackle + hum, 200, 3800, sample_rate), peak=0.28)


GENERATORS = {
    "traffic_siren": traffic_siren,
    "car_crash": car_crash,
    "crowd_panic": crowd_panic,
    "phone_static": phone_static,
}


def write_ambient_library(dest: Path = TTS_AMBIENT_DIR, sample_rate: int = SAMPLE_RATE) -> dict[str, Path]:
    dest.mkdir(parents=True, exist_ok=True)
    n = int(LOOP_SECONDS * sample_rate)
    written: dict[str, Path] = {}
    for name in AMBIENT_TYPES:
        path = dest / f"{name}.wav"
        rng = np.random.default_rng(112000 + sum(ord(ch) for ch in name))
        samples = GENERATORS[name](n, sample_rate, rng)
        pcm = np.clip(samples, -1.0, 1.0)
        wavfile.write(path, sample_rate, (pcm * 32767.0).astype(np.int16))
        written[name] = path
        print(f"[TTS] ambient {path.name} ({path.stat().st_size} bytes)", flush=True)
    return written
