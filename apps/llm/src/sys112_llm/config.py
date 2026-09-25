from pathlib import Path
import os


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


REPO_ROOT = Path(__file__).resolve().parents[4]


def _load_repo_env() -> None:
    path = REPO_ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        key = name.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


_load_repo_env()

LLM_MODE = _env("LLM_MODE", "live")
LLM_PROVIDER = _env("LLM_PROVIDER", "huggingface")
LLM_RUNTIME = _env("LLM_RUNTIME", "chat")
LLM_MODEL_NAME = _env("LLM_MODEL_NAME", "Qwen/Qwen3.5-9B")
LLM_BASE_URL = _env("LLM_BASE_URL", "https://router.huggingface.co").rstrip("/")
LLM_HOST = _env("LLM_HOST", "0.0.0.0")
LLM_PORT = int(_env("LLM_PORT", "8091"))
LLM_TEMPERATURE = float(_env("LLM_TEMPERATURE", "0.3"))
LLM_TOP_P = float(_env("LLM_TOP_P", "0.9"))
LLM_TOP_K = int(_env("LLM_TOP_K", "20"))
LLM_MIN_P = float(_env("LLM_MIN_P", "0.05"))
LLM_MAX_TOKENS = int(_env("LLM_MAX_TOKENS", "48"))
LLM_TIMEOUT_SEC = float(_env("LLM_TIMEOUT_SEC", "60"))
LLM_REPEAT_PENALTY = float(_env("LLM_REPEAT_PENALTY", "1.05"))
LLM_ANALYSIS_MAX_TOKENS = int(_env("LLM_ANALYSIS_MAX_TOKENS", "180"))
HF_TOKEN = _env("HF_TOKEN", "")
