#!/usr/bin/env sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
STT="$ROOT/apps/stt"
VENV="$STT/.venv"
MODEL="$ROOT/models/sherpa-onnx-streaming-t-one-russian-2025-09-08"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install -r "$STT/requirements.txt"

export PYTHONPATH="$STT/src"
export STT_MODE=local
export STT_MODEL_PATH="$MODEL"
export STT_SAMPLE_RATE=8000
export STT_NUM_THREADS=4
export STT_DECODING_METHOD=greedy_search
export STT_ONNX_PROVIDER=cpu
export STT_HOST=127.0.0.1
export STT_PORT=8090

"$VENV/bin/python" "$STT/scripts/download_model.py"
exec "$VENV/bin/python" -m uvicorn sys112_stt.app:app --host 127.0.0.1 --port 8090
