from __future__ import annotations

from sys112_tts.engine_fish import FishTTSEngine as _Engine

engine = _Engine()
TTSEngine = _Engine

__all__ = ["TTSEngine", "engine"]
