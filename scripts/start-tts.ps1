$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Tts = Join-Path $Root "apps\tts"
$Venv = Join-Path $Tts ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"

if (-not (Test-Path $Py)) {
  python -m venv $Venv
}

if (-not $env:TTS_BACKEND) { $env:TTS_BACKEND = "silero" }
if (-not $env:TTS_DEVICE) { $env:TTS_DEVICE = "cpu" }
if (-not $env:TTS_QWEN_MODEL) { $env:TTS_QWEN_MODEL = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice" }

Write-Host "[TTS] Installing base requirements..."
& $Py -m pip install -q -r (Join-Path $Tts "requirements.txt")

$env:PYTHONPATH = Join-Path $Tts "src"
$env:TTS_HOST = "127.0.0.1"
$env:TTS_PORT = "8092"
$env:TTS_LANGUAGE = "ru"
$env:TTS_THREADS = "4"

if ($env:TTS_BACKEND -match "qwen") {
  Write-Host "[TTS] Installing qwen-tts for CPU..."
  & $Py -m pip install -q -r (Join-Path $Tts "requirements-qwen.txt")
  Write-Host "[TTS] Qwen3-TTS $($env:TTS_QWEN_MODEL) on $($env:TTS_DEVICE)"
} elseif ($env:TTS_BACKEND -match "fish") {
  Write-Host "[TTS] Fish Audio s2.1-pro latency=balanced"
} else {
  Write-Host "[TTS] Ensuring Silero v5_5_ru model..."
  & $Py (Join-Path $Tts "scripts\download_silero.py")
}

Write-Host "[TTS] Voice service on http://127.0.0.1:8092 backend=$($env:TTS_BACKEND)"
& $Py -m uvicorn sys112_tts.app:app --host 127.0.0.1 --port 8092
