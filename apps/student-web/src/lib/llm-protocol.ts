export type LlmEvent =
  | { type: 'ready'; call_id?: string }
  | { type: 'assistant_partial'; text: string; gen?: number }
  | { type: 'assistant_final'; text: string; gen?: number }
  | { type: 'generation_cancelled'; gen?: number }
  | { type: 'analysis_partial'; text: string }
  | { type: 'analysis_final'; text: string }
  | { type: 'intervention_ack'; accepted?: boolean; code?: string }
  | { type: 'session_closed'; call_id?: string }
  | { type: 'error'; message: string; code?: string };
export function parseLlmEvent(raw: string): LlmEvent | undefined {
  try {
    const value = JSON.parse(raw) as LlmEvent;
    if (!value || typeof value !== 'object' || typeof value.type !== 'string') {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}
