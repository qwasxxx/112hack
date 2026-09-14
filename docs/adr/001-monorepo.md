# 001. Monorepo

## Context

Нужны Student Web, Teacher Web, API и общие контракты. Команда небольшая, контракты realtime и scenario schema будут часто меняться.

## Decision

Один Git-репозиторий, pnpm workspaces, Turborepo. Пакеты `@sys112/*`.

## Alternatives

Polyrepo даёт независимый release cycle, но разъезжает типы событий и scenario schema. Для этого продукта это дороже, чем удобство раздельных реп.

## Consequences

Приложения запускаются отдельно. Deployment targets можно разрезать позже по `apps/*`. Общие типы не копируются.
