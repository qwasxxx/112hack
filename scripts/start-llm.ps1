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
$Provider = & $Py -c "from sys112_llm.config import LLM_PROVIDER; print(LLM_PROVIDER)"
if ($Provider.Trim() -eq "local") {
  Write-Host "[LLM] Loading local model..."
  & $Py (Join-Path $Llm "scripts\download_model.py")
} else {
  Write-Host "[LLM] Using external provider: $($Provider.Trim())"
}
& $Py -m uvicorn sys112_llm.app:app --host 127.0.0.1 --port 8091
