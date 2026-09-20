$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Llm = Join-Path $Root "apps\llm"
$Venv = Join-Path $Llm ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"
$Model = Join-Path $Root "models\llm\Qwen3-4B-Q4_K_M.gguf"

if (-not (Test-Path $Py)) {
  python -m venv $Venv
}
& $Py -m pip install -q -r (Join-Path $Llm "requirements.txt")

$env:PYTHONPATH = Join-Path $Llm "src"
$env:LLM_MODE = "local"
$env:LLM_PROVIDER = "local"
$env:LLM_RUNTIME = "llama_cpp"
$env:LLM_MODEL_PATH = $Model
$env:LLM_BASE_URL = "http://127.0.0.1:8080"
$env:LLM_HOST = "127.0.0.1"
$env:LLM_PORT = "8091"
$env:LLM_LLAMA_PORT = "8080"
$env:LLM_TEMPERATURE = "0.5"
$env:LLM_TOP_P = "0.9"
$env:LLM_MAX_TOKENS = "48"
$env:LLM_CONTEXT_SIZE = "2048"

Write-Host "[LLM] Loading model..."
& $Py (Join-Path $Llm "scripts\download_model.py")
& $Py -m uvicorn sys112_llm.app:app --host 127.0.0.1 --port 8091
