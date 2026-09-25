$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Stt = Join-Path $Root "apps\stt"
$Venv = Join-Path $Stt ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"

if (-not (Test-Path $Py)) {
  python -m venv $Venv
}
& $Py -m pip install --upgrade pip
& $Py -m pip install -r (Join-Path $Stt "requirements.txt")

$env:PYTHONPATH = Join-Path $Stt "src"
$env:STT_HOST = "127.0.0.1"
$env:STT_PORT = "8090"
$EnvFile = Join-Path $Root ".env"
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $name = $Matches[1].Trim()
      if (-not [string]::IsNullOrEmpty($name) -and -not (Test-Path "Env:$name")) {
        Set-Item -Path "Env:$name" -Value $Matches[2].Trim().Trim('"').Trim("'")
      }
    }
  }
}
if (-not $env:STT_MODE) {
  $env:STT_MODE = "huggingface"
}
& $Py -m uvicorn sys112_stt.app:app --host 127.0.0.1 --port 8090
