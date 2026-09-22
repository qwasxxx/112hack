from __future__ import annotations

import os

os.environ["LLM_MODE"] = "mock"
os.environ.setdefault("LLM_MIN_MODEL_BYTES", "1")
