from pathlib import Path
import os


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


REPO_ROOT = Path(__file__).resolve().parents[4]

TTS_HOST = _env("TTS_HOST", "0.0.0.0")
TTS_PORT = int(_env("TTS_PORT", "8092"))
TTS_LANGUAGE = _env("TTS_LANGUAGE", "ru")
TTS_SAMPLE_RATE = int(_env("TTS_SAMPLE_RATE", "48000"))
TTS_THREADS = int(_env("TTS_THREADS", "4"))
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
