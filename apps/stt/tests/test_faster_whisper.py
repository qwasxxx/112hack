from __future__ import annotations

import asyncio
import io
import wave

import pytest

from sys112_stt.engine_faster_whisper import (
    close_model,
    last_transcribe_kwargs,
    load_count,
    load_model,
    pcm16_wav,
    transcribe_wav,
)
from sys112_stt.engine_hf import HfSttError
from sys112_stt.metrics import cer, critical_errors, wer
from sys112_stt.operator_corpus import OPERATOR_STT_BENCHMARK, OPERATOR_STT_CORPUS


class FakeSegment:
    def __init__(self, text: str) -> None:
        self.text = text


class FakeModel:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def transcribe(self, audio, **kwargs):
        self.calls.append({"audio_len": len(audio), **kwargs})
        return iter([FakeSegment(" Да. ")]), None


@pytest.fixture(autouse=True)
def reset_fw(monkeypatch):
    close_model()
    yield
    close_model()


def _silence_wav(seconds: float = 0.2, rate: int = 16000) -> bytes:
    pcm = b"\x00\x00" * int(rate * seconds)
    return pcm16_wav(pcm, rate)


def test_faster_whisper_language_is_russian():
    kwargs = last_transcribe_kwargs()
    assert kwargs["language"] == "ru"
    assert kwargs["task"] == "transcribe"
    assert kwargs["sample_rate"] == 16000
    assert kwargs["task"] != "translate"


def test_load_model_once(monkeypatch):
    fake = FakeModel()
    loads = {"n": 0}

    def fake_cls(*_args, **_kwargs):
        loads["n"] += 1
        return fake

    monkeypatch.setattr("faster_whisper.WhisperModel", fake_cls)
    first = load_model()
    second = load_model()
    assert first is second
    assert loads["n"] == 1
    assert load_count() == 1


def test_sequential_recognition_reuses_model(monkeypatch):
    fake = FakeModel()
    monkeypatch.setattr("faster_whisper.WhisperModel", lambda *_a, **_k: fake)
    wav = _silence_wav()
    first = asyncio.run(transcribe_wav(wav))
    second = asyncio.run(transcribe_wav(wav))
    assert first == "Да."
    assert second == "Да."
    assert len(fake.calls) == 2
    assert load_count() == 1
    assert fake.calls[0]["language"] == "ru"
    assert fake.calls[0]["task"] == "transcribe"
    assert fake.calls[0]["audio_len"] > 0


def test_sample_rate_is_converted_to_16k(monkeypatch):
    fake = FakeModel()
    monkeypatch.setattr("faster_whisper.WhisperModel", lambda *_a, **_k: fake)
    wav = _silence_wav(0.25, rate=8000)
    asyncio.run(transcribe_wav(wav))
    with wave.open(io.BytesIO(wav), "rb") as handle:
        assert handle.getframerate() == 8000
    # 0.25s at 16 kHz after upsample
    assert 3900 <= fake.calls[0]["audio_len"] <= 4100


def test_error_surfaces(monkeypatch):
    class Boom:
        def transcribe(self, *_a, **_k):
            raise RuntimeError("decode failed")

    monkeypatch.setattr("faster_whisper.WhisperModel", lambda *_a, **_k: Boom())
    with pytest.raises(RuntimeError, match="decode failed"):
        asyncio.run(transcribe_wav(_silence_wav()))


def test_timeout_cancels_wait(monkeypatch):
    def slow(_wav: bytes) -> str:
        import time

        time.sleep(2)
        return "нет"

    monkeypatch.setattr("sys112_stt.engine_faster_whisper.transcribe_wav_sync", slow)
    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(transcribe_wav(_silence_wav(), timeout=0.05))


def test_router_fallback_to_hf(monkeypatch):
    from sys112_stt import engine_router

    async def boom(_wav, timeout=None):
        raise RuntimeError("local down")

    async def hf(_wav, timeout=None):
        return "Нет."

    monkeypatch.setattr(engine_router, "STT_ENGINE", "faster_whisper")
    monkeypatch.setattr(engine_router, "STT_FALLBACK", "hf")
    monkeypatch.setattr("sys112_stt.engine_faster_whisper.transcribe_wav", boom)
    monkeypatch.setattr(engine_router, "transcribe_hf", hf)
    assert asyncio.run(engine_router.transcribe_wav(b"RIFF")) == "Нет."


def test_router_hf_error_without_fallback(monkeypatch):
    from sys112_stt import engine_router

    async def boom(_wav, timeout=None):
        raise HfSttError(500, "down")

    monkeypatch.setattr(engine_router, "STT_ENGINE", "hf")
    monkeypatch.setattr(engine_router, "STT_FALLBACK", "")
    monkeypatch.setattr(engine_router, "transcribe_hf", boom)
    with pytest.raises(HfSttError):
        asyncio.run(engine_router.transcribe_wav(b"RIFF"))


def test_metrics_and_corpus():
    assert wer("улица ленина дом 15", "улица ленина дом 15") == 0
    assert cer("да", "да") == 0
    assert wer("есть пострадавшие", "нет пострадавших") > 0
    item = next(row for row in OPERATOR_STT_BENCHMARK if row["id"] == "addr_lenina_15")
    assert "wrong_house" in critical_errors(item, "Улица Ленина, дом шестнадцать.")
    assert critical_errors(item, "Улица Ленина, дом пятнадцать.") == []
    yes = next(row for row in OPERATOR_STT_BENCHMARK if row["id"] == "neg_has_injured")
    assert "есть_vs_нет" in critical_errors(yes, "Пострадавших нет.")
    assert "Алло, меня слышно?" in OPERATOR_STT_CORPUS
    assert any(row["street"] == "берзарина" for row in OPERATOR_STT_BENCHMARK)
