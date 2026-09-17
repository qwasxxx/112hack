from __future__ import annotations

import logging
from pathlib import Path

from sys112_tts.config import TTS_SILERO_PT, TTS_SILERO_URL

logger = logging.getLogger("sys112_tts")


def ensure_silero_model(dest: Path = TTS_SILERO_PT) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 1_000_000:
        return dest
    import urllib.request

    logger.info("[TTS] Downloading Silero v4 from %s", TTS_SILERO_URL)
    tmp = dest.with_suffix(".part")
    urllib.request.urlretrieve(TTS_SILERO_URL, tmp)
    tmp.replace(dest)
    logger.info("[TTS] Silero model saved %s (%s bytes)", dest, dest.stat().st_size)
    return dest
