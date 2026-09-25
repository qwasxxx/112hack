#!/bin/sh
set -eu
PORT="${PORT:-8080}"
sed "s/__PORT__/${PORT}/" /opt/sys112/nginx.conf > /etc/nginx/conf.d/sys112.conf
rm -f /etc/nginx/sites-enabled/default

cd /repo/apps/api
node dist/infrastructure/database/migrate.js
node dist/main.js &
PYTHONPATH=/repo/apps/stt/src /opt/venv/bin/python -m uvicorn sys112_stt.app:app --host 127.0.0.1 --port 8090 &
PYTHONPATH=/repo/apps/llm/src /opt/venv/bin/python -m uvicorn sys112_llm.app:app --host 127.0.0.1 --port 8091 &
PYTHONPATH=/repo/apps/tts/src /opt/venv/bin/python -m uvicorn sys112_tts.app:app --host 127.0.0.1 --port 8092 &
exec nginx -g 'daemon off;'
