import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '../common/tokens';
import type { EmbeddingsPort, RetrievalPort, VectorStorePort } from '../ports';

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(TOKENS.EMBEDDINGS) private readonly embeddings: EmbeddingsPort,
    @Inject(TOKENS.VECTOR_STORE) private readonly vectors: VectorStorePort,
    @Inject(TOKENS.RETRIEVAL) private readonly retrieval: RetrievalPort,
  ) {}

  async search(query: string, limit = 6) {
    return this.retrieval.retrieve({ query, limit });
  }
}
