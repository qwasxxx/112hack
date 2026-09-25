#!/usr/bin/env sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
LLM="$ROOT/apps/llm"
VENV="$LLM/.venv"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install -q -r "$LLM/requirements.txt"

export PYTHONPATH="$LLM/src"
export LLM_HOST=127.0.0.1
export LLM_PORT=8091
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
exec "$VENV/bin/python" -m uvicorn sys112_llm.app:app --host 127.0.0.1 --port 8091
