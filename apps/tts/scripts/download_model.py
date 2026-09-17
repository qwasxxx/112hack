from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sys112_tts.download import ensure_silero_model


if __name__ == "__main__":
    path = ensure_silero_model()
    print(f"[TTS] Silero model ready: {path}", flush=True)
