$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Stt = Join-Path $Root "apps\stt"
$Venv = Join-Path $Stt ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"
$Model = Join-Path $Root "models\sherpa-onnx-streaming-t-one-russian-2025-09-08"

if (-not (Test-Path $Py)) {
  python -m venv $Venv
}
& $Py -m pip install --upgrade pip
& $Py -m pip install -r (Join-Path $Stt "requirements.txt")

$env:PYTHONPATH = Join-Path $Stt "src"
$env:STT_MODE = "local"
$env:STT_MODEL_PATH = $Model
$env:STT_SAMPLE_RATE = "8000"
$env:STT_NUM_THREADS = "2"
$env:STT_DECODING_METHOD = "greedy_search"
$env:STT_ONNX_PROVIDER = "cpu"
$env:STT_ENDPOINT_RULE1 = "1.2"
$env:STT_ENDPOINT_RULE2 = "0.7"
$env:STT_ENDPOINT_CONFIRM = "0.12"
$env:STT_HOST = "127.0.0.1"
$env:STT_PORT = "8090"

& $Py (Join-Path $Stt "scripts\download_model.py")
& $Py -m uvicorn sys112_stt.app:app --host 127.0.0.1 --port 8090
