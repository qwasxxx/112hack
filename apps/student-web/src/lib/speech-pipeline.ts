export const USER_FLUSH_COALESCE_MS = 16;

const SENTENCE_END = /^[\s\S]*?(?:[.!?…]|\.{3})(?:\s+|$)/;

export type CallLatencyMarks = {
  userFinalAt?: number;
  llmSentAt?: number;
  firstPartialAt?: number;
  firstSentenceAt?: number;
  ttsRequestAt?: number;
  ttsFirstByteAt?: number;
  ttsDecodedAt?: number;
  ttsPlaybackAt?: number;
};

export type TtsPlaybackHooks = {
  onRequestStart?: () => void;
  onFirstNetworkAudio?: () => void;
  onFirstDecoded?: () => void;
  onFirstPlayback?: () => void;
  onFirstAudible?: () => void;
};

export function normalizeSpeech(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function speechCut(full: string, already: string): string {
  const spoken = normalizeSpeech(already);
  const next = normalizeSpeech(full);
  if (!spoken || !next.startsWith(spoken)) {
    return '';
  }
  let left = spoken.length;
  let index = 0;
  for (; index < full.length && left > 0; index += 1) {
    if (/[\p{L}\p{N}]/u.test(full[index] ?? '')) {
      left -= 1;
    }
  }
  return full.slice(0, index);
}

export function takeSpeechChunks(
  full: string,
  already: string,
  flushRest = false,
): { chunks: string[]; spoken: string } {
  const fullNorm = normalizeSpeech(full);
  const alreadyNorm = normalizeSpeech(already);
  if (!fullNorm) {
    return { chunks: [], spoken: already };
  }
  if (alreadyNorm && alreadyNorm === fullNorm) {
    return { chunks: [], spoken: already || full };
  }
  if (alreadyNorm && alreadyNorm.startsWith(fullNorm) && fullNorm.length < alreadyNorm.length) {
    return { chunks: [], spoken: already };
  }
  if (alreadyNorm && !full.startsWith(already) && !fullNorm.startsWith(alreadyNorm)) {
    if (!flushRest || alreadyNorm.includes(fullNorm)) {
      return { chunks: [], spoken: already };
    }
    const correction = full.trim();
    if (!correction) {
      return { chunks: [], spoken: already };
    }
    return { chunks: [correction], spoken: `${already} ${correction}`.trim() };
  }

  let prefix = '';
  if (alreadyNorm) {
    prefix = full.startsWith(already) ? already : speechCut(full, already);
    if (!prefix) {
      return { chunks: [], spoken: already };
    }
  }

  let rest = full.slice(prefix.length);
  const chunks: string[] = [];
  while (rest) {
    const match = rest.match(SENTENCE_END);
    if (!match) {
      break;
    }
    const piece = match[0].trim();
    if (piece.length >= 2) {
      chunks.push(piece);
    }
    prefix += match[0];
    rest = full.slice(prefix.length);
  }
  if (flushRest) {
    const tail = rest.trim();
    if (tail) {
      chunks.push(tail);
      prefix = full;
    }
  }
  return { chunks, spoken: prefix };
}

export function formatCallLatency(marks: CallLatencyMarks): string {
  const origin = marks.userFinalAt ?? marks.llmSentAt;
  const rel = (stamp?: number) =>
    stamp == null || origin == null ? '—' : String(Math.round(stamp - origin));
  const span = (start?: number, end?: number) =>
    start == null || end == null ? '—' : String(Math.round(end - start));
  return [
    '[VOICE LATENCY]',
    `flush=${span(marks.userFinalAt, marks.llmSentAt)}`,
    `stt_http=—`,
    `llm_ttft=${rel(marks.firstPartialAt)}`,
    `safe_phrase=${rel(marks.firstSentenceAt)}`,
    `tts_tta=${span(marks.ttsRequestAt, marks.ttsFirstByteAt)}`,
    `decode=${span(marks.ttsFirstByteAt, marks.ttsDecodedAt)}`,
    `operator_to_audio=${rel(marks.ttsPlaybackAt)}`,
  ].join(' ');
}

export function markFirst(target: CallLatencyMarks, key: keyof CallLatencyMarks, stamp: number): boolean {
  if (target[key] != null) {
    return false;
  }
  target[key] = stamp;
  return true;
}

type AiSpeechDeps = {
  enqueue: (text: string, hooks?: TtsPlaybackHooks) => Promise<void>;
  waitQueue: () => Promise<void>;
  stop: () => void;
  isBusy?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  watchdogMs?: number;
  onLatency?: (line: string) => void;
};

export function createAiSpeechSession(deps: AiSpeechDeps) {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const watchdogMs = deps.watchdogMs ?? 12_000;
  let spoken = '';
  let generationOpen = false;
  let cancelled = false;
  let epoch = 0;
  let lastEnqueueAt = 0;
  let latency: CallLatencyMarks = {};
  let loggedLatency = false;
  let waiter: Promise<void> | undefined;

  function busy(): boolean {
    return deps.isBusy?.() ?? false;
  }

  function latencyHooks(): TtsPlaybackHooks {
    return {
      onRequestStart: () => {
        markFirst(latency, 'ttsRequestAt', now());
      },
      onFirstNetworkAudio: () => {
        markFirst(latency, 'ttsFirstByteAt', now());
      },
      onFirstDecoded: () => {
        markFirst(latency, 'ttsDecodedAt', now());
      },
      onFirstAudible: () => {
        if (markFirst(latency, 'ttsPlaybackAt', now()) && !loggedLatency) {
          loggedLatency = true;
          deps.onLatency?.(formatCallLatency(latency));
        }
      },
    };
  }

  function take(text: string, flushRest: boolean): string[] {
    if (cancelled) {
      return [];
    }
    const result = takeSpeechChunks(text, spoken, flushRest);
    spoken = result.spoken;
    if (result.chunks.length) {
      markFirst(latency, 'firstSentenceAt', now());
    }
    return result.chunks;
  }

  function enqueueChunks(chunks: string[]): void {
    for (const chunk of chunks) {
      if (cancelled || !chunk.trim()) {
        continue;
      }
      lastEnqueueAt = now();
      void Promise.resolve(deps.enqueue(chunk, latencyHooks())).catch(() => undefined);
    }
  }

  async function drain(myEpoch: number): Promise<void> {
    let lastBusy = now();
    while (!cancelled && epoch === myEpoch) {
      if (busy()) {
        lastBusy = now();
        await Promise.race([deps.waitQueue(), sleep(80)]);
        continue;
      }
      if (!generationOpen) {
        await deps.waitQueue();
        break;
      }
      if (now() - lastEnqueueAt >= watchdogMs && now() - lastBusy >= watchdogMs) {
        break;
      }
      await sleep(16);
    }
  }

  return {
    beginTurn(marks?: Partial<CallLatencyMarks>) {
      epoch += 1;
      spoken = '';
      generationOpen = true;
      cancelled = false;
      loggedLatency = false;
      lastEnqueueAt = now();
      latency = { ...marks };
      waiter = undefined;
    },
    ingestPartial(text: string): string[] {
      markFirst(latency, 'firstPartialAt', now());
      const chunks = take(text, false);
      enqueueChunks(chunks);
      return chunks;
    },
    ingestFinal(text: string): string[] {
      generationOpen = false;
      const chunks = take(text, true);
      enqueueChunks(chunks);
      return chunks;
    },
    failGeneration(): void {
      generationOpen = false;
    },
    markLlmSent(stamp = now()): void {
      markFirst(latency, 'llmSentAt', stamp);
    },
    markUserFinal(stamp = now()): void {
      markFirst(latency, 'userFinalAt', stamp);
    },
    cancel(): void {
      epoch += 1;
      cancelled = true;
      generationOpen = false;
      deps.stop();
    },
    resetForNewCall(): void {
      this.cancel();
      spoken = '';
      cancelled = false;
      waiter = undefined;
      latency = {};
      loggedLatency = false;
    },
    waitForTurnEnd(): Promise<void> {
      const myEpoch = epoch;
      if (!waiter) {
        waiter = drain(myEpoch).finally(() => {
          if (waiter && epoch === myEpoch) {
            waiter = undefined;
          }
        });
      }
      return waiter;
    },
    getSpoken(): string {
      return spoken;
    },
    isGenerationOpen(): boolean {
      return generationOpen;
    },
    isCancelled(): boolean {
      return cancelled;
    },
    turnId(): number {
      return epoch;
    },
    latency(): CallLatencyMarks {
      return latency;
    },
  };
}
