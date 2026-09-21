$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Нужен Docker Desktop."
}
docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Откройте Docker Desktop и повторите."
}
if (-not (Test-Path (Join-Path $Root ".env"))) {
  Copy-Item (Join-Path $Root ".env.example") (Join-Path $Root ".env")
}
New-Item -ItemType Directory -Force -Path (Join-Path $Root "models") | Out-Null

Write-Host "Первый запуск скачает STT (~130 МБ), Qwen (~2.5 ГБ) и Silero. Потом откройте http://localhost:5173"
docker compose up --build @args
