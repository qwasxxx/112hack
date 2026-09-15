# sys112-trainer

Тренажёр операторов системы 112. На этом этапе — архитектурный skeleton, не продукт.

## Запуск

Требования: Node.js 20+, pnpm 10, Docker (для PostgreSQL).

```bash
cp .env.example .env
pnpm install
docker compose up --build -d
pnpm dev
```

Отдельные процессы:

```bash
pnpm dev:api        # http://localhost:3000
pnpm dev:student    # http://localhost:5173
pnpm dev:teacher    # http://localhost:5174
pnpm dev:stt        # http://127.0.0.1:8090  (T-one realtime STT)
```

Учебный звонок с микрофоном и realtime-расшифровкой: `docs/stt.md`.

Проверка:

- API liveness: `GET http://localhost:3000/api/v1/health`
- API readiness: `GET http://localhost:3000/api/v1/ready`
- Student/Teacher показывают статус API и realtime-соединения

Документация: `docs/architecture/overview.md`, ADRs в `docs/adr/`.
