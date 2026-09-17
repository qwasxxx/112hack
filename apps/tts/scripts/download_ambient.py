from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sys112_tts.ambient_lib import write_ambient_library
from sys112_tts.config import TTS_AMBIENT_DIR


if __name__ == "__main__":
    write_ambient_library(TTS_AMBIENT_DIR)
