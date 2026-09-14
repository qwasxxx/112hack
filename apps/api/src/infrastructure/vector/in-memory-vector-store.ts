import { Injectable } from '@nestjs/common';
import type { RetrievalPort, VectorStorePort } from '../../ports';

@Injectable()
export class InMemoryVectorStore implements VectorStorePort, RetrievalPort {
  private readonly chunks: Array<{
    id: string;
    documentId: string;
    content: string;
    embedding: number[];
    metadata: Record<string, string>;
  }> = [];

  async upsert(
    chunks: Array<{
      id: string;
      documentId: string;
      content: string;
      embedding: number[];
      metadata: Record<string, string>;
    }>,
  ): Promise<void> {
    for (const chunk of chunks) {
      const index = this.chunks.findIndex((item) => item.id === chunk.id);
      if (index >= 0) {
        this.chunks[index] = chunk;
      } else {
        this.chunks.push(chunk);
      }
    }
  }

  async search(input: {
    embedding: number[];
    limit: number;
    documentIds?: string[];
  }): Promise<Array<{ chunkId: string; documentId: string; content: string; score: number }>> {
    const filtered = input.documentIds
      ? this.chunks.filter((chunk) => input.documentIds?.includes(chunk.documentId))
      : this.chunks;
    return filtered.slice(0, input.limit).map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      score: 0,
    }));
  }

  async retrieve(input: {
    query: string;
    documentIds?: string[];
    limit: number;
  }): Promise<Array<{ chunkId: string; documentId: string; content: string; score: number }>> {
    return this.search({ embedding: [input.query.length], limit: input.limit, documentIds: input.documentIds });
  }
}
