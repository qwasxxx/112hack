# Запуск и разработка

**Назначение документа.** Пошаговая инструкция для нового разработчика. Команды проверены на соответствие репозиторию; полный Docker-запуск 24.09.2026 не выполнялся из-за стоимости загрузки моделей.

## Вариант A: демонстрационный Docker-стенд

1. Установите Docker Desktop и убедитесь, что команда `docker compose version` работает.
2. Освободите порты `5173`, `3000`, `8080`, `8090`, `8091`, `8092`.
3. Из корня репозитория выполните:

   ```powershell
   docker compose up --build
   ```

4. Дождитесь healthy для `postgres`, `api`, `stt`, `llm`, `tts`.
5. Откройте `http://localhost:5173` и войдите `smirnova` / `112`.
6. Проверьте `http://localhost:3000/api/v1/health`, `http://localhost:8090/health`, `http://localhost:8091/health`, `http://localhost:8092/health`.
7. Для остановки выполните `docker compose down`. Не добавляйте `-v`, если данные нужно сохранить.

## Вариант B: разработка

Требования: Node.js не ниже 20.11, pnpm 10.33.1, Python 3.11, Docker для PostgreSQL. Выполните один раз:

```powershell
pnpm install
Copy-Item .env.example .env
.\scripts\setup-postgres.ps1
```

Откройте отдельный терминал для каждого процесса:

```powershell
pnpm dev:api
pnpm dev:stt
pnpm dev:llm
pnpm dev:tts
pnpm dev:student
```

Скрипты Python сами создают `.venv` и ставят зависимости. Не помещайте ключи в `.env.example` и не коммитьте `.env`.

## Важные переменные

| Переменная | Назначение | Безопасное значение для локальной разработки |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL | `postgres://sys112:sys112@127.0.0.1:5435/sys112` |
| `CORS_ORIGINS` | разрешённые origins API | localhost `5173`, при необходимости `5174` |
| `STT_HF_MODEL` | модель распознавания | `openai/whisper-large-v3-turbo` |
| `LLM_PROVIDER` | провайдер ответов | `huggingface` |
| `LLM_MODEL_NAME` | модель ответов | `Qwen/Qwen3.5-9B` |
| `LLM_BASE_URL` | адрес чата | `https://router.huggingface.co` |
| `TTS_BACKEND` | озвучка | `fish` |
| `HF_TOKEN` | доступ к речевым сервисам | хранить только в локальном `.env` |

При расхождении конфигурационных файлов источником истины для Docker-стенда является `infra/docker/docker-compose.yml`, а для запуска сервисов вне Docker — соответствующий `config.py`.

## Тестовые данные

Миграция `0002_app.sql` создаёт `smirnova`, `petrov`, `volkova` с паролем `112`. Каталог билетов находится в `apps/student-web/src/data/ags-tickets.json`; runtime-классификатор — в `features/arm112-simulator/data/classifier-runtime.json`.

## Буквальная smoke-проверка

1. Все четыре health URL отвечают без `down`/`not_ready`.
2. `smirnova` видит каталог и открывает брифинг.
3. В браузере дано разрешение микрофона.
4. После принятия звонка STT выдаёт final-текст.
5. LLM отвечает текстом; при TTS ready слышен звук.
6. После завершения появляется разбор.
7. `petrov` видит результат и запись.
8. `volkova` видит реальные статусы и создаёт snapshot.

## Частые проблемы

| Симптом | Проверка | Действие |
| --- | --- | --- |
| `5173` занят | запущен старый Vite/container | остановить прежний процесс или compose project |
| STT `model_not_ready` | `/health`, `HF_TOKEN` | проверить ключ и доступ к сервису распознавания |
| LLM долго `loading` | `/health` | проверить `HF_TOKEN` и `LLM_BASE_URL` |
| нет речи, но есть текст | `/health` TTS и консоль браузера | перезапустить TTS; обучение может продолжиться текстом |
| нет данных преподавателя | `/api/v1/training/health`, Postgres | проверить API proxy и миграции |
| микрофон запрещён | permissions браузера | разрешить microphone для localhost и перезагрузить |
| тест LLM видит другую модель | локальный `.env` | запускать тесты с изолированными env; это открытый дефект |
