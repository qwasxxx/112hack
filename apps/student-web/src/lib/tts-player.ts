let playToken = 0;
let currentAudio: HTMLAudioElement | undefined;
let currentSource: AudioBufferSourceNode | undefined;
let currentAbort: AbortController | undefined;
let abortControllers = new Set<AbortController>();
let objectUrls: string[] = [];
let playbackDone: (() => void) | undefined;
let playChain: Promise<void> = Promise.resolve();
let audioCtx: AudioContext | undefined;
let nextStart = 0;

function ttsUrl(): string {
  return `http://${window.location.hostname}:8092/api/v1/tts/synthesize`;
}

function getAudioContext(): AudioContext {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

export async function playTtsAudio(text: string, conversationRole?: string): Promise<void> {
  stopTtsAudio();
  return enqueueTtsAudio(text, conversationRole);
}

export function enqueueTtsAudio(text: string, conversationRole?: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return Promise.resolve();
  }
  const token = playToken;
  const role = conversationRole || 'victim';
  const prepared = fetchAudio(trimmed, role, token).then(async (blob) => {
    if (!blob || token !== playToken) {
      return undefined;
    }
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (token !== playToken) {
        return undefined;
      }
      return await ctx.decodeAudioData(await blob.arrayBuffer());
    } catch {
      return blob;
    }
  });
  const done = playChain.then(async () => {
    if (token !== playToken) {
      return;
    }
    const ready = await prepared;
    if (!ready || token !== playToken) {
      return;
    }
    if (ready instanceof AudioBuffer) {
      await playBuffer(ready, token);
      return;
    }
    await playBlob(ready, token);
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
  let prefix = already;
  if (prefix && !full.startsWith(prefix)) {
    prefix = '';
  }
  let rest = full.slice(prefix.length);
  const chunks: string[] = [];
  while (rest) {
    const match = rest.match(/^[\s\S]*?[.!?…](?:\s+|$)/);
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
  if (chunks.length === 0) {
    const trimmed = rest.trim();
    if (trimmed.length >= 42) {
      const cut = trimmed.lastIndexOf(' ', 54);
      if (cut > 16) {
        const piece = trimmed.slice(0, cut).trim();
        chunks.push(piece);
        const idx = rest.indexOf(piece);
        prefix += idx >= 0 ? rest.slice(0, idx + piece.length) : piece;
      }
    }
  }
  return { chunks, spoken: prefix };
}

async function fetchAudio(text: string, voiceId: string, token: number): Promise<Blob | undefined> {
  const abort = new AbortController();
  abortControllers.add(abort);
  currentAbort = abort;
  try {
    const response = await fetch(ttsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        role: voiceId === 'operator' ? 'operator' : 'victim',
        emotion: voiceId === 'operator' ? 'calm' : 'panic',
        conversation_role: voiceId === 'operator' ? 'operator' : 'victim',
        voice_id: voiceId === 'operator' ? 'operator_calm' : 'victim_panic',
      }),
      signal: abort.signal,
    });
    if (!response.ok || token !== playToken) {
      return undefined;
    }
    if (response.body && ((response.headers.get('content-type') || '').includes('octet-stream') || response.headers.get('x-tts-stream') === '1')) {
      return firstChunkBlob(response.body, token);
    }
    const blob = await response.blob();
    return blob.size >= 64 ? blob : undefined;
  } catch {
    return undefined;
  } finally {
    abortControllers.delete(abort);
    if (currentAbort === abort) {
      currentAbort = undefined;
    }
  }
}

async function firstChunkBlob(body: ReadableStream<Uint8Array>, token: number): Promise<Blob | undefined> {
  const reader = body.getReader();
  let buffer = new Uint8Array(0);
  while (token === playToken) {
    const { done, value } = await reader.read();
    if (value) {
      buffer = concatBytes(buffer, value);
    }
    while (buffer.length >= 4 && token === playToken) {
      const length = readU32(buffer);
      if (length === 0) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      if (buffer.length < 4 + length) {
        break;
      }
      const chunk = buffer.slice(4, 4 + length);
      await reader.cancel().catch(() => undefined);
      return new Blob([chunk], { type: sniffAudioType(chunk) });
    }
    if (done) {
      break;
    }
  }
  return undefined;
}

async function playBuffer(buffer: AudioBuffer, token: number): Promise<void> {
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
    source.onended = finish;
    source.start(when);
    nextStart = when + buffer.duration + 0.05;
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
      source.onended = finish;
      source.start(when);
      nextStart = when + buffer.duration + 0.05;
      window.setTimeout(finish, Math.max(30, (when - ctx.currentTime + buffer.duration + 0.08) * 1000));
    });
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
