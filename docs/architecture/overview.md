# Архитектура

## Решение

Модульный монолит на TypeScript в одном monorepo.

Один backend-процесс (`apps/api`) обслуживает REST, WebSocket и AI-оркестрацию. Student Web и Teacher Web — отдельные SPA. Сценарий описывается данными. Состояние сценария живёт в приложении, не в LLM.

Отдельные процессы `realtime` и `ai` на этом этапе не нужны: они разъехали бы source of truth и добавили бы hop в voice pipeline.

## Почему не микросервисы

Команда небольшая, формат ближе к хакатону с путём в production. Голос и teacher intervention требуют согласованного runtime state на каждом ходе. Сеть между API, realtime и AI здесь — стоимость без выигрыша. Границы модулей позволяют вынести сервис позже, не переписывая домен.

## Стек

| Слой | Выбор | Почему |
| --- | --- | --- |
| Frontend | React 19 + Vite | Два независимых SPA с аудио и WebSocket. SSR не даёт пользы. |
| Backend | NestJS | Модули = bounded contexts, DI для портов. |
| Language | TypeScript | Общие контракты с фронтендом. |
| Validation | Zod | Одни схемы для API, WS и scenario JSON. |
| ORM | Drizzle | Явный SQL, нормальная работа с jsonb/pgvector. |
| DB | PostgreSQL + pgvector | Транзакции и RAG в одной операционной единице. |
| Realtime | Socket.IO | Комнаты звонка, reconnect во время сессии. |
| Monorepo | pnpm + Turborepo | Раздельный запуск apps, общие пакеты. |
| AI | Ports + mock adapters | Провайдер меняется без домена. |

Next.js, GraphQL, Redis, отдельная vector DB, отдельный AI-сервис — отвергнуты для текущего масштаба. См. ADR.

## Структура

```
apps/student-web     training UI
apps/teacher-web     monitoring / control UI
apps/api             modular monolith
apps/stt             FastAPI T-one STT (:8090)
apps/llm             FastAPI Qwen conversation (:8091)
apps/tts             FastAPI Coqui XTTS-v2 (:8092)
packages/shared-types
packages/api-client
packages/ui
infra/docker
infra/database
docs/adr
docs/architecture
docs/scenarios
```

`services/api|realtime|ai` из исходного предложения нет. Realtime и AI-порты — модули API. Живой голосовой пайплайн вынесен в отдельные Python-процессы: STT, LLM, TTS. NestJS `TextToSpeechPort` остаётся mock и в звонке не вызывается.

## Живой TTS (Coqui XTTS-v2)

Озвучка реплик ИИ — изолированный сервис `apps/tts`, Python 3.11 + FastAPI, порт **8092**. Модель `coqui/XTTS-v2`, `language=ru`, zero-shot cloning по референсу из `models/tts/voices/` (`panic.wav`, `victim_female.wav`, `victim_male.wav`; при отсутствии файлов создаются WAV-заглушки).

- Health: `GET http://127.0.0.1:8092/health`
- Синтез: `POST /api/v1/tts/synthesize` `{ "text", "voice_id" }` → `audio/wav`
- Student Web проксирует `/api/v1/tts` на `:8092`. На `assistant_final` UI вызывает `playTtsAudio`; если сервис недоступен, звонок продолжается текстом.
- Запуск: `pnpm dev:tts` / `scripts/start-tts.ps1`. Docker-сервис `tts` в `infra/docker/docker-compose.yml`.

## Bounded contexts (модули NestJS)

| Модуль | Ответственность |
| --- | --- |
| identity | пользователи, роли STUDENT/TEACHER/ADMIN |
| catalog | courses, lessons, versioned scenario definitions |
| scenario-engine | state machine, facts, interventions → новое runtime state |
| training | calls, transcripts, incident cards, voice pipeline orchestration |
| evaluation | асинхронная структурированная оценка |
| knowledge | documents, chunking, retrieval |
| realtime | доставка событий, не бизнес-логика |
| audit | teacher interventions и чувствительные действия |
| progress | агрегированный прогресс |

Студент и преподаватель — роли identity, не отдельные сервисы.

## Направление зависимостей

```
student-web / teacher-web → api-client → shared-types
                          → ui
apps/api domain modules → ports → infrastructure adapters
apps/api ↛ ui, ↛ api-client
```

Domain не импортирует OpenAI/Yandex/pgvector. Только порты.

## Source of truth

Активный звонок: `CallSessionStorePort` (сейчас in-memory) + `calls.runtime_state` в Postgres как durable copy.

LLM на каждый ход получает собранный контекст из runtime state. После ответа Scenario Engine коммитит факты/переходы. У модели нет собственного долгоживущего session state.

Optimistic concurrency: `stateVersion`.

## Потоки

### Обычный API request

Клиент → REST `/api/v1/...` → controller выбранного модуля → application service → Postgres. Без AI, если операция не требует генерации.

### AI call (практика)

1. Аудио студента → STT port
2. Нормализованный transcript segment
3. Load runtime state (session store)
4. Scenario Engine собирает prompt context (+ optional RAG)
5. LLM port возвращает utterance + structured deltas
6. Engine применяет deltas, `save(expectedVersion)`
7. Student Web `POST /api/v1/tts/synthesize` (Coqui XTTS-v2, процесс `apps/tts`)
8. Event bus: `TranscriptUpdated`, `AiTurnCompleted`, `ScenarioStateChanged`

### Teacher intervention

1. Teacher Web шлёт доменную команду (`TeacherInterventionCommand`), не prompt/temperature
2. `InterventionService` грузит runtime state
3. Scenario Engine применяет эффект, если тип разрешён сценарием
4. Audit log
5. Event bus: `TeacherInterventionApplied` + `ScenarioStateChanged`
6. Следующий ход LLM видит уже новое состояние

### Evaluation

После `CallEnded` job `evaluation` (не в realtime-hot-path). Вход: transcript, card, timeline, criteria version. Выход: `EvaluationResult`. Хранятся scenario version, rules version, model/prompt version.

### RAG

Documents → chunk → embeddings port → vector store port → retrieval → context assembly → LLM. Knowledge data отдельно от transactional таблиц. Сейчас store in-memory; Postgres/pgvector подключается адаптером без смены домена.

## Данные

- Transactional: users, catalog, calls, cards, evaluations
- Realtime/ephemeral: active session state
- Knowledge: documents, chunks, embeddings
- Analytics: training_progress, позже отдельные агрегаты

## Что сознательно не сделано

Auth JWT, реальные адаптеры STT/TTS/LLM внутри NestJS, WebRTC media path, загрузка документов, UI сценариев, Redis/BullMQ, Prometheus, GraphQL, микросервисы домена. Живые STT/LLM/TTS работают отдельными FastAPI-процессами и не проходят через Nest AI ports.
