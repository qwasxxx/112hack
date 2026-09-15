export type SttEvent =
  | { type: 'ready'; stt?: string }
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string; start?: number; end?: number }
  | { type: 'session_complete'; text: string; phrases?: Array<{ text: string; start: number; end: number }> }
  | { type: 'error'; message: string; code?: string };

export function parseSttEvent(raw: string): SttEvent | undefined {
  try {
    const value = JSON.parse(raw) as SttEvent;
    if (!value || typeof value !== 'object' || typeof value.type !== 'string') {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

export type TranscriptState = {
  finals: Array<{ id: string; text: string }>;
  partial: string;
  completeText: string;
};

export function emptyTranscript(): TranscriptState {
  return { finals: [], partial: '', completeText: '' };
}

export function applySttEvent(state: TranscriptState, event: SttEvent): TranscriptState {
  if (event.type === 'partial') {
    return { ...state, partial: event.text };
  }
  if (event.type === 'final') {
    const nextFinals = [...state.finals, { id: crypto.randomUUID(), text: event.text }];
    return { finals: nextFinals, partial: '', completeText: nextFinals.map((item) => item.text).join(' ') };
  }
  if (event.type === 'session_complete') {
    return { ...state, partial: '', completeText: event.text || state.completeText };
  }
  return state;
}
