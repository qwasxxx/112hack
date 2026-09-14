import { z } from 'zod';
export const KnowledgeSourceKind = z.enum([
  'regulation',
  'method',
  'scenario',
  'instruction',
  'reference',
]);
export type KnowledgeSourceKind = z.infer<typeof KnowledgeSourceKind>;

export interface KnowledgeDocument {
  id: string;
  title: string;
  kind: KnowledgeSourceKind;
  sourceUri?: string;
  checksum: string;
  version: number;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  ordinal: number;
  content: string;
  metadata: Record<string, string>;
}

export interface RetrievalQuery {
  text: string;
  documentIds?: string[];
  kind?: KnowledgeSourceKind;
  limit: number;
}

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
}
