$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Llm = Join-Path $Root "apps\llm"
$Venv = Join-Path $Llm ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"
if (-not (Test-Path $Py)) {
  python -m venv $Venv
}
& $Py -m pip install -q -r (Join-Path $Llm "requirements.txt")

$env:PYTHONPATH = Join-Path $Llm "src"
& $Py -m uvicorn sys112_llm.app:app --host 127.0.0.1 --port 8091
