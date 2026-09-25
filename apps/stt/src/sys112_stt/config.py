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

STT_MODE = _env("STT_MODE", "huggingface")
STT_SAMPLE_RATE = int(_env("STT_SAMPLE_RATE", "8000"))
STT_HOST = _env("STT_HOST", "0.0.0.0")
STT_PORT = int(_env("STT_PORT", "8090"))
HF_TOKEN = _env("HF_TOKEN", "")
STT_HF_MODEL = _env("STT_HF_MODEL", "openai/whisper-large-v3-turbo")
STT_HF_BASE_URL = _env("STT_HF_BASE_URL", "https://router.huggingface.co").rstrip("/")
STT_HF_LANGUAGE = _env("STT_HF_LANGUAGE", "russian")
HF_STT_MODES = frozenset({"huggingface", "hf"})
