from __future__ import annotations

import struct
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fastapi.testclient import TestClient

from sys112_tts.app import app

LIMIT_MS = 100.0


def _unpack(payload: bytes) -> bytes:
    offset = 0
    chunks: list[bytes] = []
    while offset + 4 <= len(payload):
        length = struct.unpack_from("<I", payload, offset)[0]
        offset += 4
        if length == 0:
            break
        chunks.append(payload[offset : offset + length])
        offset += length
    return b"".join(chunks)


def test_silero_speed() -> None:
    print("\n=== Silero local TTA ===", flush=True)
    with TestClient(app) as client:
        warm = client.post(
            "/api/v1/tts/synthesize",
            json={"text": "Алло.", "role": "victim", "emotion": "panic"},
        )
        print(f"warmup http={warm.status_code} bytes={len(_unpack(warm.content))}", flush=True)
        started = time.perf_counter()
        response = client.post(
            "/api/v1/tts/synthesize",
            json={
                "text": "Помогите, у нас пожар, приезжайте скорее!",
                "role": "victim",
                "emotion": "panic",
            },
        )
        latency_ms = (time.perf_counter() - started) * 1000
        audio = _unpack(response.content) if response.status_code == 200 else b""
        wav_ok = audio[:4] == b"RIFF" and len(audio) > 1000
        print(
            f"latency={latency_ms:.1f}ms limit={LIMIT_MS:.0f}ms "
            f"http={response.status_code} wav={wav_ok} bytes={len(audio)} "
            f"{'PASS' if latency_ms < LIMIT_MS and wav_ok else 'FAIL'}",
            flush=True,
        )
        assert response.status_code == 200
        assert wav_ok
        assert latency_ms < LIMIT_MS, f"TTA {latency_ms:.1f}ms >= {LIMIT_MS:.0f}ms"


if __name__ == "__main__":
    test_silero_speed()
