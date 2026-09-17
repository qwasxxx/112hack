from __future__ import annotations

import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sys112_tts.download import ensure_silero_model

logger = logging.getLogger("sys112_tts")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    path = ensure_silero_model()
    print(f"[TTS] Silero model {path}", flush=True)
