export type LlmEvent =
  | { type: 'ready'; call_id?: string }
  | { type: 'assistant_partial'; text: string; gen?: number; purpose?: string }
  | { type: 'assistant_final'; text: string; gen?: number; purpose?: string }
  | { type: 'generation_cancelled'; gen?: number }
  | { type: 'analysis_partial'; text: string }
  | { type: 'analysis_final'; text: string }
  | { type: 'intervention_ack'; accepted?: boolean; code?: string }
  | { type: 'session_closed'; call_id?: string }
  | { type: 'error'; message: string; code?: string };

export function isStaleAssistantEvent(
  event: LlmEvent,
  liveGen: number,
  cancelled: ReadonlySet<number>,
): boolean {
  if (event.type !== 'assistant_partial' && event.type !== 'assistant_final') {
    return false;
  }
  if (typeof event.gen !== 'number') {
    return false;
  }
  return cancelled.has(event.gen) || event.gen < liveGen;
}

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
