from pathlib import Path
import os


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


REPO_ROOT = Path(__file__).resolve().parents[4]
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
LLM_TEMPERATURE = float(_env("LLM_TEMPERATURE", "0.7"))
LLM_TOP_P = float(_env("LLM_TOP_P", "0.8"))
LLM_TOP_K = int(_env("LLM_TOP_K", "20"))
LLM_MAX_TOKENS = int(_env("LLM_MAX_TOKENS", "96"))
LLM_CONTEXT_SIZE = int(_env("LLM_CONTEXT_SIZE", "2048"))
LLM_N_GPU_LAYERS = int(_env("LLM_N_GPU_LAYERS", "99"))
LLM_TIMEOUT_SEC = float(_env("LLM_TIMEOUT_SEC", "60"))
LLM_REPEAT_PENALTY = float(_env("LLM_REPEAT_PENALTY", "1.12"))
_cpu = os.cpu_count() or 4
LLM_THREADS = int(_env("LLM_THREADS", str(max(2, _cpu - 1) if _cpu > 4 else _cpu)))
LLM_TOOLS_DIR = Path(_env("LLM_TOOLS_DIR", str(REPO_ROOT / "tools" / "llama.cpp")))
LLM_MODEL_URL = _env(
    "LLM_MODEL_URL",
    "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
)
LLM_MIN_MODEL_BYTES = int(_env("LLM_MIN_MODEL_BYTES", "2000000000"))
