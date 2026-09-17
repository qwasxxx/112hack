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
pnpm dev:llm        # http://127.0.0.1:8091  (Qwen3-4B conversation)
pnpm dev:tts        # http://127.0.0.1:8092  (Coqui XTTS-v2 speech)
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

## Локальный диалог (Qwen3-4B)

Ответ на звонок генерирует локальная Qwen3-4B (GGUF Q4_K_M, ~2.5 ГБ) через llama.cpp. Облачные LLM не используются.

Первый `pnpm dev:llm` / `.\scripts\start-llm.ps1`:

1. ставит Python-зависимости;
2. скачивает `models/llm/Qwen3-4B-Q4_K_M.gguf`, если файла нет;
3. скачивает `llama-server`, если его нет;
4. поднимает llama.cpp на `http://127.0.0.1:8080` и Conversation Manager на `http://127.0.0.1:8091`.

Нужен интернет только на первую загрузку. GPU не обязателен. Повторно модель не качается.

Проверка: `GET http://127.0.0.1:8091/api/llm/health` → `"status": "ready"`.

Ориентиры на CPU (Windows, Q4_K_M, без GPU): старт модели ~1 мин, первый токен ~2–3 с, ответ ~4 с, RAM ~4 ГБ. VRAM не используется, пока нет NVIDIA.

В звонке LLM отвечает **только на final** фразу T-one, помнит историю текущего `call_id`. Подробности: `docs/llm.md`.

## Озвучка (Coqui XTTS-v2)

Ответ ИИ в учебном звонке озвучивает отдельный FastAPI-сервис `apps/tts` (порт 8092). NestJS, STT и LLM не меняются. Клонирование голоса — zero-shot по WAV из `models/tts/voices/`.

Первый `pnpm dev:tts` / `.\scripts\start-tts.ps1`:

1. ставит Python-зависимости в `apps/tts/.venv`;
2. скачивает `coqui/XTTS-v2` в `./models/tts/xtts-v2/`, если весов нет;
3. при отсутствии референсов создаёт заглушки `victim_female.wav`, `victim_male.wav`, `panic.wav`;
4. поднимает TTS на `http://127.0.0.1:8092`.

Нужен интернет только на первую загрузку (~2 ГБ). CUDA используется, если доступна, иначе CPU. Без сервиса или модели звонок остаётся текстовым.

Проверка: `GET http://127.0.0.1:8092/health` → `"status": "ready"`. Синтез: `POST /api/v1/tts/synthesize`.

Проверка:

- API liveness: `GET http://localhost:3000/api/v1/health`
- API readiness: `GET http://localhost:3000/api/v1/ready`
- Student/Teacher показывают статус API и realtime-соединения

Документация: `docs/architecture/overview.md`, ADRs в `docs/adr/`.
