from __future__ import annotations

import io
import struct
import sys
import time
from pathlib import Path

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fastapi.testclient import TestClient

from sys112_tts.app import app
from sys112_tts.mixer import (
    AMBIENT_DB_MAX,
    AMBIENT_DB_MIN,
    AudioMixer,
    TARGET_RATE,
    _db_to_gain,
    _loop_to_length,
    mixer,
    telephone_effect,
)

PHONE_LOW = 300.0
PHONE_HIGH = 3400.0
MAX_MIX_CPU_MS = 200.0
HIGH_REJECT_MAX = 0.18
MIN_PHONE_SHARE = 0.45
MIN_VOICE_LEAD_DB = 10.0
MAX_VOICE_LEAD_DB = 45.0

SCENARIOS = (
    {
        "id": "SIRN",
        "ambient_type": "traffic_siren",
        "text": "Yangın var, yardım edin, cadde tıkalı!",
        "emotion": "panic_high",
        "voice_id": "tr-TR-EmelNeural",
    },
    {
        "id": "CRSH",
        "ambient_type": "car_crash",
        "text": "Kaza oldu, araçta sıkıştım, nefes alamıyorum!",
        "emotion": "panic_high",
        "voice_id": "tr-TR-EmelNeural",
    },
)


def _unpack_audio(payload: bytes) -> bytes:
    chunks: list[bytes] = []
    offset = 0
    while offset + 4 <= len(payload):
        length = struct.unpack_from("<I", payload, offset)[0]
        offset += 4
        if length == 0:
            break
        chunks.append(payload[offset : offset + length])
        offset += length
    return b"".join(chunks)


def _wav_samples(data: bytes) -> tuple[np.ndarray, int]:
    rate, frames = wavfile.read(io.BytesIO(data))
    audio = np.asarray(frames, dtype=np.float32)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if np.max(np.abs(audio)) > 1.5:
        audio = audio / 32768.0
    return audio.astype(np.float32), int(rate)


def _band_energy(samples: np.ndarray, sample_rate: int, low: float, high: float) -> float:
    spectrum = np.abs(np.fft.rfft(samples * np.hanning(samples.size))) ** 2
    freqs = np.fft.rfftfreq(samples.size, 1.0 / sample_rate)
    mask = (freqs >= low) & (freqs < high)
    if not np.any(mask):
        return 0.0
    return float(np.sum(spectrum[mask]))


def _rms(samples: np.ndarray) -> float:
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(samples))))


def _db(value: float) -> float:
    return 20.0 * np.log10(max(value, 1e-12))


def _tone_wav(seconds: float = 1.2) -> bytes:
    t = np.arange(int(TARGET_RATE * seconds), dtype=np.float32) / TARGET_RATE
    voice = (
        0.35 * np.sin(2 * np.pi * 220 * t)
        + 0.55 * np.sin(2 * np.pi * 1000 * t)
        + 0.45 * np.sin(2 * np.pi * 5200 * t)
    )
    buffer = io.BytesIO()
    wavfile.write(buffer, TARGET_RATE, (np.clip(voice, -1, 1) * 32767.0).astype(np.int16))
    return buffer.getvalue()


def analyze_spectrum(samples: np.ndarray, sample_rate: int) -> dict[str, float]:
    low = _band_energy(samples, sample_rate, 20.0, PHONE_LOW)
    phone = _band_energy(samples, sample_rate, PHONE_LOW, PHONE_HIGH)
    high = _band_energy(samples, sample_rate, 4000.0, min(sample_rate / 2.0, 12000.0))
    total = low + phone + high
    return {
        "low": low,
        "phone": phone,
        "high": high,
        "phone_share": phone / max(total, 1e-12),
        "high_reject": high / max(phone, 1e-12),
    }


def voice_vs_ambient_db(speech: np.ndarray, ambient_name: str, sample_rate: int) -> tuple[float, float]:
    voice = telephone_effect(speech, sample_rate)
    local = AudioMixer()
    local.ensure_library()
    bed = _loop_to_length(local._load_ambient(ambient_name, sample_rate), voice.size)
    gain = 0.5 * (AMBIENT_DB_MIN + AMBIENT_DB_MAX)
    bed *= _db_to_gain(gain)
    lead = _db(_rms(voice)) - _db(_rms(bed))
    return lead, gain


def report(title: str, rows: list[tuple[str, str, bool]]) -> None:
    print(f"\n--- {title} ---", flush=True)
    for name, detail, ok in rows:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}", flush=True)


def test_audio_mixer_ambient_and_telephone() -> None:
    print("\n=== AudioMixer + telephone bandpass control ===", flush=True)
    mixer.ensure_library()
    probe = _tone_wav()
    speech, rate = _wav_samples(probe)

    mixer.mix(probe, "traffic_siren", False)
    started = time.perf_counter()
    mixed_probe = mixer.mix(probe, "traffic_siren", False)
    cpu_ms = (time.perf_counter() - started) * 1000
    cpu_ok = cpu_ms < MAX_MIX_CPU_MS
    report(
        "Mixer CPU overhead",
        [
            (
                "mix(traffic_siren) CPU",
                f"{cpu_ms:.1f} ms (limit {MAX_MIX_CPU_MS:.0f} ms)",
                cpu_ok,
            )
        ],
    )

    tel = telephone_effect(speech, rate)
    tel_spec = analyze_spectrum(tel, rate)
    tel_ok = tel_spec["high_reject"] < HIGH_REJECT_MAX and tel_spec["phone_share"] > MIN_PHONE_SHARE
    report(
        "Telephone bandpass (dry voice 220/1000/5200 Hz probe)",
        [
            (
                "phone band 300-3400 Hz share",
                f"{tel_spec['phone_share']*100:.1f}%",
                tel_spec["phone_share"] > MIN_PHONE_SHARE,
            ),
            (
                "high-band reject (>4 kHz / phone)",
                f"{tel_spec['high_reject']:.3f} (max {HIGH_REJECT_MAX})",
                tel_spec["high_reject"] < HIGH_REJECT_MAX,
            ),
        ],
    )

    failed: list[str] = []
    if not cpu_ok:
        failed.append(f"cpu {cpu_ms:.1f}ms")
    if not tel_ok:
        failed.append("telephone spectrum")

    with TestClient(app) as client:
        for scenario in SCENARIOS:
            print(f"\n=== API {scenario['id']} ambient_type={scenario['ambient_type']} ===", flush=True)
            response = client.post(
                "/api/v1/tts/synthesize",
                json={
                    "text": scenario["text"],
                    "voice_id": scenario["voice_id"],
                    "emotion": scenario["emotion"],
                    "ambient_type": scenario["ambient_type"],
                    "random_sfx": False,
                },
            )
            audio = _unpack_audio(response.content) if response.status_code == 200 else b""
            http_ok = response.status_code == 200 and audio[:4] == b"RIFF"
            print(
                f"  HTTP {response.status_code}  bytes={len(audio)}  format={'wav' if audio[:4]==b'RIFF' else 'other'}",
                flush=True,
            )
            if not http_ok:
                failed.append(f"{scenario['id']} http")
                report(scenario["id"], [("API WAV", "missing or not RIFF", False)])
                continue

            samples, sample_rate = _wav_samples(audio)
            spec = analyze_spectrum(samples, sample_rate)
            band_ok = spec["high_reject"] < HIGH_REJECT_MAX and spec["phone_share"] > 0.35
            lead_db, gain = voice_vs_ambient_db(speech, scenario["ambient_type"], TARGET_RATE)
            balance_ok = MIN_VOICE_LEAD_DB <= lead_db <= MAX_VOICE_LEAD_DB
            mix_started = time.perf_counter()
            mixer.mix(probe, scenario["ambient_type"], False)
            mix_ms = (time.perf_counter() - mix_started) * 1000
            mix_ok = mix_ms < MAX_MIX_CPU_MS
            report(
                f"{scenario['id']} checks",
                [
                    (
                        "voice telephone band",
                        f"phone_share={spec['phone_share']*100:.1f}%  high_reject={spec['high_reject']:.3f}  "
                        f"E[low/phone/high]={spec['low']:.2e}/{spec['phone']:.2e}/{spec['high']:.2e}",
                        band_ok,
                    ),
                    (
                        "ambient does not drown voice",
                        f"voice-ambient = {lead_db:.1f} dB  overlay~{gain:.1f} dB "
                        f"(voice louder than bed by at least {MIN_VOICE_LEAD_DB:.0f} dB; overlay {AMBIENT_DB_MIN:.0f}..{AMBIENT_DB_MAX:.0f} dB)",
                        balance_ok,
                    ),
                    (
                        "mixer CPU add-on",
                        f"{mix_ms:.1f} ms (limit {MAX_MIX_CPU_MS:.0f} ms)",
                        mix_ok,
                    ),
                ],
            )
            if not band_ok:
                failed.append(f"{scenario['id']} bandpass")
            if not balance_ok:
                failed.append(f"{scenario['id']} balance")
            if not mix_ok:
                failed.append(f"{scenario['id']} cpu")

    print(
        "\nSUMMARY "
        + ("PASS" if not failed else "FAIL: " + ", ".join(failed)),
        flush=True,
    )
    assert not failed, failed


if __name__ == "__main__":
    test_audio_mixer_ambient_and_telephone()
