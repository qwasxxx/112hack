# 007. Scenario as data

## Context

Сценариев будет много. Hardcoded if/else в core недопустим.

## Decision

`ScenarioDefinition` — versioned JSON (Zod). Runtime — `ScenarioRuntimeState` с facts, emotional state, modifiers, `stateVersion`. Teacher меняет состояние через разрешённые intervention types.

Новые сценарии = новые rows `scenario_versions`, не релизы core.

## Alternatives

Код-сценарии на TypeScript. Гибко, но требует деплоя на каждый кейс и путает авторов сценариев.

## Consequences

Нужна валидация definition при публикации. Engine остаётся маленьким интерпретатором, не свалкой кейсов.
