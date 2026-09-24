from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

logger = logging.getLogger("sys112_tts")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    backend = os.getenv("TTS_BACKEND", "silero").strip().lower()
    if backend in {"qwen3", "qwen", "qwen-tts", "fish", "fish-audio", "fishaudio", "s2-pro", "s2.1-pro"}:
        print(f"[TTS] skip Silero download, backend={backend}", flush=True)
        raise SystemExit(0)
    from sys112_tts.engine import engine
    engine.load()
    print(f"[TTS] Silero {engine.health().get('model')} ready", flush=True)
