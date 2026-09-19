# Realtime STT (T-one)

Локальное потоковое распознавание русской речи для учебного звонка 112.

Аудио не уходит во внешние облачные STT API.

## Цепочка

1. Student UI (`apps/student-web`) запрашивает микрофон.
2. Браузер даёт PCM, фронтенд даунсемплит в **PCM s16le mono 8000 Hz**.
3. Чанки ~300 мс уходят по WebSocket `ws://<host>/ws/stt` (Vite проксирует на `127.0.0.1:8090`).
4. Python-сервис `apps/stt` держит одну модель T-one в памяти и отдельный recognizer stream на каждый сокет.
5. Partial/final текст возвращается в UI.

## Запуск локально (Windows)

В корне репозитория:

```powershell
cp .env.example .env
pnpm install
.\scripts\start-stt.ps1
```

В другом терминале:

```powershell
pnpm dev:student
```

Откройте http://localhost:5173

- выберите сценарий
- «Начать учебный вызов»
- «Позвонить»
- разрешите микрофон
- говорите по-русски
- «Завершить»

Проверка сервиса:

```powershell
curl http://127.0.0.1:8090/health
```

Ожидается `"stt": "ready"`, `"model": "t-one"`, `"local": true`.

## Docker

Первый запуск скачивает модель в `./models/` (~100+ МБ, нужен интернет один раз).

```bash
docker compose up --build stt
```

или

```bash
docker compose -f infra/docker/docker-compose.yml up --build stt
```

CPU достаточно. GPU не требуется.

## Переменные

| Переменная | По умолчанию | Смысл |
| --- | --- | --- |
| `STT_MODE` | `local` | `local` — T-one; `mock` — явный mock для UI |
| `STT_MODEL_PATH` | `./models/sherpa-onnx-streaming-t-one-russian-2025-09-08` | каталог модели |
| `STT_SAMPLE_RATE` | `8000` | вход ASR |
| `STT_NUM_THREADS` | `4` | CPU threads |
| `STT_DECODING_METHOD` | `greedy_search` | без KenLM |
| `STT_ONNX_PROVIDER` | `cpu` | `cpu` или `cuda` |
| `STT_HOST` / `STT_PORT` | `0.0.0.0` / `8090` | bind |
| `STT_ENDPOINT_RULE1` | `1.2` | тишина до endpoint, если речь ещё не распознана, сек |
| `STT_ENDPOINT_RULE2` | `0.7` | тишина после распознанной речи, сек |
| `STT_ENDPOINT_CONFIRM` | `0.12` | доп. подтверждение после endpoint, сек |

`STT_PROVIDER=mock` в корневом `.env` относится к NestJS-адаптеру API, не к этому сервису.

## Протокол WebSocket

`/ws/stt`

Frontend → backend:

```json
{"type":"start","sample_rate":8000,"channels":1,"encoding":"pcm_s16le"}
```

далее binary frames PCM s16le mono 8 kHz.

`{"type":"stop"}` завершает сессию.

Backend → frontend: `ready`, `partial`, `final` (`text`, `start`, `end`), `session_complete`, `error`.

## Ручной тест фраз

- Здравствуйте, у меня пожар.
- Пожар происходит в квартире.
- Пятый этаж, квартира сорок три.
- Адрес: улица Малышева, дом пятьдесят один.
- В квартире находятся два человека.

Текст должен появляться во время речи (partial), затем закрепляться (final). После «Завершить» partial становится частью итоговой расшифровки.

## Тесты

```powershell
.\apps\stt\.venv\Scripts\python -m pytest apps/stt/tests -q
node --test apps/student-web/test/stt-client.test.mjs
pnpm --filter @sys112/student-web typecheck
```

## Offline

После `pnpm install`, `pip install -r apps/stt/requirements.txt` и однократной загрузки модели интернет не нужен. Модель читается с диска.

На Windows без Docker используйте скрипт выше. Docker/WSL — основной portable-путь, KenLM не требуется.
