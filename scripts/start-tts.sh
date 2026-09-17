#!/usr/bin/env sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
TTS="$ROOT/apps/tts"
VENV="$TTS/.venv"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install -q -r "$TTS/requirements.txt"

export PYTHONPATH="$TTS/src"
export TTS_HOST=127.0.0.1
export TTS_PORT=8092
export TTS_LANGUAGE=ru
export TTS_THREADS=4

"$VENV/bin/python" "$TTS/scripts/download_silero.py"
exec "$VENV/bin/python" -m uvicorn sys112_tts.app:app --host 127.0.0.1 --port 8092
