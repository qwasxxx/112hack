# sys112-trainer

Тренажёр операторов системы 112: АРМ-карточка, живой звонок (STT + Qwen + TTS), ДДС и локальный PostgreSQL.

## Быстрый старт (одна команда)

Нужен только **Docker Desktop**. Node, Python и модели ставить не надо.

```bash
git clone https://github.com/qwasxxx/112hack.git
cd 112hack
docker compose up --build
```

Windows: `.\scripts\up.ps1`  
Linux/macOS: `./scripts/up.sh`

Первый запуск скачает образы и модели: STT T-one (~130 МБ), Qwen3-4B GGUF (~2.5 ГБ), Silero TTS. Нужны интернет и примерно 8 ГБ RAM. Дальше файлы лежат в `./models` и кэше Docker. Если занят порт `5173` (локальный Vite) — остановите его.

Откройте http://localhost:5173  
Учётки: `smirnova` / `petrov` / `volkova`, пароль `112`.

Остановка: `docker compose down` или `pnpm down`.

## Демо для жюри (обязательный путь)

Один origin: `http://localhost:5173`. Не открывайте teacher-web на `:5174`.

Учётки: `smirnova` (ученик), `petrov` (преподаватель), `volkova` (админ). Пароль у всех `112`.

```bash
docker compose up --build
```

Две вкладки Chrome: `smirnova` и `petrov`. Postgres, API, STT, Qwen и Silero поднимаются сами.

## Разработка без полного Docker

Требования: Node.js 20+, pnpm 10. Для голоса — Python 3.11. Docker — только для Postgres.

```bash
pnpm install
pnpm --filter @sys112/student-web dev   # http://localhost:5173
pnpm dev:stt        # http://127.0.0.1:8090  T-one
pnpm dev:llm        # http://127.0.0.1:8091  Qwen3-4B
pnpm dev:tts        # http://127.0.0.1:8092  Silero / XTTS
```

Локальный PostgreSQL и Nest API:

```bash
.\scripts\setup-postgres.ps1   # Docker: sys112 @ 127.0.0.1:5435
pnpm dev:api                   # http://localhost:3000
```

## Голосовая транскрибация

Распознавание речи **локальное**: облачный STT не используется. Без модели кнопка звонка микрофон откроет, но текст не пойдёт.

Первый запуск `pnpm dev:stt` (Windows: `.\scripts\start-stt.ps1`):

1. ставит Python-зависимости;
2. если модели ещё нет — скачивает `sherpa-onnx-streaming-t-one-russian-2025-09-08` (~130 МБ архив) в `./models/`;
3. поднимает STT на `http://127.0.0.1:8090`.

Нужен интернет только на эту загрузку. Дальше всё работает офлайн с диска, GPU не обязателен.

Проверка: `GET http://127.0.0.1:8090/health` должен вернуть `"stt": "ready"`. Затем student UI → учебный вызов → «Позвонить».

Подробности: `docs/stt.md`.

## Локальный диалог (Qwen3-4B)

Ответ на звонок генерирует локальная Qwen3-4B (GGUF Q4_K_M, ~2.5 ГБ) через llama.cpp. Облачные LLM не используются.

Первый `pnpm dev:llm` / `.\scripts\start-llm.ps1`:

1. ставит Python-зависимости;
2. скачивает `models/llm/Qwen3-4B-Q4_K_M.gguf`, если файла нет;
3. скачивает `llama-server`, если его нет;
4. поднимает llama.cpp на `http://127.0.0.1:8080` и Conversation Manager на `http://127.0.0.1:8091`.

Ориентиры на CPU: старт модели ~1 мин, ответ ~4 с, RAM ~4 ГБ. `n_ctx` 2048, температура 0.3.

Проверка: `GET http://127.0.0.1:8091/api/llm/health` → `"status": "ready"`.

В звонке LLM отвечает **только на final** фразу T-one, помнит историю текущего `call_id`. Подробности: `docs/llm.md`.

## Озвучка

Ответ ИИ озвучивает сервис `apps/tts` (порт 8092). Без него звонок остаётся текстовым.

Проверка: `GET http://127.0.0.1:8092/health` → `"status": "ready"`.

Документация: `docs/architecture/overview.md`, ADRs в `docs/adr/`.
