from __future__ import annotations

import asyncio
import time
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from sys112_tts.fish_client import FishTTSClient, pcm16_to_wav


def test_pcm_chunk_is_wav() -> None:
    wav = pcm16_to_wav(b"\x00\x00" * 80, 44100)
    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"


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
