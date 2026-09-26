export type SpokenCaptionState = {
  visibleText: string;
  speaking: boolean;
  generation: number;
};

export type SpokenCaptionLine = {
  id: string;
  role: 'caller' | 'operator';
  text: string;
  live?: boolean;
  speaking?: boolean;
  source?: 'stt' | 'llm' | 'typed';
  at: number;
};

export type SpokenTranscriptOptions = {
  onChange?: (state: SpokenCaptionState) => void;
  now?: () => number;
  raf?: (callback: () => void) => number;
  caf?: (handle: number) => void;
};

const LETTER_MS = 58;
const BASE_PAUSE_MS = 90;
const COMMA_WEIGHT = 3;
const SENTENCE_WEIGHT = 6;
const SHORT_CHUNK_MS = 480;

export function splitSpokenWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function spokenWordWeight(word: string): number {
  const core = word.replace(/[^\p{L}\p{N}]+/gu, '');
  const letters = Math.max(1, core.length || word.length);
  let extra = 0;
  if (/[,;:—–]/.test(word)) {
    extra += COMMA_WEIGHT;
  }
  if (/[.!?…]$/.test(word) || /\.{3}$/.test(word)) {
    extra += SENTENCE_WEIGHT;
  }
  return letters + extra;
}

export function estimateSpeechDurationMs(words: string[]): number {
  if (!words.length) {
    return 0;
  }
  const weight = words.reduce((sum, word) => sum + spokenWordWeight(word), 0);
  return Math.max(220, Math.round(weight * LETTER_MS + BASE_PAUSE_MS));
}

export function isShortSpokenUtterance(words: string[], durationMs = 0): boolean {
  if (words.length <= 1) {
    return true;
  }
  return words.length === 2 && durationMs > 0 && durationMs <= SHORT_CHUNK_MS;
}

export function joinSpokenWords(words: string[], count: number): string {
  return words.slice(0, Math.max(0, count)).join(' ');
}

export function revealedWordCount(words: string[], durationMs: number, elapsedMs: number): number {
  if (!words.length) {
    return 0;
  }
  if (elapsedMs < 0) {
    return 0;
  }
  if (durationMs <= 0) {
    return 1;
  }
  if (elapsedMs >= durationMs) {
    return words.length;
  }
  const weights = words.map(spokenWordWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || words.length;
  const progress = elapsedMs / durationMs;
  let acc = 0;
  for (let index = 0; index < words.length; index += 1) {
    const start = acc / total;
    if (progress + 1e-9 < start) {
      return index;
    }
    acc += weights[index] ?? 1;
  }
  return words.length;
}

export function upsertSpokenCaption(
  current: SpokenCaptionLine[],
  role: SpokenCaptionLine['role'],
  text: string,
  speaking: boolean,
): SpokenCaptionLine[] {
  const next = current.filter((line) => !(line.live && line.source === 'llm'));
  if (!text.trim()) {
    return next;
  }
  const prev = current.find((line) => line.live && line.source === 'llm');
  return [
    ...next,
    {
      id: prev?.id ?? 'llm-spoken',
      role,
      text,
      live: true,
      speaking,
      source: 'llm',
      at: prev?.at ?? Date.now(),
    },
  ];
}

export function commitSpokenCaption(current: SpokenCaptionLine[]): SpokenCaptionLine[] {
  return current.map((line) =>
    line.live && line.source === 'llm'
      ? { ...line, id: line.id === 'llm-spoken' ? `spoken-${line.at}` : line.id, live: false, speaking: false }
      : line,
  );
}

export function createSpokenTranscript(options: SpokenTranscriptOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const raf = options.raf ?? ((callback) => window.requestAnimationFrame(callback));
  const caf = options.caf ?? ((handle) => window.cancelAnimationFrame(handle));
  let generation = 0;
  let cancelled = false;
  let speaking = false;
  let finished: string[] = [];
  let current:
    | {
        text: string;
        words: string[];
        durationMs: number;
        estimatedMs: number;
        complete: boolean;
        startedAt: number;
        revealed: number;
      }
    | undefined;
  let rafHandle = 0;
  let lastEmitted = '';
  let lastSpeaking = false;

  function visibleText(): string {
    const head = finished.join(' ').trim();
    const live = current ? joinSpokenWords(current.words, current.revealed) : '';
    return [head, live].filter(Boolean).join(' ').trim();
  }

  function stopTick() {
    if (!rafHandle) {
      return;
    }
    caf(rafHandle);
    rafHandle = 0;
  }

  function emit(force = false) {
    const text = visibleText();
    if (!force && text === lastEmitted && speaking === lastSpeaking) {
      return;
    }
    lastEmitted = text;
    lastSpeaking = speaking;
    options.onChange?.({ visibleText: text, speaking, generation });
  }

  function tick() {
    rafHandle = 0;
    if (cancelled || !current) {
      return;
    }
    const elapsed = now() - current.startedAt;
    let count = Math.max(
      current.revealed,
      revealedWordCount(current.words, current.durationMs, elapsed),
    );
    const holdLast =
      current.words.length > 1 &&
      !isShortSpokenUtterance(current.words, current.durationMs) &&
      (!current.complete || (current.durationMs > 0 && elapsed < current.durationMs * 0.92));
    if (holdLast && count >= current.words.length) {
      count = current.words.length - 1;
    }
    if (count !== current.revealed) {
      current.revealed = count;
      emit();
    }
    if (count < current.words.length && !cancelled) {
      rafHandle = raf(tick);
    }
  }

  function armTick() {
    if (cancelled || !current || rafHandle) {
      return;
    }
    if (current.revealed >= current.words.length) {
      return;
    }
    rafHandle = raf(tick);
  }

  function durationFor(words: string[], actualMs: number, complete: boolean): number {
    const estimated = estimateSpeechDurationMs(words);
    if (isShortSpokenUtterance(words, actualMs)) {
      return Math.max(0, actualMs);
    }
    if (complete && actualMs > 80) {
      return actualMs;
    }
    return Math.max(actualMs, estimated);
  }

  return {
    startChunk(text: string, durationMs: number, expectedGeneration?: number) {
      if (cancelled) {
        return;
      }
      if (expectedGeneration != null && expectedGeneration !== generation) {
        return;
      }
      const words = splitSpokenWords(text);
      if (!words.length) {
        return;
      }
      if (current) {
        current.revealed = current.words.length;
        finished.push(current.text);
      }
      const estimatedMs = estimateSpeechDurationMs(words);
      const short = isShortSpokenUtterance(words, durationMs);
      const duration = durationFor(words, Math.max(0, durationMs), false);
      speaking = true;
      current = {
        text: text.trim(),
        words,
        durationMs: duration,
        estimatedMs,
        complete: false,
        startedAt: now(),
        revealed: short ? words.length : revealedWordCount(words, duration, 0),
      };
      emit(true);
      stopTick();
      armTick();
    },
    setChunkDuration(durationMs: number, complete = false) {
      if (cancelled || !current) {
        return;
      }
      if (isShortSpokenUtterance(current.words, durationMs) && complete) {
        current.durationMs = Math.max(0, durationMs);
        current.complete = true;
        current.revealed = current.words.length;
        emit();
        stopTick();
        return;
      }
      current.durationMs = durationFor(current.words, Math.max(0, durationMs), complete || current.complete);
      current.complete = current.complete || complete;
      tick();
      armTick();
    },
    finishChunk(expectedGeneration?: number) {
      if (cancelled || !current) {
        return;
      }
      if (expectedGeneration != null && expectedGeneration !== generation) {
        return;
      }
      current.revealed = current.words.length;
      finished.push(current.text);
      current = undefined;
      speaking = false;
      stopTick();
      emit(true);
    },
    cancel() {
      if (cancelled) {
        speaking = false;
        stopTick();
        return;
      }
      cancelled = true;
      speaking = false;
      stopTick();
      emit(true);
    },
    beginTurn() {
      generation += 1;
      cancelled = false;
      speaking = false;
      finished = [];
      current = undefined;
      stopTick();
      lastEmitted = '';
      lastSpeaking = false;
      emit(true);
      return generation;
    },
    reset() {
      return this.beginTurn();
    },
    getVisibleText: visibleText,
    isSpeaking: () => speaking,
    isCancelled: () => cancelled,
    generation: () => generation,
  };
}
