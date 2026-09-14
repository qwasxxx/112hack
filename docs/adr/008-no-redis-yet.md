# 008. No Redis yet

## Context

Redis обычно берут для pub/sub, session, jobs, rate limit.

## Decision

Пока in-memory session store, in-process event bus, in-process job queue. Порты уже есть.

Redis появится, когда будет второй инстанс API или нужна очередь evaluation/ingestion.

## Alternatives

Сразу Redis + BullMQ. Лишний dependency для одного процесса на демо.

## Consequences

Рестарт API теряет активные звонки, пока нет durable flush в `calls.runtime_state`. Это приемлемо для skeleton; перед боевыми сессиями нужен persist-on-change.
