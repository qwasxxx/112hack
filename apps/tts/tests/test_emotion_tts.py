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
from sys112_tts.engine import EMOTIONS, build_ssml
from sys112_tts.voices import resolve_voice_id

MAX_LATENCY_MS = 500
MIN_AUDIO_BYTES = 800

SCENARIOS = (
    {
        "id": "A",
        "text": "Yangın var, yardım edin!",
        "emotion": "panic_high",
        "voice_id": "tr-TR-EmelNeural",
    },
    {
        "id": "B",
        "text": "Kaza oldu, nefes alamıyor...",
        "emotion": "panic_crying",
        "voice_id": "tr-TR-EmelNeural",
    },
    {
        "id": "C",
        "text": "112 Acil, konumunuzu doğrulayın.",
        "emotion": "operator_calm",
        "voice_id": "tr-TR-AhmetNeural",
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


def _audio_format(data: bytes) -> str:
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[:3] == b"ID3":
        return "mp3"
    if len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0:
        return "mp3"
    return "unknown"


def _ssml_ok(text: str, voice_id: str, emotion: str) -> bool:
    profile = EMOTIONS[emotion]
    ssml = build_ssml(text, resolve_voice_id(voice_id, emotion), emotion)
    return (
        "<speak" in ssml
        and f'name="{resolve_voice_id(voice_id, emotion)}"' in ssml
        and f'rate="{profile["rate"]}"' in ssml
        and f'pitch="{profile["pitch"]}"' in ssml
        and f'volume="{profile["volume"]}"' in ssml
        and (emotion != "panic_crying" or "<break" in ssml)
    )


def run_scenario(client: TestClient, scenario: dict[str, str]) -> dict[str, object]:
    started = time.perf_counter()
    response = client.post(
        "/api/v1/tts/synthesize",
        json={
            "text": scenario["text"],
            "voice_id": scenario["voice_id"],
            "emotion": scenario["emotion"],
        },
    )
    latency_ms = (time.perf_counter() - started) * 1000
    audio = _unpack_audio(response.content) if response.status_code == 200 else b""
    kind = _audio_format(audio)
    ssml_ok = _ssml_ok(scenario["text"], scenario["voice_id"], scenario["emotion"])
    latency_ok = latency_ms < MAX_LATENCY_MS
    audio_ok = kind in {"mp3", "wav"} and len(audio) >= MIN_AUDIO_BYTES
    passed = response.status_code == 200 and latency_ok and audio_ok and ssml_ok
    result = {
        "id": scenario["id"],
        "emotion": scenario["emotion"],
        "status": response.status_code,
        "latency_ms": round(latency_ms, 1),
        "bytes": len(audio),
        "format": kind,
        "ssml_ok": ssml_ok,
        "latency_ok": latency_ok,
        "audio_ok": audio_ok,
        "passed": passed,
    }
    print(
        f"[{scenario['id']}] {scenario['emotion']}: "
        f"latency={result['latency_ms']}ms ({'PASS' if latency_ok else 'FAIL <500ms'}) | "
        f"audio={kind} {len(audio)}B ({'PASS' if audio_ok else 'FAIL'}) | "
        f"ssml={'PASS' if ssml_ok else 'FAIL'} | "
        f"http={response.status_code}",
        flush=True,
    )
    return result


def test_emotion_tts_scenarios() -> None:
    print("\n=== TTS emotion control ===", flush=True)
    with TestClient(app) as client:
        results = [run_scenario(client, scenario) for scenario in SCENARIOS]
    failed = [item for item in results if not item["passed"]]
    print(
        "SUMMARY "
        + " | ".join(
            f"{item['id']}:{item['latency_ms']}ms/{item['format']}/{'PASS' if item['passed'] else 'FAIL'}"
            for item in results
        ),
        flush=True,
    )
    assert not failed, failed


if __name__ == "__main__":
    test_emotion_tts_scenarios()
