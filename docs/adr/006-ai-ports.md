# 006. AI ports

## Context

Провайдеры STT/LLM/TTS/embeddings сменяемы. Домен не должен знать SDK.

## Decision

Порты: SpeechToText, LanguageModel, TextToSpeech, Embeddings, EvaluationModel, Retrieval, VectorStore. Сейчас mock adapters. Wiring через Nest DI tokens.

LLM не хранит session. Каждый ход — stateless complete() + runtime state из Scenario Engine.

## Alternatives

Прямой вызов OpenAI из training service. Быстрее на день, ломает замену провайдера и тестирование без ключей.

## Consequences

Демо и CI работают без API keys. Боевой adapter подключается сменой модуля.
