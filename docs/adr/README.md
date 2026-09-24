# Реестр архитектурных решений

**Назначение документа.** Помочь разработчикам отличать действующие решения от исходных намерений. Существующие ADR не переписаны задним числом; ниже дан аудит их соответствия реализации на 24.09.2026.

| ADR | Статус | Комментарий |
| --- | --- | --- |
| [001 Monorepo](001-monorepo.md) | принято и реализовано | pnpm workspace + Turborepo |
| [002 Modular monolith](002-modular-monolith.md) | частично | Nest API монолит, но голосовые компоненты вынесены в Python-процессы |
| [003 TypeScript stack](003-typescript-stack.md) | частично заменено реализацией | frontend/API TS; STT/LLM/TTS Python |
| [004 PostgreSQL + pgvector](004-postgres-pgvector.md) | частично | PostgreSQL используется; RAG/полноценный pgvector flow не подключён |
| [005 Socket.IO](005-realtime-socketio.md) | частично | gateway есть; основной live/voice flow использует REST и прямые WS |
| [006 AI ports](006-ai-ports.md) | частично | Nest ports/mocks есть, но браузер вызывает отдельные сервисы напрямую |
| [007 Scenario as data](007-scenario-as-data.md) | частично | билеты — данные/JSON, но не весь UI идёт через server scenario engine |
| [008 No Redis](008-no-redis-yet.md) | принято | Redis отсутствует |
| [009 REST not GraphQL](009-rest-not-graphql.md) | принято | REST + WebSocket, OpenAPI отсутствует |
| [010 Evaluation context](010-evaluation-context.md) | частично | module skeleton есть, фактический разбор также выполняется LLM/UI потоком |
| [011 Two frontends](011-two-frontends.md) | заменено демонстрационной реализацией | роли интегрированы в `student-web`; отдельные apps не запускаются compose |

Новые ADR следует писать в момент решения и включать: контекст, варианты, решение, причины, последствия и статус. В первую очередь команде нужны решения о едином SPA, поддерживаемых LLM-провайдерах и модели backup/restore; до явного обсуждения они остаются открытыми вопросами, а не вымышленными ADR.
