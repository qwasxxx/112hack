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

MAX_TTFB_MS = 300


def test_dispatcher_prosody_prefix() -> None:
    text = apply_fish_prosody("Служба 112, что случилось?", role="operator", emotion="calm")
    assert text.startswith(DISPATCH_PREFIX)
    assert "Служба 112" in text


def test_victim_prosody_and_pause() -> None:
    text = apply_fish_prosody("Помогите...", role="victim", emotion="panic")
    assert text.startswith("[anxious] [rushed] [clear speech] ")
    assert "[pause]" in text


def test_existing_inline_tags_are_kept() -> None:
    raw = "[serious] [clear speech] Алло."
    assert apply_fish_prosody(raw, role="operator") == raw


def test_pcm_chunk_is_wav() -> None:
    wav = pcm16_to_wav(b"\x00\x00" * 80, 44100)
    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"


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
        async for chunk in client.stream_llm(phrases(), role="victim", emotion="panic"):
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
    assert str(http["text"]).startswith(DISPATCH_PREFIX)
    assert ws["latency"] == "balanced"
    assert ws["model"] == "s2.1-pro"
    ws_text = captured["ws_text"]
    assert isinstance(ws_text, list)
    assert ws_text[0].startswith("[anxious] [rushed] [clear speech] ")
    assert http_chunk[:4] == b"RIFF"
    assert ws_chunk[:4] == b"RIFF"


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
    assert elapsed < MAX_TTFB_MS


@pytest.mark.skipif(not FISH_API_KEY, reason="FISH_API_KEY is not set")
def test_websocket_stream_first_byte() -> None:
    async def phrases():
        yield "Пожар на кухне. "
        yield "Нужна скорая помощь."

    elapsed, first = _first_byte_ms(phrases(), role="victim", emotion="panic")
    print(f"ws_ttfb_ms={elapsed:.1f} bytes={len(first)}")
    assert first[:4] == b"RIFF"
    assert len(first) > 44
    assert elapsed < MAX_TTFB_MS
