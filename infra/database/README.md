Transactional schema lives here.

- `migrations/*.sql` — source of truth for Postgres + pgvector.
- Drizzle schema in `apps/api/src/infrastructure/database/schema` mirrors tables for type-safe access.
- `knowledge_chunks.embedding` is `vector(1536)` in SQL. The Drizzle column stays a placeholder until the pgvector adapter is wired; vector search is behind `VectorStorePort`.
