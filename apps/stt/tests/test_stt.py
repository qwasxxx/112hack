from sys112_stt.audio import pcm_s16le_to_float32
from sys112_stt.config import STT_HF_MODEL
from sys112_stt.engine import SttSession
from sys112_stt.transcript_postprocessor import normalize_transcript


def test_pcm_conversion():
    samples = pcm_s16le_to_float32((32767).to_bytes(2, "little", signed=True))
    assert len(samples) == 1
    assert samples[0] > 0.9


def test_mock_session_complete():
    session = SttSession(recognizer=None, stream=None, mock=True)
    events = session.finish()
    assert events[-1]["type"] == "session_complete"


def test_mock_audio_session_emits_finals():
    session = SttSession(recognizer=None, stream=None, mock=True)
    silence = b"\x00\x00" * 8000
    events = []
    for _ in range(4):
        events.extend(session.accept_pcm(silence))
    types = {item["type"] for item in events}
    assert "final" in types or "partial" in types
    complete = session.finish()
    assert complete[-1]["type"] == "session_complete"


def test_transcript_finalize_keeps_phrases():
    session = SttSession(recognizer=None, stream=None, mock=True)
    session.finals = [{"text": "Здравствуйте, у меня пожар.", "start": 0.0, "end": 2.0}]
    events = session.finish()
    assert events[-1]["text"] == "Здравствуйте, у меня пожар."


def test_skip_duplicate_and_tiny_finals():
    class Dummy:
        def reset(self, _stream):
            return None

        def timestamps(self, _stream):
            return [0.1, 1.0]

    session = SttSession(recognizer=Dummy(), stream=object(), mock=False)
    session.finals = [{"text": "здравствуйте у меня пожар", "start": 0.0, "end": 2.0}]
    session.last_partial = "пожар"
    assert session._commit_final("пожар") == []
    assert session._commit_final("здравствуйте у меня пожар") == []
    events = session._commit_final("пятый этаж квартира сорок три")
    assert events[0]["type"] == "final"
    assert events[0]["text"] == "пятый этаж квартира сорок три"


def test_normalize_transcript():
    assert normalize_transcript("  пожар   в  квартире ") == "пожар в квартире"


def test_partial_does_not_shrink():
    from sys112_stt.engine import _is_shorter_partial

    assert _is_shorter_partial("у нас пожар в квартире", "у нас пожар")
    assert not _is_shorter_partial("у нас пожар", "у нас пожар в квартире")
    assert not _is_shorter_partial("", "пожар")


def test_stable_prefix_holds_last_words():
    from sys112_stt.transcript_postprocessor import stable_prefix

    assert stable_prefix("у меня пожар", None, 0.2, 0.5) == ""
    assert stable_prefix("у меня пожар", None, 1.2, 0.5) == "у меня"
    assert stable_prefix("в квартире два человека", [0.2, 0.5, 1.1, 1.5], 1.4, 0.5) == "в квартире"



def test_health_payload_keys():
    from fastapi.testclient import TestClient
    from sys112_stt.app import app

    with TestClient(app) as client:
        response = client.get("/health")
        body = response.json()
        assert response.status_code == 200
        assert body["model"] == STT_HF_MODEL
        assert body["local"] is False
        assert "stt" in body
        assert body["status"] in ("ok", "degraded")


def _tone(seconds: float, amplitude: int = 9000, rate: int = 8000) -> bytes:
    import math

    count = int(rate * seconds)
    out = bytearray()
    for index in range(count):
        value = int(amplitude * math.sin(2 * math.pi * 220 * index / rate))
        out += int(max(-32767, min(32767, value))).to_bytes(2, "little", signed=True)
    return bytes(out)


def test_hf_finalizes_phrase_once():
    import asyncio

    from sys112_stt.engine_hf import HuggingFaceSttSession

    calls = {"n": 0}

    async def fake(wav: bytes) -> str:
        assert wav.startswith(b"RIFF")
        calls["n"] += 1
        return "у меня пожар"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        events = []
        events.extend(await session.accept_pcm(_tone(0.8)))
        events.extend(await session.accept_pcm(b"\x00\x00" * int(8000 * 0.7)))
        return events

    events = asyncio.run(run())
    assert calls["n"] == 1
    assert any(item["type"] == "final" and item["text"] == "у меня пожар" for item in events)


def test_hf_ignores_short_noise():
    import asyncio

    from sys112_stt.engine_hf import HuggingFaceSttSession

    async def fake(_wav: bytes) -> str:
        raise AssertionError("short noise must not call the API")

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        events = await session.accept_pcm(_tone(0.2, amplitude=9000))
        events.extend(await session.accept_pcm(b"\x00\x00" * int(8000 * 0.7)))
        return events

    assert asyncio.run(run()) == []
