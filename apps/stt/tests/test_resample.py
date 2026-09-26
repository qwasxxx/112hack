from sys112_stt.audio import pcm_s16le_to_float32, resample_float32, resample_pcm_s16le
from sys112_stt.config import STT_WIRE_SAMPLE_RATE, WHISPER_SAMPLE_RATE


def test_whisper_and_wire_rates_are_16k():
    assert WHISPER_SAMPLE_RATE == 16000
    assert STT_WIRE_SAMPLE_RATE == 16000


def test_pcm_roundtrip_no_clipping():
    raw = (32767).to_bytes(2, "little", signed=True) + (-32768).to_bytes(2, "little", signed=True)
    samples = pcm_s16le_to_float32(raw)
    assert samples[0] > 0.99
    assert samples[1] == -1.0


def test_resample_48k_to_16k_length():
    samples = [0.2] * 4800
    out = resample_float32(samples, 48000, 16000)
    assert 1590 <= len(out) <= 1600
    assert all(-1.0 <= value <= 1.0 for value in out)


def test_resample_identity():
    samples = [0.1, -0.2, 0.3]
    assert resample_float32(samples, 16000, 16000) == samples


def test_resample_pcm_16k_to_8k_for_tone_fallback():
    pcm = b"\x00\x10" * 1600
    out = resample_pcm_s16le(pcm, 16000, 8000)
    assert 790 <= len(out) // 2 <= 810
