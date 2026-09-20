from __future__ import annotations

from sys112_tts.config import TTS_BACKEND
from sys112_tts.engine_silero import EMOTIONS, build_silero_ssml, build_ssml

_backend = (TTS_BACKEND or "silero").strip().lower()

if _backend in {"qwen3", "qwen", "qwen-tts"}:
    from sys112_tts.engine_qwen import Qwen3TTSEngine as _Engine
else:
    from sys112_tts.engine_silero import SileroTTSEngine as _Engine

engine = _Engine()
TTSEngine = _Engine
SileroTTSEngine = _Engine
SileroOnnxEngine = _Engine
Qwen3TTSEngine = _Engine

__all__ = [
    "EMOTIONS",
    "Qwen3TTSEngine",
    "SileroOnnxEngine",
    "SileroTTSEngine",
    "TTSEngine",
    "build_silero_ssml",
    "build_ssml",
    "engine",
]
