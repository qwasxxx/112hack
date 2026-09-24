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
_DEFAULT_MODEL = REPO_ROOT / "models" / "llm" / "Qwen3-4B-Q4_K_M.gguf"

LLM_MODE = _env("LLM_MODE", "local")
LLM_PROVIDER = _env("LLM_PROVIDER", "local")
LLM_RUNTIME = _env("LLM_RUNTIME", "llama_cpp")
LLM_MODEL_NAME = _env("LLM_MODEL_NAME", "Qwen3-4B")
LLM_MODEL_PATH = Path(_env("LLM_MODEL_PATH", str(_DEFAULT_MODEL)))
if not LLM_MODEL_PATH.is_absolute():
    LLM_MODEL_PATH = (Path.cwd() / LLM_MODEL_PATH).resolve()
LLM_BASE_URL = _env("LLM_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
LLM_HOST = _env("LLM_HOST", "0.0.0.0")
LLM_PORT = int(_env("LLM_PORT", "8091"))
LLM_LLAMA_PORT = int(_env("LLM_LLAMA_PORT", "8080"))
LLM_TEMPERATURE = float(_env("LLM_TEMPERATURE", "0.3"))
LLM_TOP_P = float(_env("LLM_TOP_P", "0.9"))
LLM_TOP_K = int(_env("LLM_TOP_K", "20"))
LLM_MIN_P = float(_env("LLM_MIN_P", "0.05"))
LLM_MAX_TOKENS = int(_env("LLM_MAX_TOKENS", "48"))
LLM_CONTEXT_SIZE = int(_env("LLM_CONTEXT_SIZE", "2048"))
LLM_N_GPU_LAYERS = 0
LLM_TIMEOUT_SEC = float(_env("LLM_TIMEOUT_SEC", "60"))
LLM_REPEAT_PENALTY = float(_env("LLM_REPEAT_PENALTY", "1.05"))
LLM_ANALYSIS_MAX_TOKENS = int(_env("LLM_ANALYSIS_MAX_TOKENS", "180"))
OPENAI_API_KEY = _env("OPENAI_API_KEY", "")
OPENAI_SCORE_MODEL = _env("OPENAI_SCORE_MODEL", "o3-mini")
OPENAI_BASE_URL = _env("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
HF_TOKEN = _env("HF_TOKEN", "")


def _default_threads() -> str:
    logical = os.cpu_count() or 4
    return str(max(4, min(logical - 2, 8)))


def _default_batch_threads() -> str:
    logical = os.cpu_count() or 4
    return str(max(int(_default_threads()), min(logical, 16)))


LLM_THREADS = int(_env("LLM_THREADS", _default_threads()))
LLM_THREADS_BATCH = int(_env("LLM_THREADS_BATCH", _default_batch_threads()))
LLM_TOOLS_DIR = Path(_env("LLM_TOOLS_DIR", str(REPO_ROOT / "tools" / "llama.cpp")))
LLM_MODEL_URL = _env(
    "LLM_MODEL_URL",
    "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
)
LLM_MIN_MODEL_BYTES = int(_env("LLM_MIN_MODEL_BYTES", "2000000000"))
