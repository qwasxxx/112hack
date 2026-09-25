FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip nginx ca-certificates curl \
    libgomp1 libsndfile1 libportaudio2 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL -o /usr/local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/download/2025.8.1/cloudflared-linux-amd64 \
  && chmod +x /usr/local/bin/cloudflared \
  && python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

COPY apps/stt/requirements.txt /tmp/stt-requirements.txt
COPY apps/llm/requirements.txt /tmp/llm-requirements.txt
COPY apps/tts/requirements.txt /tmp/tts-requirements.txt
RUN pip install --no-cache-dir -r /tmp/stt-requirements.txt -r /tmp/llm-requirements.txt \
  && pip install --no-cache-dir -r /tmp/tts-requirements.txt

RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY tooling/vite-encode-fs.ts tooling/vite-encode-fs.ts
COPY packages packages
COPY apps/api apps/api
COPY apps/student-web apps/student-web
COPY apps/teacher-web apps/teacher-web
COPY infra/database/migrations infra/database/migrations
RUN pnpm install --frozen-lockfile --filter @sys112/api... --filter @sys112/student-web...
RUN pnpm --filter @sys112/shared-types build && pnpm --filter @sys112/api build
RUN pnpm --filter @sys112/student-web exec vite build

COPY apps/stt apps/stt
COPY apps/llm apps/llm
COPY apps/tts apps/tts
COPY infra/docker/nginx.railway.conf /opt/sys112/nginx.conf
COPY infra/docker/start-railway.sh /opt/sys112/start-railway.sh
RUN chmod +x /opt/sys112/start-railway.sh

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000
ENV MIGRATIONS_DIR=/repo/infra/database/migrations
ENV STT_MODE=huggingface
ENV STT_HF_LANGUAGE=russian
ENV LLM_PROVIDER=huggingface
ENV LLM_RUNTIME=openai
ENV LLM_MODE=local
ENV LLM_BASE_URL=https://router.huggingface.co
ENV TTS_BACKEND=fish
ENV TTS_LANGUAGE=ru

EXPOSE 8080
CMD ["/opt/sys112/start-railway.sh"]
