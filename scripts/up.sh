#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null; then
  echo "Нужен Docker Desktop / Docker Engine" >&2
  exit 1
fi
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
fi
mkdir -p "$ROOT/models"

echo "Первый запуск скачает STT (~130 МБ), Qwen (~2.5 ГБ) и Silero. Потом откройте http://localhost:5173"
exec docker compose up --build "$@"
