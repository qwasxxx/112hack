from pathlib import Path
import os


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


REPO_ROOT = Path(__file__).resolve().parents[4]
_DEFAULT_MODEL = REPO_ROOT / "models" / "sherpa-onnx-streaming-t-one-russian-2025-09-08"

STT_MODE = _env("STT_MODE", "local")
STT_MODEL_DIR = Path(_env("STT_MODEL_PATH", str(_DEFAULT_MODEL)))
if not STT_MODEL_DIR.is_absolute():
    STT_MODEL_DIR = (Path.cwd() / STT_MODEL_DIR).resolve()
STT_SAMPLE_RATE = int(_env("STT_SAMPLE_RATE", "8000"))
STT_NUM_THREADS = int(_env("STT_NUM_THREADS", "2"))
STT_DECODING_METHOD = _env("STT_DECODING_METHOD", "greedy_search")
STT_HOST = _env("STT_HOST", "0.0.0.0")
STT_PORT = int(_env("STT_PORT", "8090"))
STT_ONNX_PROVIDER = _env("STT_ONNX_PROVIDER", "cpu")
STT_ENDPOINT_RULE1 = float(_env("STT_ENDPOINT_RULE1", "1.2"))
STT_ENDPOINT_RULE2 = float(_env("STT_ENDPOINT_RULE2", "0.7"))
STT_ENDPOINT_CONFIRM = float(_env("STT_ENDPOINT_CONFIRM", "0.12"))
STT_PARTIAL_DELAY = float(_env("STT_PARTIAL_DELAY", "0.5"))
MODEL_URL = _env(
    "STT_MODEL_URL",
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-t-one-russian-2025-09-08.tar.bz2",
)
