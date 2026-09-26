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
_DEFAULT_MODEL = REPO_ROOT / "models" / "sherpa-onnx-streaming-t-one-russian-2025-09-08"

STT_MODE = _env("STT_MODE", "huggingface")
HF_STT_MODES = frozenset({"huggingface", "hf"})
FASTER_WHISPER_MODES = frozenset({"faster_whisper", "faster-whisper", "fw"})
STT_ENGINE = _env("STT_ENGINE", "").strip().lower().replace("-", "_")
if STT_MODE == "mock":
    STT_ENGINE = "mock"
elif STT_MODE in FASTER_WHISPER_MODES:
    STT_ENGINE = "faster_whisper"
elif not STT_ENGINE:
    STT_ENGINE = "hf" if STT_MODE in HF_STT_MODES else "t-one"
if STT_ENGINE in FASTER_WHISPER_MODES:
    STT_ENGINE = "faster_whisper"
STT_FALLBACK = _env("STT_FALLBACK", "").strip().lower().replace("-", "_")
if STT_FALLBACK in FASTER_WHISPER_MODES:
    STT_FALLBACK = "faster_whisper"
if STT_FALLBACK in HF_STT_MODES:
    STT_FALLBACK = "hf"
STT_MODEL_DIR = Path(_env("STT_MODEL_PATH", str(_DEFAULT_MODEL)))
if not STT_MODEL_DIR.is_absolute():
    STT_MODEL_DIR = (Path.cwd() / STT_MODEL_DIR).resolve()
TONE_NATIVE_RATE = 8000
WHISPER_SAMPLE_RATE = 16000
STT_WIRE_SAMPLE_RATE = 16000
_whisper_like = STT_MODE in HF_STT_MODES or STT_MODE in FASTER_WHISPER_MODES or STT_ENGINE == "faster_whisper"
# Whisper capture is 16 kHz. Ignore leftover telephony 8 kHz env values in HF mode.
STT_SAMPLE_RATE = WHISPER_SAMPLE_RATE if _whisper_like else TONE_NATIVE_RATE
STT_NUM_THREADS = int(_env("STT_NUM_THREADS", "2"))
STT_DECODING_METHOD = _env("STT_DECODING_METHOD", "greedy_search")
STT_HOST = _env("STT_HOST", "0.0.0.0")
STT_PORT = int(_env("STT_PORT", "8090"))
STT_ONNX_PROVIDER = _env("STT_ONNX_PROVIDER", "cpu")
STT_ENDPOINT_RULE1 = float(_env("STT_ENDPOINT_RULE1", "1.2"))
STT_ENDPOINT_RULE2 = float(_env("STT_ENDPOINT_RULE2", "0.7"))
STT_ENDPOINT_CONFIRM = float(_env("STT_ENDPOINT_CONFIRM", "0.12"))
STT_PARTIAL_DELAY = float(_env("STT_PARTIAL_DELAY", "0.5"))
STT_HF_PREROLL_SEC = float(_env("STT_HF_PREROLL_SEC", "0.40"))
STT_HF_MIN_SPEECH_SEC = float(_env("STT_HF_MIN_SPEECH_SEC", "0.12"))
STT_HF_SILENCE_SEC = float(_env("STT_HF_SILENCE_SEC", "0.40"))
STT_HF_SILENCE_FAST_SEC = float(_env("STT_HF_SILENCE_FAST_SEC", "0.28"))
STT_HF_LONG_SPEECH_SEC = float(_env("STT_HF_LONG_SPEECH_SEC", "1.25"))
STT_HF_SILENCE_LONG_SEC = float(_env("STT_HF_SILENCE_LONG_SEC", "0.34"))
STT_HF_PARTIAL_SEC = float(_env("STT_HF_PARTIAL_SEC", "1.0"))
STT_HF_PARTIAL_INTERVAL_SEC = float(_env("STT_HF_PARTIAL_INTERVAL_SEC", "1.0"))
STT_HF_TRAIL_KEEP_SEC = float(_env("STT_HF_TRAIL_KEEP_SEC", "0.16"))
MODEL_URL = _env(
    "STT_MODEL_URL",
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-t-one-russian-2025-09-08.tar.bz2",
)
HF_TOKEN = _env("HF_TOKEN", "")
STT_HF_MODEL = _env("STT_HF_MODEL", "openai/whisper-large-v3-turbo")
STT_HF_BASE_URL = _env("STT_HF_BASE_URL", "https://router.huggingface.co").rstrip("/")
STT_HF_LANGUAGE = "ru"
STT_HF_TASK = "transcribe"
STT_FW_MODEL = _env("STT_FW_MODEL", "large-v3-turbo")
STT_FW_DEVICE = _env("STT_FW_DEVICE", "cpu")
STT_FW_COMPUTE_TYPE = _env("STT_FW_COMPUTE_TYPE", "int8")
STT_FW_BEAM_SIZE = int(_env("STT_FW_BEAM_SIZE", "1"))
_default_fw_threads = str(max(4, min(8, os.cpu_count() or 4)))
STT_FW_THREADS = int(_env("STT_FW_THREADS", _default_fw_threads))
