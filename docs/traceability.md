# Трассируемость и карта материалов

**Назначение документа.** Показать новой команде, на каких источниках основана документация, какие факты подтверждены и где есть противоречия.

## Карта источников

| Источник | Что подтверждает | Надёжность/оговорка |
| --- | --- | --- |
| `docs/TZ-audit-sys112-21092026.docx` | сверку реализации с официальным ТЗ, сознательно отложенные функции | вторичный источник; прямо говорит, что не заменяет ТЗ |
| `infra/docker/docker-compose.yml` | фактические процессы, порты, volumes, health, Silero | главный источник развёртывания |
| `apps/student-web/src/app.tsx` | единое SPA и ролевое переключение | главный источник UI composition |
| Nest controllers/services | REST API и SQL-поведение | главный источник backend runtime |
| Python `app.py`/`config.py` | STT/LLM/TTS endpoints и env | главный источник голосовых сервисов |
| migrations `0001`–`0006` | фактическая схема и seeds | главный источник данных |
| `packages/shared-types` | типизированный архитектурный контракт | часть типов не используется основным UI-путём |
| `docs/adr/*.md` | первоначальные решения | несколько решений устарели или реализованы частично |
| Git history до `a5f7fce` | последовательность последних возможностей | не заменяет требования и приёмку |
| запуск тестов 24.09.2026 | фактический результат проверок | среда не позволила полный Docker smoke |

## Подтверждённые факты

- Compose поднимает models, Postgres, API, STT, llama.cpp, LLM manager, TTS и web.
- Основной web на `5173` содержит все три роли.
- PostgreSQL хранит пользователей, результаты, назначения, live presence, recordings и каталог.
- Основной голосовой путь идёт напрямую browser ↔ STT/LLM/TTS через proxy.
- Docker использует T-one, Qwen3-4B GGUF и Silero.
- API создаёт ежедневные и ручные JSON snapshots, но это неполный backup.
- Серверная авторизация после login отсутствует.

## Расхождения

| Тема | Ранее заявлено | Фактическое состояние | Решение документации |
| --- | --- | --- | --- |
| Frontend | два SPA, отдельный teacher web | один демонстрационный `student-web` включает три роли | описывать единый SPA; отдельные apps как неосновные |
| TTS | Coqui XTTS-v2 | compose: Silero; код также содержит Qwen TTS варианты | считать Silero production-like demo default |
| TypeScript everywhere | Python отвергнут | STT/LLM/TTS на Python FastAPI | ADR 003 помечен superseded in part |
| RAG/pgvector | архитектурный обзор описывает поток | ТЗ-аудит: не подключаем; adapter/store не образуют пользовательскую функцию | статус «каркас/не реализовано» |
| OpenAPI | «можно сгенерировать позже» | спецификации нет | API документировать из кода, OpenAPI — backlog |
| Backup | UI говорит о резервной копии | JSON экспорт неполон и внутри container FS | явно ограничить обещание |
| LLM provider | README: только локальный | рабочее дерево содержит незакоммиченную поддержку Hugging Face, `.env` её включает | базовый commit считать local; изменение — неподтверждённое до commit/review |
| ТЗ | упоминается официальный DOCX | самого официального файла нет | требования из аудита помечать косвенными |

## Состояние рабочего дерева при аудите

На 24.09.2026 ветка `codex/integrate-teacher-panel` указывает на `a5f7fce`. До создания документации были незакоммиченные изменения LLM-конфигурации/клиента/старта и DDS файлов, а также `.pnpm-store/`. Они сохранены без изменения и не считаются утверждённой архитектурой.

## Принципы структуры

Навигация следует Diátaxis: `development.md` — практическая инструкция, `api.md`/`data.md` — справочник, `architecture.md` — объяснение, README — быстрый старт. Архитектурное описание адаптирует arc42/C4; ADR остаются короткими по MADR; требования и статусы вынесены отдельно, чтобы не смешивать намерения с реализацией.

Ориентиры: [arc42](https://arc42.org/documentation/), [C4 model](https://c4model.com/), [Diátaxis](https://diataxis.fr/), [MADR](https://adr.github.io/madr/), [OpenAPI](https://spec.openapis.org/), [Google SRE Workbook](https://sre.google/workbook/implementing-slos/), [OWASP Threat Modeling](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html), [Google developer documentation style](https://developers.google.com/style).

## Реестр документов

| Документ | Для кого | Основание | Требует подтверждения |
| --- | --- | --- | --- |
| `README.md` | новый разработчик, демо-команда | compose, package scripts, app composition | полный clean-machine start |
| `product.md` | владелец, команда | UI, ТЗ-аудит | официальное ТЗ и окончательные границы |
| `user-flows.md` | эксперт, UX, QA, разработчик | фактические React-переходы, API и роли | очная проверка полного Docker-сценария |
| `requirements.md` | аналитик, QA | код, миграции, ТЗ-аудит | приоритеты заказчика, NFR/SLO |
| `architecture.md` | разработчик, архитектор | compose, app wiring, services | судьба отдельных frontend apps |
| `data.md` | backend, ops | migrations, services | retention и restore |
| `api.md` | frontend/backend | controllers, Pydantic, shared-types | единый error/auth contract |
| `development.md` | новый разработчик | scripts/config | чистая машина и Linux/macOS путь |
| `testing.md` | QA, разработчик | тестовые файлы и запуск 24.09 | STT/TTS/full e2e |
| `operations.md` | демо/ops | compose, health, backup code | проверенный rollback/restore |
| `security.md` | владелец, security, разработчик | auth/code/config threat review | требования по ПДн и network deployment |
| `limitations.md` | команда, владелец | все источники | ответы на открытые вопросы |
| `adr/README.md` | архитектор | существующие ADR и код | решения по расхождениям |

Графические материалы `docs/assets/system-architecture.png` и `docs/assets/user-flow-overview.png` построены по тем же источникам, что соответствующие Markdown-документы; SVG-файлы рядом являются редактируемыми оригиналами.
