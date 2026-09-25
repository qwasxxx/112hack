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
if [ -x /usr/local/bin/cloudflared ]; then
  /usr/local/bin/cloudflared tunnel --no-autoupdate --protocol http2 --url "http://127.0.0.1:${PORT}" \
    > /tmp/cloudflared.log 2>&1 &
  (
    i=0
    while [ "$i" -lt 30 ]; do
      url=$(grep -o 'https://[-a-z0-9]*\.trycloudflare.com' /tmp/cloudflared.log | head -n 1 || true)
      if [ -n "$url" ]; then
        echo "[public] ${url}"
        break
      fi
      i=$((i + 1))
      sleep 1
    done
  ) &
fi
exec nginx -g 'daemon off;'
