# 009. REST + typed events, not GraphQL

## Context

Два известных клиента, realtime отдельно.

## Decision

Versioned REST `/api/v1`. Realtime — отдельный protocol v1. GraphQL не используем.

## Alternatives

GraphQL удобен для teacher dashboard с произвольными выборками. Сейчас схема узкая, подписки дублировали бы Socket.IO.

## Consequences

OpenAPI можно сгенерировать позже с DTO из Zod.
