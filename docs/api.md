# Интерфейсы системы

**Назначение документа.** Справочник для frontend/backend-разработчиков и диагностики интеграций. Здесь перечислены только маршруты, найденные в коде. Формальная OpenAPI-спецификация не настроена; source of truth — контроллеры NestJS, Pydantic-модели FastAPI и `packages/shared-types`.

## Общие правила

- Веб-клиент использует same-origin пути, Vite/Nginx проксирует их к сервисам.
- Nest API: `/api/v1/*`, JSON, порт `3000`.
- Ошибки не унифицированы: часть операций возвращает `{ok:false,message}`, часть — HTTP 4xx/5xx.
- API не требует bearer token и не проверяет роль вызывающего. Это критическое ограничение, а не контракт авторизации.

## Nest API

| Метод и путь | Назначение | Основной вход/выход |
| --- | --- | --- |
| `GET /api/v1/health` | liveness API | `{status,service,version,uptimeSec}` |
| `GET /api/v1/ready` | readiness DB/realtime/adapters | `{status,checks[]}` |
| `POST /api/v1/auth/login` | проверка логина в Postgres | `{login,password}` → `{ok,user?}` |
| `POST /api/v1/auth/register` | регистрация студента | `{login,email?,name?,password}` |
| `GET/POST /api/v1/users` | список/создание пользователя | `UserRecord[]` / `{ok,user}` |
| `PATCH /api/v1/users/:id` | роль, статус, пароль, имя | `{role?,status?,password?,name?}` |
| `GET /api/v1/admin/status` | health зависимостей | `{at,services[]}` |
| `GET /api/v1/admin/audit` | последние 200 audit-записей | массив записей |
| `GET /api/v1/admin/backup/status` | последний JSON snapshot | `{dir,lastAt,lastFile}` |
| `POST /api/v1/admin/backup` | создать JSON snapshot | объект snapshot |
| `POST /api/v1/admin/services/:id/:action` | `start`/`stop` поддержанного сервиса | `{ok,id,action,message?}` |
| `GET /api/v1/training/pipeline` | архитектурный список шагов | `{steps}` |
| `GET /api/v1/training/health` | health training store | объект статуса |
| `GET/PUT /api/v1/training/lessons[/:id]` | результаты по `login` / upsert | payload занятия |
| `GET/PUT /api/v1/training/assignments` | список / сохранение назначений | `{scenarioIds,teacherLogin}` |
| `GET/PUT /api/v1/training/class` | состояние занятия | `{active,startedAt?,teacherLogin,title,categories}` |
| `GET/PUT /api/v1/training/overlays[/:lessonId]` | экспертная оценка | `{expertScore?,comment?}` |
| `GET/PUT /api/v1/training/audit[/:id]` | учебный аудит | произвольный JSON payload |
| `GET/PUT/DELETE /api/v1/training/live[/:login]` | присутствие и прогресс | snapshot клиента |
| `GET/PUT /api/v1/training/cues[/:id]` | подсказки преподавателя | payload подсказки |
| `GET/PUT /api/v1/training/catalog` | overlays и custom-билеты | `{overlays?,custom?}` |
| `GET/POST /api/v1/training/recordings` | список / base64-загрузка записи | max 32 МБ декодированных байт |
| `GET /api/v1/training/recordings/:id` | inline/download аудио | binary, `?download=1` |

Точные SQL-поля и ответы: `apps/api/src/progress/training-store.service.ts`, `identity/*.ts`.

## Socket.IO API

Namespace `/realtime`, входящее событие `command`, исходящее `event`. Команды валидируются `realtimeCommandSchema`: `Ping`, `JoinCall`, `LeaveCall`. Join/leave меняет комнату `call:{id}`. Сейчас основной браузерный голосовой поток использует прямые WebSocket STT/LLM, а не этот gateway. Основание: `apps/api/src/realtime/realtime.gateway.ts`, `packages/shared-types/src/realtime`.

## STT

- `GET /health` — состояние модели.
- `POST /control/stop` — завершает процесс; предназначено только локальному админ-контуру.
- `WS /ws/stt`: клиент отправляет JSON `{"type":"start"}`, затем бинарные PCM16 mono чанки 8 кГц, в конце `{"type":"stop"}`. Сервер отвечает `ready`, partial/final событиями или `error`.

```json
{"status":"ok","stt":"ready","model":"t-one","local":true,"mode":"local","model_present":true}
```

## LLM manager

- `GET /health` и `GET /api/llm/health`.
- `POST /warmup`, `/score-call`, `/generate-ticket` и дубли с `/api/llm`.
- `POST /control/stop` и `/api/llm/control/stop`.
- `WS /ws/llm`: сообщения `start`, `kickoff`, `user_final`, `intervention`, `analyze`, `stop`; ответы включают `ready`, `assistant_partial`, `assistant_final`, `analysis_partial`, `analysis_final`, `intervention_ack`, `session_closed`, `error`.

```json
{"type":"start","call_id":"uuid","conversation_role":"victim","system_prompt":"...","opening":"..."}
```

Контракт частично типизирован в `apps/student-web/src/lib/llm-protocol.ts`, серверная реализация — `apps/llm/src/sys112_llm/app.py`.

## TTS

`POST /api/v1/tts/synthesize` принимает JSON с обязательным `text` и необязательными `role`, `emotion`, `voice_id`, `conversation_role`, `ambient_type`, `gender`, `speaker`, `pitch`, `speed`, `play`. Ответ `application/octet-stream`: повторяющиеся фреймы `[uint32 little-endian length][bytes]`, затем нулевая длина. Это не обычный WAV response. Заголовки включают `X-TTS-Stream`, `X-TTS-TTA-MS`, `X-TTS-Role`.

## Эволюция контрактов

Добавление OpenAPI полезно, но спецификацию следует генерировать или проверять против кода. До этого изменения маршрута требуют одновременно обновить `packages/shared-types`, клиент, этот документ и интеграционный тест.
