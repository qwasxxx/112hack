from pathlib import Path
import os


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


REPO_ROOT = Path(__file__).resolve().parents[4]


def _load_repo_env() -> None:
    path = REPO_ROOT / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


_load_repo_env()

TTS_HOST = _env("TTS_HOST", "0.0.0.0")
TTS_PORT = int(_env("TTS_PORT", "8092"))
TTS_LANGUAGE = _env("TTS_LANGUAGE", "ru")
TTS_SAMPLE_RATE = int(_env("TTS_SAMPLE_RATE", "48000"))
TTS_THREADS = int(_env("TTS_THREADS", "2"))
TTS_MODEL_ID = _env("TTS_MODEL_ID", "v5_5_ru")
TTS_BACKEND = _env("TTS_BACKEND", "fish")
TTS_DEVICE = _env("TTS_DEVICE", "cpu")
TTS_QWEN_MODEL = _env("TTS_QWEN_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice")
TTS_QWEN_OPERATOR_SPEAKER = _env("TTS_QWEN_OPERATOR_SPEAKER", "Aiden")
TTS_QWEN_VICTIM_SPEAKER = _env("TTS_QWEN_VICTIM_SPEAKER", "Serena")
TTS_QWEN_INSTRUCT_OPERATOR = _env("TTS_QWEN_INSTRUCT_OPERATOR", "Speak in Russian, calm and clear, like a 112 dispatcher.")
TTS_QWEN_INSTRUCT_VICTIM = _env("TTS_QWEN_INSTRUCT_VICTIM", "Speak in Russian, frightened and a bit rushed, as if calling 112.")
TTS_QWEN_REF_AUDIO = _env("TTS_QWEN_REF_AUDIO", "")
TTS_QWEN_REF_TEXT = _env("TTS_QWEN_REF_TEXT", "")
TTS_LOCAL_PLAY = _env("TTS_LOCAL_PLAY", "0").strip().lower() in {"1", "true", "yes", "on"}
TTS_OPERATOR_SPEAKER = _env("TTS_OPERATOR_SPEAKER", "aidar")
TTS_VICTIM_SPEAKER = _env("TTS_VICTIM_SPEAKER", "xenia")
TTS_SILERO_DIR = Path(_env("TTS_SILERO_DIR", str(REPO_ROOT / "models" / "tts" / "silero")))
if not TTS_SILERO_DIR.is_absolute():
    TTS_SILERO_DIR = (Path.cwd() / TTS_SILERO_DIR).resolve()
TTS_SILERO_ONNX = TTS_SILERO_DIR / "ru_v4.onnx"
TTS_SILERO_PT = TTS_SILERO_DIR / "v4_ru.pt"
TTS_SILERO_URL = _env("TTS_SILERO_URL", "https://models.silero.ai/models/tts/ru/v4_ru.pt")
TTS_DEFAULT_VOICE = _env("TTS_DEFAULT_VOICE", "victim_panic")
TTS_DEFAULT_EMOTION = _env("TTS_DEFAULT_EMOTION", "panic")
TTS_AMBIENT_DIR = Path(_env("TTS_AMBIENT_DIR", str(REPO_ROOT / "models" / "tts" / "ambient")))
if not TTS_AMBIENT_DIR.is_absolute():
    TTS_AMBIENT_DIR = (Path.cwd() / TTS_AMBIENT_DIR).resolve()
AMBIENT_TYPES = ("traffic_siren", "car_crash", "crowd_panic", "phone_static")

FISH_API_KEY = _env("FISH_API_KEY", "")
FISH_MODEL = _env("FISH_MODEL", "s2.1-pro")
FISH_LATENCY = _env("FISH_LATENCY", "balanced")
FISH_FORMAT = _env("FISH_FORMAT", "pcm")
FISH_SAMPLE_RATE = int(_env("FISH_SAMPLE_RATE", "44100"))
FISH_REFERENCE_ID = _env("FISH_REFERENCE_ID", "")
FISH_REFERENCE_AUDIO = _env("FISH_REFERENCE_AUDIO", "")
FISH_REFERENCE_TEXT = _env("FISH_REFERENCE_TEXT", "")
FISH_OPERATOR_REFERENCE_ID = _env("FISH_OPERATOR_REFERENCE_ID", "")
FISH_VICTIM_REFERENCE_ID = _env("FISH_VICTIM_REFERENCE_ID", "")
FISH_VICTIM_FEMALE_REFERENCE_ID = _env("FISH_VICTIM_FEMALE_REFERENCE_ID", "edb14aecd5544c209e3b80cd4a8fb736")
FISH_VICTIM_MALE_REFERENCE_ID = _env("FISH_VICTIM_MALE_REFERENCE_ID", "c00d6cb8865943b3b8d3ba6bab3da1f1")
FISH_OPERATOR_REFERENCE_AUDIO = _env("FISH_OPERATOR_REFERENCE_AUDIO", "")
FISH_VICTIM_REFERENCE_AUDIO = _env("FISH_VICTIM_REFERENCE_AUDIO", "")
FISH_OPERATOR_REFERENCE_TEXT = _env("FISH_OPERATOR_REFERENCE_TEXT", "")
FISH_VICTIM_REFERENCE_TEXT = _env("FISH_VICTIM_REFERENCE_TEXT", "")
