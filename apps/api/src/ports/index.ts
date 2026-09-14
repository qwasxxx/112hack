import type { ScenarioRuntimeState } from '@sys112/shared-types';

export interface SpeechToTextPort {
  transcribe(input: { callId: string; audio: Buffer; mimeType: string }): Promise<{ text: string; isFinal: boolean }>;
}

export interface LanguageModelPort {
  complete(input: {
    callId: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    jsonSchema?: Record<string, unknown>;
  }): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>;
}

export interface TextToSpeechPort {
  synthesize(input: { callId: string; text: string; voiceProfileId: string }): Promise<{ audio: Buffer; mimeType: string }>;
}

export interface EmbeddingsPort {
  embed(texts: string[]): Promise<number[][]>;
}

export interface EvaluationModelPort {
  evaluate(input: { callId: string; system: string; payload: unknown }): Promise<{ json: unknown; rawText: string }>;
}

export interface RetrievalPort {
  retrieve(input: { query: string; documentIds?: string[]; limit: number }): Promise<
    Array<{ chunkId: string; documentId: string; content: string; score: number }>
  >;
}

export interface VectorStorePort {
  upsert(
    chunks: Array<{ id: string; documentId: string; content: string; embedding: number[]; metadata: Record<string, string> }>,
  ): Promise<void>;
  search(input: { embedding: number[]; limit: number; documentIds?: string[] }): Promise<
    Array<{ chunkId: string; documentId: string; content: string; score: number }>
  >;
}

export interface EventBusPort {
  publish(event: unknown): Promise<void>;
  subscribe(handler: (event: unknown) => void): () => void;
}

export interface CallSessionStorePort {
  get(callId: string): Promise<ScenarioRuntimeState | undefined>;
  save(state: ScenarioRuntimeState, expectedVersion: number): Promise<ScenarioRuntimeState>;
  delete(callId: string): Promise<void>;
}

export type JobName = 'evaluation' | 'document_ingestion' | 'analytics';

export interface JobQueuePort {
  enqueue(name: JobName, payload: Record<string, unknown>): Promise<{ jobId: string }>;
}
