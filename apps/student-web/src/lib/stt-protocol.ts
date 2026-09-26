import { polishOperatorTranscript } from './russian-transcript.ts';

export type SttEvent =
  | { type: 'ready'; stt?: string; sample_rate?: number; session_id?: string }
  | { type: 'partial'; text: string; utt_id?: number; request_id?: string }
  | { type: 'final'; text: string; start?: number; end?: number; utt_id?: number; request_id?: string }
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
  finals: Array<{ id: string; text: string; uttId?: number }>;
  partial: string;
  completeText: string;
  lastFinalUttId: number;
  lastPartialUttId: number;
};

export function emptyTranscript(): TranscriptState {
  return { finals: [], partial: '', completeText: '', lastFinalUttId: 0, lastPartialUttId: 0 };
}

function eventUttId(event: SttEvent): number | undefined {
  if ((event.type === 'partial' || event.type === 'final') && typeof event.utt_id === 'number') {
    return event.utt_id;
  }
  return undefined;
}

export function applySttEvent(state: TranscriptState, event: SttEvent): TranscriptState {
  if (event.type === 'partial') {
    const gated = polishOperatorTranscript(event.text);
    if (!gated) {
      return state;
    }
    const uttId = eventUttId(event);
    if (uttId !== undefined && uttId <= state.lastFinalUttId) {
      return state;
    }
    if (uttId !== undefined && state.lastPartialUttId > 0 && uttId < state.lastPartialUttId) {
      return state;
    }
    return {
      ...state,
      partial: gated,
      lastPartialUttId: uttId ?? state.lastPartialUttId,
    };
  }
  if (event.type === 'final') {
    const gated = polishOperatorTranscript(event.text);
    const uttId = eventUttId(event);
    if (!gated) {
      return {
        ...state,
        partial: '',
        lastFinalUttId: Math.max(state.lastFinalUttId, uttId ?? state.lastFinalUttId),
      };
    }
    if (uttId !== undefined && uttId < state.lastFinalUttId) {
      return state;
    }
    const last = state.finals.at(-1);
    if (last && last.text === gated && (uttId === undefined || last.uttId === uttId)) {
      return {
        ...state,
        partial: '',
        lastFinalUttId: Math.max(state.lastFinalUttId, uttId ?? 0),
      };
    }
    const nextFinals = [...state.finals, { id: crypto.randomUUID(), text: gated, uttId }];
    return {
      finals: nextFinals,
      partial: '',
      completeText: nextFinals.map((item) => item.text).join(' '),
      lastFinalUttId: Math.max(state.lastFinalUttId, uttId ?? state.lastFinalUttId),
      lastPartialUttId: state.lastPartialUttId,
    };
  }
  if (event.type === 'session_complete') {
    return { ...state, partial: '', completeText: polishOperatorTranscript(event.text) || state.completeText };
  }
  return state;
}
