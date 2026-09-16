#!/usr/bin/env sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
LLM="$ROOT/apps/llm"
VENV="$LLM/.venv"
MODEL="$ROOT/models/llm/Qwen3-4B-Q4_K_M.gguf"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install -q -r "$LLM/requirements.txt"

export PYTHONPATH="$LLM/src"
export LLM_MODE=local
export LLM_MODEL_PATH="$MODEL"
export LLM_BASE_URL=http://127.0.0.1:8080
export LLM_HOST=127.0.0.1
export LLM_PORT=8091

"$VENV/bin/python" "$LLM/scripts/download_model.py"
exec "$VENV/bin/python" -m uvicorn sys112_llm.app:app --host 127.0.0.1 --port 8091
