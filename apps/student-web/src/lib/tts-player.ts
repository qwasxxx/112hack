import { callerPhoneInput } from './caller-phone-voice';
import { takeSpeechChunks, type TtsPlaybackHooks } from './speech-pipeline';

export { takeSpeechChunks };
export type { TtsPlaybackHooks };

export type TtsChunkPlaybackInfo = {
  text: string;
  durationMs: number;
};

export type TtsChunkProgressInfo = {
  durationMs: number;
  complete?: boolean;
};

export type TtsChunkHooks = TtsPlaybackHooks & {
  onChunkPlaybackStart?: (info: TtsChunkPlaybackInfo) => void;
  onChunkPlaybackProgress?: (info: TtsChunkProgressInfo) => void;
  onChunkPlaybackEnd?: (info: { text: string }) => void;
  onPlaybackCancelled?: () => void;
};

type InternalPlayHooks = TtsChunkHooks & {
  onBufferScheduled?: (durationMs: number) => void;
  onBufferAudible?: () => void;
};

let playToken = 0;
let startTimers = new Set<number>();
const activeCancelHooks = new Set<TtsChunkHooks>();
let currentAudio: HTMLAudioElement | undefined;
let currentSource: AudioBufferSourceNode | undefined;
const currentSources: AudioBufferSourceNode[] = [];
let currentAbort: AbortController | undefined;
let abortControllers = new Set<AbortController>();
let objectUrls: string[] = [];
let playbackDone: (() => void) | undefined;
let playChain: Promise<void> = Promise.resolve();
let audioCtx: AudioContext | undefined;
let nextStart = 0;
let reserveLock: Promise<void> = Promise.resolve();
let fetchInFlight = 0;
const TTS_FIRST_BYTE_MS = 18_000;
const TTS_STALL_MS = 12_000;

function createStallWatch(abort: AbortController): { heard: () => void; stop: () => void } {
  let timer = 0;
  const clear = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  };
  const arm = (ms: number) => {
    clear();
    timer = window.setTimeout(() => abort.abort(), ms);
  };
  arm(TTS_FIRST_BYTE_MS);
  return {
    heard() {
      arm(TTS_STALL_MS);
    },
    stop: clear,
  };
}
let recordMix: GainNode | undefined;
let recordTap: ScriptProcessorNode | undefined;
let recordSink: GainNode | undefined;
let micTap: MediaStreamAudioSourceNode | undefined;
let recordPcm = new Float32Array(0);
let recordFilled = 0;
let recordOrigin = 0;
let recordingOn = false;
let recordCarry = 0;
const recordTaps: AudioNode[] = [];
let voiceActivityListener: ((active: boolean) => void) | undefined;
let voiceActive = false;

function ttsUrl(): string {
  return '/api/v1/tts/synthesize';
}

function getAudioContext(): AudioContext {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

export function getSharedAudioContext(): AudioContext {
  return getAudioContext();
}

export function setTtsVoiceActivityListener(listener?: (active: boolean) => void): void {
  voiceActivityListener = listener;
}

export function connectToCallRecording(node: AudioNode): void {
  if (!recordTaps.includes(node)) {
    recordTaps.push(node);
  }
  if (recordMix) {
    try {
      node.connect(recordMix);
    } catch {
      undefined;
    }
  }
}

export function disconnectFromCallRecording(node: AudioNode): void {
  const index = recordTaps.indexOf(node);
  if (index >= 0) {
    recordTaps.splice(index, 1);
  }
  if (recordMix) {
    try {
      node.disconnect(recordMix);
    } catch {
      undefined;
    }
  }
}

function notifyVoiceActivity(): void {
  const active = currentSources.length > 0 || currentSource != null || currentAudio != null;
  if (active === voiceActive) {
    return;
  }
  voiceActive = active;
  voiceActivityListener?.(active);
}

export function unlockTtsAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    return ctx.resume().then(() => undefined, () => undefined);
  }
  return Promise.resolve();
}

function releaseRecordingGraph() {
  micTap?.disconnect();
  micTap = undefined;
  recordTap?.disconnect();
  recordTap = undefined;
  recordSink?.disconnect();
  recordSink = undefined;
  recordMix?.disconnect();
  recordMix = undefined;
}

function wavFromPcm(samples: Float32Array, sampleRate: number): Blob {
  const bytes = samples.length * 2;
  const out = new ArrayBuffer(44 + bytes);
  const view = new DataView(out);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}

function mixAt(start: number, samples: Float32Array) {
  if (!recordingOn || !samples.length) {
    return;
  }
  const end = start + samples.length;
  if (end <= 0) {
    return;
  }
  if (end > recordPcm.length) {
    const next = new Float32Array(Math.max(end + 16000, recordPcm.length * 2 || 16000));
    next.set(recordPcm.subarray(0, Math.max(0, recordFilled)));
    recordPcm = next;
  }
  for (let i = 0; i < samples.length; i += 1) {
    const idx = start + i;
    if (idx < 0) {
      continue;
    }
    recordPcm[idx] = Math.max(-1, Math.min(1, (recordPcm[idx] ?? 0) + (samples[i] ?? 0)));
  }
  recordFilled = Math.max(recordFilled, Math.ceil(end));
}

function resampleMono(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) {
    return samples;
  }
  const outLen = Math.max(1, Math.round((samples.length * 16000) / sampleRate));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = (i * sampleRate) / 16000;
    const left = Math.floor(pos);
    const right = Math.min(samples.length - 1, left + 1);
    const frac = pos - left;
    out[i] = (samples[left] ?? 0) * (1 - frac) + (samples[right] ?? 0) * frac;
  }
  return out;
}

function takeRecording(): Blob | null {
  recordingOn = false;
  recordCarry = 0;
  releaseRecordingGraph();
  const total = Math.max(0, recordFilled);
  if (!total) {
    recordPcm = new Float32Array(0);
    recordFilled = 0;
    return null;
  }
  const merged = recordPcm.slice(0, total);
  recordPcm = new Float32Array(0);
  recordFilled = 0;
  return wavFromPcm(merged, 16000);
}

export function beginCallRecording(mic: MediaStream): { stop: () => Promise<Blob | null> } {
  const ctx = getAudioContext();
  void ctx.resume();
  releaseRecordingGraph();
  recordingOn = true;
  recordOrigin = ctx.currentTime;
  recordPcm = new Float32Array(16000);
  recordFilled = 0;
  recordCarry = 0;
  recordMix = ctx.createGain();
  micTap = ctx.createMediaStreamSource(mic);
  micTap.connect(recordMix);
  recordTap = ctx.createScriptProcessor(4096, 1, 1);
  const step = ctx.sampleRate / 16000;
  recordTap.onaudioprocess = (event) => {
    if (!recordMix) {
      return;
    }
    const input = event.inputBuffer.getChannelData(0);
    const out: number[] = [];
    let pos = recordCarry;
    while (pos < input.length) {
      out.push(input[Math.floor(pos)] ?? 0);
      pos += step;
    }
    recordCarry = pos - input.length;
    if (out.length) {
      const start = Math.round((ctx.currentTime - event.inputBuffer.duration - recordOrigin) * 16000);
      mixAt(start, Float32Array.from(out));
    }
  };
  recordMix.connect(recordTap);
  recordSink = ctx.createGain();
  recordSink.gain.value = 0;
  recordTap.connect(recordSink);
  recordSink.connect(ctx.destination);
  for (const node of recordTaps) {
    try {
      node.connect(recordMix);
    } catch {
      undefined;
    }
  }
  return {
    stop: () => Promise.resolve(takeRecording()),
  };
}

export type TtsVoiceHint = {
  speaker?: string;
  pitch?: string;
  speed?: number;
  emotion?: string;
  gender?: string;
};

export async function playTtsAudio(
  text: string,
  conversationRole?: string,
  voice?: TtsVoiceHint,
  hooks?: TtsChunkHooks,
): Promise<void> {
  stopTtsAudio();
  return enqueueTtsAudio(text, conversationRole, voice, hooks);
}

export function enqueueTtsAudio(
  text: string,
  conversationRole?: string,
  voice?: TtsVoiceHint,
  hooks?: TtsChunkHooks,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return Promise.resolve();
  }
  unlockTtsAudio();
  const token = playToken;
  const role = conversationRole || 'victim';
  const abort = new AbortController();
  abortControllers.add(abort);
  currentAbort = abort;
  if (hooks) {
    activeCancelHooks.add(hooks);
  }
  const stall = createStallWatch(abort);
  hooks?.onRequestStart?.();
  const gate = createPlayGate();
  const phoneLine = isCallerVoice(role, voice);
  const consume = consumeTtsResponse(trimmed, role, token, abort, voice, hooks, gate, stall);
  const played = playChain.then(async () => {
    if (token !== playToken) {
      return;
    }
    await playGate(gate, token, hooks, trimmed, phoneLine);
  });
  playChain = played.catch(() => undefined);
  return Promise.all([consume.catch(() => undefined), played.catch(() => undefined)]).then(async () => {
    stall.stop();
    abortControllers.delete(abort);
    if (currentAbort === abort) {
      currentAbort = undefined;
    }
    if (hooks) {
      activeCancelHooks.delete(hooks);
    }
    await played;
  });
}

function isCallerVoice(role: string, voice?: TtsVoiceHint): boolean {
  return role !== 'operator' && role !== 'service' && voice?.emotion !== 'dispatch';
}

export function isTtsBusy(): boolean {
  return (
    currentSources.length > 0 ||
    currentSource != null ||
    currentAudio != null ||
    abortControllers.size > 0 ||
    fetchInFlight > 0
  );
}

export function waitTtsQueue(): Promise<void> {
  return playChain;
}

function clearStartTimers() {
  for (const id of startTimers) {
    window.clearTimeout(id);
  }
  startTimers = new Set();
}

function notifyPlaybackCancelled() {
  const pending = [...activeCancelHooks];
  activeCancelHooks.clear();
  for (const hooks of pending) {
    try {
      hooks.onPlaybackCancelled?.();
    } catch {
      undefined;
    }
  }
}

export function stopTtsAudio(): void {
  playToken += 1;
  currentAbort?.abort();
  currentAbort = undefined;
  for (const abort of abortControllers) {
    abort.abort();
  }
  abortControllers = new Set();
  clearStartTimers();
  playbackDone?.();
  playbackDone = undefined;
  playChain = Promise.resolve();
  nextStart = 0;
  reserveLock = Promise.resolve();
  for (const source of currentSources.splice(0)) {
    try {
      source.stop();
    } catch {
      undefined;
    }
  }
  try {
    currentSource?.stop();
  } catch {
    undefined;
  }
  currentSource = undefined;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.removeAttribute('src');
    currentAudio.load();
    currentAudio = undefined;
  }
  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls = [];
  notifyPlaybackCancelled();
  notifyVoiceActivity();
}

async function fetchTtsResponse(
  text: string,
  voiceId: string,
  token: number,
  abort: AbortController,
  voice?: TtsVoiceHint,
): Promise<Response | undefined> {
  const operator = voiceId === 'operator';
  const service = voiceId === 'service' || voice?.emotion === 'dispatch';
  const brisk = service && (!voice?.emotion || voice.emotion === 'dispatch');
  fetchInFlight += 1;
  try {
    const response = await fetch(ttsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        role: service ? 'victim' : operator ? 'operator' : 'victim',
        emotion: brisk ? 'dispatch' : service ? voice?.emotion || 'dispatch' : operator ? 'calm' : voice?.emotion || 'scared',
        conversation_role: service ? 'operator' : operator ? 'operator' : 'victim',
        voice_id: operator ? 'operator_calm' : voice?.speaker || 'victim_panic',
        speaker: service ? 'aidar' : operator ? 'aidar' : voice?.speaker,
        gender: service ? 'male' : operator ? 'male' : voice?.gender,
        pitch: service ? 'medium' : operator ? 'medium' : voice?.pitch,
        speed: brisk ? 1.08 : service ? voice?.speed ?? 1.08 : operator ? 1 : voice?.speed,
      }),
      signal: abort.signal,
    });
    if (!response.ok || token !== playToken) {
      return undefined;
    }
    return response;
  } catch {
    return undefined;
  } finally {
    fetchInFlight = Math.max(0, fetchInFlight - 1);
  }
}

async function consumeTtsResponse(
  text: string,
  voiceId: string,
  token: number,
  abort: AbortController,
  voice: TtsVoiceHint | undefined,
  hooks: TtsChunkHooks | undefined,
  gate: PlayGate,
  stall: { heard: () => void; stop: () => void },
): Promise<void> {
  try {
    const response = await fetchTtsResponse(text, voiceId, token, abort, voice);
    if (!response || token !== playToken) {
      return;
    }
    stall.heard();
    await feedTtsResponse(response, token, hooks, gate, stall);
  } catch {
    undefined;
  } finally {
    stall.stop();
    gate.finish();
  }
}

async function feedTtsResponse(
  response: Response,
  token: number,
  hooks: TtsChunkHooks | undefined,
  gate: PlayGate,
  stall: { heard: () => void; stop: () => void },
): Promise<void> {
  const streamed =
    !!response.body &&
    ((response.headers.get('content-type') || '').includes('octet-stream') ||
      response.headers.get('x-tts-stream') === '1');
  if (streamed && response.body) {
    await feedStream(response.body, token, hooks, gate, stall);
    return;
  }
  hooks?.onFirstNetworkAudio?.();
  const blob = await response.blob();
  if (blob.size >= 64 && token === playToken) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const decoded = await decodeChunk(bytes, token);
    if (decoded) {
      hooks?.onFirstDecoded?.();
      gate.push({ buffer: decoded });
    } else {
      gate.push({ blob });
    }
  }
}

type Playable = { buffer?: AudioBuffer; blob?: Blob };

type PlayGate = {
  push: (item: Playable) => void;
  finish: () => void;
  take: () => Promise<Playable | undefined>;
};

function createPlayGate(): PlayGate {
  const items: Playable[] = [];
  let finished = false;
  const waiters: Array<() => void> = [];
  const poke = () => {
    const pending = waiters.splice(0);
    for (const resume of pending) {
      resume();
    }
  };
  return {
    push(item: Playable) {
      if (finished) {
        return;
      }
      items.push(item);
      poke();
    },
    finish() {
      finished = true;
      poke();
    },
    async take() {
      while (!items.length && !finished) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      }
      return items.shift();
    },
  };
}

async function playGate(
  gate: PlayGate,
  token: number,
  hooks: TtsChunkHooks | undefined,
  chunkText: string,
  phoneLine = false,
): Promise<void> {
  const plays: Promise<void>[] = [];
  let latencyHooks: TtsChunkHooks | undefined = hooks;
  let reservedMs = 0;
  let audible = false;
  while (token === playToken) {
    const item = await gate.take();
    if (!item || token !== playToken) {
      break;
    }
    const first = latencyHooks;
    const local: InternalPlayHooks = {
      onFirstPlayback: first?.onFirstPlayback,
      onFirstDecoded: first?.onFirstDecoded,
      onFirstAudible: first?.onFirstAudible,
      onBufferScheduled: (durationMs) => {
        reservedMs += durationMs;
        if (audible) {
          hooks?.onChunkPlaybackProgress?.({ durationMs: reservedMs });
        }
      },
      onBufferAudible: () => {
        if (audible || token !== playToken) {
          return;
        }
        audible = true;
        first?.onFirstAudible?.();
        hooks?.onChunkPlaybackStart?.({ text: chunkText, durationMs: reservedMs });
      },
    };
    latencyHooks = undefined;
    if (item.buffer) {
      plays.push(playBuffer(item.buffer, token, 0, local, phoneLine));
    } else if (item.blob) {
      plays.push(playBlob(item.blob, token, local, phoneLine));
    }
  }
  if (token === playToken && audible) {
    hooks?.onChunkPlaybackProgress?.({ durationMs: reservedMs, complete: true });
  }
  await Promise.all(plays);
  if (token === playToken && audible) {
    hooks?.onChunkPlaybackEnd?.({ text: chunkText });
  }
}

async function feedStream(
  body: ReadableStream<Uint8Array>,
  token: number,
  hooks: TtsChunkHooks | undefined,
  gate: PlayGate,
  stall: { heard: () => void; stop: () => void },
): Promise<void> {
  const reader = body.getReader();
  let buffer: Uint8Array = new Uint8Array(0);
  let heardNetwork = false;
  let firstHooks = hooks;
  try {
    while (token === playToken) {
      const { done, value } = await reader.read();
      if (value) {
        stall.heard();
        if (!heardNetwork) {
          heardNetwork = true;
          firstHooks?.onFirstNetworkAudio?.();
        }
        buffer = concatBytes(buffer, value);
      }
      while (buffer.length >= 4 && token === playToken) {
        const length = readU32(buffer);
        if (length === 0) {
          return;
        }
        if (buffer.length < 4 + length) {
          break;
        }
        const chunk = buffer.slice(4, 4 + length);
        buffer = buffer.slice(4 + length);
        const decoded = await decodeChunk(chunk, token);
        if (decoded) {
          firstHooks?.onFirstDecoded?.();
          gate.push({ buffer: decoded });
          firstHooks = undefined;
        } else {
          gate.push({ blob: new Blob([chunk], { type: sniffAudioType(chunk) }) });
          firstHooks = undefined;
        }
      }
      if (done) {
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function decodeChunk(chunk: Uint8Array, token: number): Promise<AudioBuffer | undefined> {
  if (token !== playToken || chunk.length < 64) {
    return undefined;
  }
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const copy = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    return await ctx.decodeAudioData(copy as ArrayBuffer);
  } catch {
    return undefined;
  }
}

async function reserveSlot(duration: number, token: number): Promise<number | undefined> {
  const run = reserveLock.then(async () => {
    if (token !== playToken) {
      return undefined;
    }
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (token !== playToken) {
      return undefined;
    }
    const when = Math.max(ctx.currentTime, nextStart);
    nextStart = when + duration;
    return when;
  });
  reserveLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function contextOutputDelay(ctx: AudioContext): number {
  const output = 'outputLatency' in ctx && typeof ctx.outputLatency === 'number' ? ctx.outputLatency : 0;
  const base = typeof ctx.baseLatency === 'number' ? ctx.baseLatency : 0;
  return Math.min(0.08, Math.max(0, output || base * 0.5 || 0));
}

function scheduleAudible(when: number, token: number, isSettled: () => boolean, fire: () => void) {
  const ctx = getAudioContext();
  const target = when + contextOutputDelay(ctx);
  const arm = () => {
    if (isSettled() || token !== playToken) {
      return;
    }
    if (ctx.currentTime + 0.004 >= target) {
      fire();
      return;
    }
    const wait = Math.max(8, (target - ctx.currentTime) * 1000);
    const id = window.setTimeout(() => {
      startTimers.delete(id);
      arm();
    }, wait);
    startTimers.add(id);
  };
  arm();
}

async function playBuffer(
  buffer: AudioBuffer,
  token: number,
  gap = 0,
  hooks?: InternalPlayHooks,
  phoneLine = false,
): Promise<void> {
  if (token !== playToken) {
    return;
  }
  const when = await reserveSlot(buffer.duration + gap, token);
  if (when == null || token !== playToken) {
    return;
  }
  const durationMs = buffer.duration * 1000;
  hooks?.onBufferScheduled?.(durationMs);
  const ctx = getAudioContext();
  await new Promise<void>((resolve) => {
    let settled = false;
    let timer = 0;
    const source = ctx.createBufferSource();
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      const index = currentSources.indexOf(source);
      if (index >= 0) {
        currentSources.splice(index, 1);
      }
      if (playbackDone === finish) {
        playbackDone = undefined;
      }
      if (currentSource === source) {
        currentSource = undefined;
      }
      notifyVoiceActivity();
      resolve();
    };
    source.buffer = buffer;
    if (phoneLine) {
      source.connect(callerPhoneInput(ctx));
    } else {
      source.connect(ctx.destination);
    }
    if (recordMix) {
      source.connect(recordMix);
    }
    currentSource = source;
    playbackDone = finish;
    source.onended = finish;
    currentSources.push(source);
    source.start(when);
    notifyVoiceActivity();
    hooks?.onFirstPlayback?.();
    scheduleAudible(when, token, () => settled, () => hooks?.onBufferAudible?.());
    timer = window.setTimeout(
      finish,
      Math.max(30, (when - ctx.currentTime + buffer.duration + 0.08) * 1000),
    );
  });
}

async function playBlob(
  blob: Blob,
  token: number,
  hooks?: InternalPlayHooks,
  phoneLine = false,
): Promise<void> {
  if (token !== playToken || blob.size < 64) {
    return;
  }
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (token !== playToken) {
      return;
    }
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (token !== playToken) {
      return;
    }
    hooks?.onFirstDecoded?.();
    await playBuffer(buffer, token, 0, hooks, phoneLine);
    return;
  } catch {
    undefined;
  }
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  const audio = new Audio(url);
  currentAudio = audio;
  await new Promise<void>((resolve) => {
    let settled = false;
    let scheduled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (playbackDone === finish) {
        playbackDone = undefined;
      }
      if (currentAudio === audio) {
        currentAudio = undefined;
      }
      notifyVoiceActivity();
      resolve();
    };
    const announceDuration = () => {
      if (scheduled) {
        return;
      }
      const durationMs =
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : 0;
      if (durationMs <= 0) {
        return;
      }
      scheduled = true;
      hooks?.onBufferScheduled?.(durationMs);
    };
    playbackDone = finish;
    audio.onended = finish;
    audio.onerror = finish;
    audio.onloadedmetadata = announceDuration;
    audio.onplaying = () => {
      announceDuration();
      hooks?.onBufferAudible?.();
    };
    notifyVoiceActivity();
    hooks?.onFirstPlayback?.();
    void audio.play().catch(finish);
  });
}

function sniffAudioType(chunk: Uint8Array): string {
  if (chunk.length >= 4 && chunk[0] === 0x52 && chunk[1] === 0x49 && chunk[2] === 0x46 && chunk[3] === 0x46) {
    return 'audio/wav';
  }
  return 'audio/mpeg';
}

function readU32(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return view.getUint32(0, true);
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const next = new Uint8Array(left.length + right.length);
  next.set(left);
  next.set(right, left.length);
  return next;
}