# sys112-trainer

Тренажёр операторов системы 112. На этом этапе — архитектурный skeleton, не продукт.

## Запуск

Требования: Node.js 20+, pnpm 10, Docker (для PostgreSQL). Для голосовой транскрибации — Python 3.11 и ~200 МБ на диске под локальную модель T-one.

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

## Голосовая транскрибация

Распознавание речи **локальное**: облачный STT не используется. Без модели кнопка звонка микрофон откроет, но текст не пойдёт.

Первый запуск `pnpm dev:stt` (Windows: `.\scripts\start-stt.ps1`) или `docker compose up --build stt`:

1. ставит Python-зависимости;
2. если модели ещё нет — скачивает `sherpa-onnx-streaming-t-one-russian-2025-09-08` (~130 МБ архив) в `./models/`;
3. поднимает STT на `http://127.0.0.1:8090`.

Нужен интернет только на эту загрузку. Дальше всё работает офлайн с диска, GPU не обязателен. Повторно модель не качается.

Проверка: `GET http://127.0.0.1:8090/health` должен вернуть `"stt": "ready"`. Затем student UI → учебный вызов → «Позвонить».

Подробности: `docs/stt.md`.

Проверка:

- API liveness: `GET http://localhost:3000/api/v1/health`
- API readiness: `GET http://localhost:3000/api/v1/ready`
- Student/Teacher показывают статус API и realtime-соединения

Документация: `docs/architecture/overview.md`, ADRs в `docs/adr/`.
