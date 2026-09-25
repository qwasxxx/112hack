# Распознавание речи

Потоковое распознавание русской речи для учебного звонка.

## Цепочка

1. Student UI (`apps/student-web`) запрашивает микрофон.
2. Браузер даёт PCM, фронтенд даунсемплит в **PCM s16le mono 8000 Hz**.
3. Чанки ~300 мс уходят по WebSocket `ws://<host>/ws/stt` (Vite проксирует на `127.0.0.1:8090`).
4. Python-сервис `apps/stt` отправляет фразу на модель из `STT_HF_MODEL`.
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

Ожидается `"stt": "ready"` и модель из `STT_HF_MODEL`.

## Docker

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
| `STT_MODE` | `huggingface` | режим распознавания |
| `STT_HF_MODEL` | `openai/whisper-large-v3-turbo` | модель |
| `STT_HF_LANGUAGE` | `russian` | язык |
| `STT_HOST` / `STT_PORT` | `0.0.0.0` / `8090` | адрес сервиса |

Речь принимает сервис на порту 8090. Отдельного переключателя провайдера в API нет.

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

Распознавание ходит во внешний сервис, поэтому для речи нужен интернет и `HF_TOKEN`.
