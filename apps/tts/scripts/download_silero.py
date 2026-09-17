from __future__ import annotations

import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sys112_tts.engine import engine

logger = logging.getLogger("sys112_tts")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    engine.load()
    print(f"[TTS] Silero {engine.health().get('model')} ready", flush=True)
