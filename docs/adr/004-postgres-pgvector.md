# 004. PostgreSQL + pgvector

## Context

Нужны транзакции, jsonb сценариев, и позже RAG по методичкам.

## Decision

PostgreSQL 16 + pgvector. Отдельная vector DB не вводится. `VectorStorePort` позволяет заменить хранилище.

## Alternatives

Pinecone/Qdrant/Weaviate лучше на миллионах векторов. Сейчас корпус — нормативные документы и сценарии. Лишняя система не окупается.

## Consequences

Один backup/ops контур. HNSW-индекс добавим, когда появится ingestion.
