# 003. TypeScript stack

## Context

Нужны строгие контракты между SPA, REST, WebSocket и scenario JSON. AI-часть можно было бы писать на Python.

## Decision

TypeScript everywhere: React/Vite, NestJS, Zod, Drizzle.

Python FastAPI отвергнут: два языка в маленькой команде и потеря shared-types. Go отвергнут из-за скорости итерации. Next.js отвергнут: SSR не нужен двум закрытым SPA с аудио.

## Alternatives

Next.js ускорил бы BFF, но продублировал бы два app router дерева и смешал бы server/client вокруг WebSocket.

## Consequences

Один toolchain. AI провайдеры вызываются по HTTP из adapters.
