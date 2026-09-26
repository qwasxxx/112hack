from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fishaudio.exceptions import APIError

from sys112_tts.config import FISH_API_KEY
from sys112_tts.fish_client import DISPATCH_PREFIX, FishTTSClient, apply_fish_prosody, pcm16_to_wav


def test_dispatcher_prosody_prefix() -> None:
    text = apply_fish_prosody("Служба 112, что случилось?", role="operator", emotion="calm")
    assert text.startswith(DISPATCH_PREFIX)
    assert "Служба 112" in text


def test_victim_prosody_and_pause() -> None:
    text = apply_fish_prosody("Помогите...", role="victim", emotion="panic", gender="female")
    assert text.startswith("[panicked] ")
    assert "[short pause]" in text
    assert "[breathing heavily]" not in text


def test_ordinary_call_is_not_an_explosion() -> None:
    text = apply_fish_prosody(
        "Алло, ребенок упал с велосипеда, помогите.",
        role="victim",
        emotion="scared",
        gender="female",
    )
    assert text.startswith("[nervous] ")
    assert "[breathing heavily]" not in text
    assert "[panicked]" not in text


def test_severe_line_gets_one_breath() -> None:
    text = apply_fish_prosody("Пожар, я задыхаюсь.", role="victim", emotion="panic", gender="female")
    assert text.startswith("[breathing heavily] [panicked] ")


def test_model_tags_are_replaced_by_delivery() -> None:
    raw = "[serious] [clear speech] Алло, я задыхаюсь."
    text = apply_fish_prosody(raw, role="victim", emotion="angry", gender="male")
    assert text.startswith("[breathing heavily] [angry]")
    assert "[serious]" not in text
    assert "задыхаюсь" in text


def test_teacher_tone_changes_tags() -> None:
    crying = apply_fish_prosody("Не могу говорить.", role="victim", emotion="crying")
    startled = apply_fish_prosody("Там человек лежит.", role="victim", emotion="startled")
    assert crying.startswith("[crying]")
    assert startled.startswith("[startled]")
    assert "[gasping]" not in startled


def test_first_pcm_frame_does_not_wait_for_full_utterance() -> None:
    client = FishTTSClient(api_key="test-key", audio_format="pcm", sample_rate=44100)

    async def raw():
        yield b"\x00\x01" * 200
        yield b"\x00\x01" * 700
        await asyncio.sleep(0.2)
        yield b"\x00\x01" * 4000

    async def run() -> tuple[float, bytes]:
        started = time.perf_counter()
        first = b""
        async for chunk in client._audio_frames(raw()):
            first = chunk
            break
        return (time.perf_counter() - started) * 1000, first

    elapsed, first = asyncio.run(run())
    assert first[:4] == b"RIFF"
    assert len(first) > 44
    assert elapsed < 80


def _first_byte_ms(source: str | object, **kwargs: object) -> tuple[float, bytes]:
    client = FishTTSClient()

    async def _measure() -> tuple[float, bytes]:
        async for _chunk in client.speak("Да.", role="operator", emotion="calm"):
            break
        started = time.perf_counter()
        first = b""
        async for chunk in client.speak(source, **kwargs):  # type: ignore[arg-type]
            first = chunk
            break
        return (time.perf_counter() - started) * 1000, first

    try:
        return asyncio.run(_measure())
    except APIError as exc:
        if exc.status == 402:
            pytest.skip("Fish Audio API credit is empty")
        raise


def test_stream_requests_balanced_s2_and_wraps_pcm(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class _Chunks:
        def __init__(self) -> None:
            self._done = False

        def __aiter__(self) -> _Chunks:
            return self

        async def __anext__(self) -> bytes:
            if self._done:
                raise StopAsyncIteration
            self._done = True
            return b"\x00\x01" * 80

    class _TTS:
        async def stream(self, **kwargs: object) -> _Chunks:
            captured["http"] = kwargs
            return _Chunks()

        def stream_websocket(self, text_stream: object, **kwargs: object) -> object:
            captured["ws"] = kwargs

            async def _audio():
                text: list[str] = []
                async for piece in text_stream:  # type: ignore[operator]
                    text.append(piece)
                captured["ws_text"] = text
                yield b"\x00\x01" * 80

            return _audio()

    class _SDK:
        def __init__(self, api_key: str) -> None:
            assert api_key
            self.tts = _TTS()

    monkeypatch.setattr("fishaudio.AsyncFishAudio", _SDK)
    client = FishTTSClient(api_key="test-key", model="s2.1-pro", latency="balanced")

    async def _run() -> tuple[bytes, bytes]:
        http_chunk = b""
        async for chunk in client.stream_text("Алло, служба 112.", role="operator", emotion="calm"):
            http_chunk = chunk
            break

        async def phrases():
            yield "Пожар. "
            yield "Нужна помощь."

        ws_chunk = b""
        async for chunk in client.stream_llm(phrases(), role="victim", emotion="panic", gender="female"):
            ws_chunk = chunk
            break
        return http_chunk, ws_chunk

    http_chunk, ws_chunk = asyncio.run(_run())
    http = captured["http"]
    ws = captured["ws"]
    assert isinstance(http, dict)
    assert isinstance(ws, dict)
    assert http["latency"] == "balanced"
    assert http["model"] == "s2.1-pro"
    assert http["config"].latency == "balanced"
    assert http["config"].condition_on_previous_chunks is False
    assert str(http["text"]).startswith(DISPATCH_PREFIX)
    assert ws["latency"] == "balanced"
    assert ws["model"] == "s2.1-pro"
    assert ws["reference_id"]
    ws_text = captured["ws_text"]
    assert isinstance(ws_text, list)
    assert ws_text[0].startswith("[breathing heavily] [panicked] ")
    assert http_chunk[:4] == b"RIFF"
    assert ws_chunk[:4] == b"RIFF"


def test_f_http_stream_forwards_first_chunk_without_full_buffer(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        is_success = True

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args: object):
            return False

        async def aiter_bytes(self):
            yield b"\x00\x01" * 400
            await asyncio.sleep(0.25)
            yield b"\x00\x01" * 4000

        async def aread(self) -> bytes:
            return b""

        async def aclose(self) -> None:
            return None

    class FakeHTTP:
        def build_request(self, method: str, path: str, **kwargs: object):
            captured["method"] = method
            captured["path"] = path
            captured["headers"] = kwargs.get("headers")
            captured["stream_arg"] = kwargs
            return object()

        async def send(self, request: object, stream: bool = False):
            captured["stream"] = stream
            return FakeResponse()

    class Wrapper:
        def __init__(self) -> None:
            self.client = FakeHTTP()

        def get_headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
            headers = {"Authorization": "Bearer x"}
            if extra:
                headers.update(extra)
            return headers

    class _TTS:
        async def stream(self, **kwargs: object):
            raise AssertionError("buffered SDK stream should not be used")

    class _SDK:
        def __init__(self, api_key: str) -> None:
            assert api_key
            self.tts = _TTS()
            self._client_wrapper = Wrapper()

        async def close(self) -> None:
            return None

    monkeypatch.setattr("fishaudio.AsyncFishAudio", _SDK)
    client = FishTTSClient(api_key="test-key", audio_format="pcm", sample_rate=44100)

    async def _run() -> tuple[float, bytes]:
        started = time.perf_counter()
        first = b""
        async for chunk in client.stream_text("Да.", role="operator", emotion="calm"):
            first = chunk
            break
        return (time.perf_counter() - started) * 1000, first

    elapsed, first = asyncio.run(_run())
    assert captured["method"] == "POST"
    assert captured["path"] == "/v1/tts"
    assert captured["stream"] is True
    assert first[:4] == b"RIFF"
    assert elapsed < 80


def test_g_reuses_sdk_client(monkeypatch: pytest.MonkeyPatch) -> None:
    created = {"n": 0}

    class _TTS:
        async def stream(self, **kwargs: object):
            async def _chunks():
                yield b"\x00\x01" * 400

            return _chunks()

    class _SDK:
        def __init__(self, api_key: str) -> None:
            created["n"] += 1
            self.tts = _TTS()

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr("fishaudio.AsyncFishAudio", _SDK)
    client = FishTTSClient(api_key="test-key", audio_format="pcm", sample_rate=44100)

    async def _run() -> int:
        async for _chunk in client.stream_text("Да.", role="operator", emotion="calm"):
            break
        async for _chunk in client.stream_text("Нет.", role="operator", emotion="calm"):
            break
        return created["n"]

    assert asyncio.run(_run()) == 1


def test_h_failed_fish_request_resets_client(monkeypatch: pytest.MonkeyPatch) -> None:
    created = {"n": 0}
    failed = {"once": False}

    class _TTS:
        async def stream(self, **kwargs: object):
            if not failed["once"]:
                failed["once"] = True
                raise RuntimeError("mid-stream fail")

            async def _chunks():
                yield b"\x00\x01" * 400

            return _chunks()

    class _SDK:
        def __init__(self, api_key: str) -> None:
            created["n"] += 1
            self.tts = _TTS()

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr("fishaudio.AsyncFishAudio", _SDK)
    client = FishTTSClient(api_key="test-key", audio_format="pcm", sample_rate=44100)

    async def _run() -> tuple[int, bytes]:
        try:
            async for _chunk in client.stream_text("Да.", role="operator", emotion="calm"):
                break
        except RuntimeError:
            pass
        first = b""
        async for chunk in client.stream_text("Нет.", role="operator", emotion="calm"):
            first = chunk
            break
        return created["n"], first

    count, first = asyncio.run(_run())
    assert count == 2
    assert first[:4] == b"RIFF"


@pytest.mark.skipif(not FISH_API_KEY, reason="FISH_API_KEY is not set")
def test_http_stream_first_byte() -> None:
    elapsed, first = _first_byte_ms(
        "Служба сто двенадцать, что у вас случилось?",
        role="operator",
        emotion="calm",
    )
    print(f"http_ttfb_ms={elapsed:.1f} bytes={len(first)}")
    assert first[:4] == b"RIFF"
    assert len(first) > 44
    assert elapsed < 900


@pytest.mark.skipif(not FISH_API_KEY, reason="FISH_API_KEY is not set")
def test_websocket_stream_first_byte() -> None:
    async def phrases():
        yield "Пожар на кухне. "
        yield "Нужна скорая помощь."

    elapsed, first = _first_byte_ms(phrases(), role="victim", emotion="panic")
    print(f"ws_ttfb_ms={elapsed:.1f} bytes={len(first)}")
    assert first[:4] == b"RIFF"
    assert len(first) > 44
    assert elapsed < 2500
