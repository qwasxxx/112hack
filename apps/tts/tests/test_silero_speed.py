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


def _first_wav(payload: bytes) -> bytes:
    if len(payload) < 4:
        return b""
    length = struct.unpack_from("<I", payload, 0)[0]
    if length <= 0:
        return b""
    return payload[4 : 4 + length]


def test_silero_speed() -> None:
    print("\n=== Silero local TTA ===", flush=True)
    with TestClient(app) as client:
        health = client.get("/health").json()
        print(f"health backend={health.get('backend')} status={health.get('status')}", flush=True)
        warm = client.post(
            "/api/v1/tts/synthesize",
            json={"text": "\u0410\u043b\u043b\u043e.", "role": "victim", "emotion": "panic"},
        )
        warm_wav = _first_wav(warm.content)
        print(
            f"warmup http={warm.status_code} tta={warm.headers.get('x-tts-tta-ms')} "
            f"wav={warm_wav[:4] == b'RIFF'} bytes={len(warm_wav)}",
            flush=True,
        )
        started = time.perf_counter()
        response = client.post(
            "/api/v1/tts/synthesize",
            json={
                "text": "\u041f\u043e\u043c\u043e\u0433\u0438\u0442\u0435, \u0443 \u043d\u0430\u0441 \u043f\u043e\u0436\u0430\u0440, \u043f\u0440\u0438\u0435\u0437\u0436\u0430\u0439\u0442\u0435 \u0441\u043a\u043e\u0440\u0435\u0435!",
                "role": "victim",
                "emotion": "panic",
            },
        )
        wall_ms = (time.perf_counter() - started) * 1000
        audio = _first_wav(response.content) if response.status_code == 200 else b""
        wav_ok = audio[:4] == b"RIFF" and len(audio) > 1000
        header_tta = response.headers.get("x-tts-tta-ms")
        latency_ms = float(header_tta) if header_tta else wall_ms
        print(
            f"tta={latency_ms:.1f}ms wall={wall_ms:.1f}ms limit={LIMIT_MS:.0f}ms "
            f"http={response.status_code} wav={wav_ok} bytes={len(audio)} "
            f"{'PASS' if latency_ms < LIMIT_MS and wav_ok else 'FAIL'}",
            flush=True,
        )
        assert response.status_code == 200
        assert wav_ok
        assert latency_ms < LIMIT_MS, f"TTA {latency_ms:.1f}ms >= {LIMIT_MS:.0f}ms"


if __name__ == "__main__":
    test_silero_speed()