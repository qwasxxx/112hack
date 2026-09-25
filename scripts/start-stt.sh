#!/usr/bin/env sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
STT="$ROOT/apps/stt"
VENV="$STT/.venv"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install -r "$STT/requirements.txt"

export PYTHONPATH="$STT/src"
export STT_HOST=127.0.0.1
export STT_PORT=8090
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
if [ -z "${STT_MODE:-}" ]; then
  export STT_MODE=huggingface
fi
exec "$VENV/bin/python" -m uvicorn sys112_stt.app:app --host 127.0.0.1 --port 8090
