let playToken = 0;
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
let recordMix: GainNode | undefined;
let recordTap: ScriptProcessorNode | undefined;
let recordSink: GainNode | undefined;
let micTap: MediaStreamAudioSourceNode | undefined;
let recordPcm = new Float32Array(0);
let recordFilled = 0;
let recordOrigin = 0;
let recordingOn = false;
let recordCarry = 0;

function ttsUrl(): string {
  return '/api/v1/tts/synthesize';
}

function getAudioContext(): AudioContext {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

export function unlockTtsAudio(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
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

export async function playTtsAudio(text: string, conversationRole?: string, voice?: TtsVoiceHint): Promise<void> {
  stopTtsAudio();
  return enqueueTtsAudio(text, conversationRole, voice);
}

export function enqueueTtsAudio(text: string, conversationRole?: string, voice?: TtsVoiceHint): Promise<void> {
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
  const pending = fetchTtsResponse(trimmed, role, token, abort, voice);
  const done = playChain.then(async () => {
    try {
      if (token !== playToken) {
        return;
      }
      const response = await pending;
      if (!response || token !== playToken) {
        return;
      }
      await playTtsResponse(response, token);
    } finally {
      abortControllers.delete(abort);
      if (currentAbort === abort) {
        currentAbort = undefined;
      }
    }
  });
  playChain = done.catch(() => undefined);
  return done;
}

export function waitTtsQueue(): Promise<void> {
  return playChain;
}

export function stopTtsAudio(): void {
  playToken += 1;
  currentAbort?.abort();
  currentAbort = undefined;
  for (const abort of abortControllers) {
    abort.abort();
  }
  abortControllers = new Set();
  playbackDone?.();
  playbackDone = undefined;
  playChain = Promise.resolve();
  nextStart = 0;
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
}

export function takeSpeechChunks(full: string, already: string): { chunks: string[]; spoken: string } {
  const same = normalizeSpeech(full) === normalizeSpeech(already);
  const alreadyCovers =
    Boolean(normalizeSpeech(already)) && normalizeSpeech(already).startsWith(normalizeSpeech(full));
  if (same || alreadyCovers) {
    return { chunks: [], spoken: full };
  }
  let prefix = already;
  if (prefix && !full.startsWith(prefix)) {
    prefix = speechCut(full, already);
  }
  let rest = full.slice(prefix.length);
  const chunks: string[] = [];
  while (rest) {
    const match = rest.match(/^[\s\S]*?[.!?…](?:\s+|$)/) || rest.match(/^[\s\S]{18,120}?[,;:](?:\s+|$)/);
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
  return { chunks, spoken: prefix };
}

function normalizeSpeech(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function speechCut(full: string, already: string): string {
  const spoken = normalizeSpeech(already);
  const next = normalizeSpeech(full);
  if (!spoken || !next.startsWith(spoken)) {
    return '';
  }
  let left = spoken.length;
  let index = 0;
  for (; index < full.length && left > 0; index += 1) {
    if (/[\p{L}\p{N}]/u.test(full[index])) {
      left -= 1;
    }
  }
  return full.slice(0, index);
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
  }
}

async function playTtsResponse(response: Response, token: number): Promise<void> {
  const streamed =
    !!response.body &&
    ((response.headers.get('content-type') || '').includes('octet-stream') ||
      response.headers.get('x-tts-stream') === '1');
  if (streamed && response.body) {
    await playStream(response.body, token);
    return;
  }
  const blob = await response.blob();
  if (blob.size >= 64) {
    await playBlob(blob, token);
  }
}

async function playStream(body: ReadableStream<Uint8Array>, token: number): Promise<void> {
  const reader = body.getReader();
  let buffer: Uint8Array = new Uint8Array(0);
  const plays: Promise<void>[] = [];
  try {
    while (token === playToken) {
      const { done, value } = await reader.read();
      if (value) {
        buffer = concatBytes(buffer, value);
      }
      while (buffer.length >= 4 && token === playToken) {
        const length = readU32(buffer);
        if (length === 0) {
          await Promise.all(plays);
          return;
        }
        if (buffer.length < 4 + length) {
          break;
        }
        const chunk = buffer.slice(4, 4 + length);
        buffer = buffer.slice(4 + length);
        const decoded = await decodeChunk(chunk, token);
        if (decoded) {
          plays.push(playBuffer(decoded, token, 0));
        } else {
          plays.push(playBlob(new Blob([chunk], { type: sniffAudioType(chunk) }), token));
        }
      }
      if (done) {
        break;
      }
    }
    await Promise.all(plays);
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

async function playBuffer(buffer: AudioBuffer, token: number, gap = 0): Promise<void> {
  if (token !== playToken) {
    return;
  }
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  if (token !== playToken) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const source = ctx.createBufferSource();
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (playbackDone === finish) {
        playbackDone = undefined;
      }
      if (currentSource === source) {
        currentSource = undefined;
      }
      resolve();
    };
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSource = source;
    playbackDone = finish;
    const when = Math.max(ctx.currentTime, nextStart);
    if (recordingOn) {
      const channels = buffer.numberOfChannels;
      const mono = new Float32Array(buffer.length);
      for (let channel = 0; channel < channels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < mono.length; i += 1) {
          mono[i] += (data[i] ?? 0) / channels;
        }
      }
      mixAt(Math.round((when - recordOrigin) * 16000), resampleMono(mono, buffer.sampleRate));
    }
    source.onended = finish;
    currentSources.push(source);
    source.start(when);
    nextStart = when + buffer.duration + gap;
    window.setTimeout(
      finish,
      Math.max(30, (when - ctx.currentTime + buffer.duration + 0.08) * 1000),
    );
  });
}

async function playBlob(blob: Blob, token: number): Promise<void> {
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
    await playBuffer(buffer, token);
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
      resolve();
    };
    playbackDone = finish;
    audio.onended = finish;
    audio.onerror = finish;
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