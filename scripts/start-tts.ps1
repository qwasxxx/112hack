$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Tts = Join-Path $Root "apps\tts"
$Venv = Join-Path $Tts ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"

if (-not (Test-Path $Py)) {
  python -m venv $Venv
}

Write-Host "[TTS] Installing Silero ONNX runtime..."
& $Py -m pip install -q -r (Join-Path $Tts "requirements.txt")

$env:PYTHONPATH = Join-Path $Tts "src"
$env:TTS_HOST = "127.0.0.1"
$env:TTS_PORT = "8092"
$env:TTS_LANGUAGE = "ru"
$env:TTS_THREADS = "4"

Write-Host "[TTS] Ensuring Silero v4 model..."
& $Py (Join-Path $Tts "scripts\download_silero.py")

Write-Host "[TTS] Voice service on http://127.0.0.1:8092"
& $Py -m uvicorn sys112_tts.app:app --host 127.0.0.1 --port 8092
