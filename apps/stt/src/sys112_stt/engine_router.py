from __future__ import annotations

import logging

from sys112_stt.config import STT_ENGINE, STT_FALLBACK
from sys112_stt.engine_hf import HfSttError, transcribe_wav as transcribe_hf

logger = logging.getLogger("sys112_stt")


async def transcribe_wav(wav: bytes, timeout: float | None = None) -> str:
    if STT_ENGINE == "faster_whisper":
        from sys112_stt.engine_faster_whisper import transcribe_wav as transcribe_local

        try:
            return await transcribe_local(wav, timeout)
        except Exception as exc:
            if STT_FALLBACK == "hf":
                logger.warning("faster-whisper failed, falling back to hf: %s", exc)
                return await transcribe_hf(wav, timeout)
            raise
    if STT_ENGINE == "hf" and STT_FALLBACK == "faster_whisper":
        try:
            return await transcribe_hf(wav, timeout)
        except HfSttError as exc:
            logger.warning("hf failed, falling back to faster-whisper: %s", exc)
            from sys112_stt.engine_faster_whisper import transcribe_wav as transcribe_local

            return await transcribe_local(wav, timeout)
    return await transcribe_hf(wav, timeout)
