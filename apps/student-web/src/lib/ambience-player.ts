import {
  effectiveAmbienceGain,
  type AmbienceLayer,
  type AmbienceLayerKind,
  type AmbienceProfile,
  type AmbienceType,
} from './ambience-profile.ts';

export type AmbienceAudioDeps = {
  getContext?: () => AudioContext;
  connectRecording?: (node: AudioNode) => void;
  disconnectRecording?: (node: AudioNode) => void;
  listenVoiceActivity?: (listener?: (active: boolean) => void) => void;
  fetchAsset?: (url: string) => Promise<ArrayBuffer>;
  fadeOutSec?: number;
};

type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  kind?: AmbienceLayerKind;
  element?: HTMLAudioElement;
};

type Graph = {
  master: GainNode;
  voices: Voice[];
  extras?: AudioNode[];
};

/** Phone-line colouring for the whole fire scene: fire, distant people, distant siren. */
const FIRE_BED = {
  highpassHz: 320,
  highpassQ: 0.7,
  lowpassHz: 2400,
  lowpassQ: 0.65,
  shelfHz: 1500,
  shelfDb: -6,
} as const;

const FADE_IN_SEC = 0.32;
const FADE_OUT_SEC = 0.16;
const LOOP_SECONDS = 10;
const TARGET_RMS: Record<AmbienceLayerKind, number> = {
  fire_crackle: 0.05,
  traffic_road: 0.2,
  siren_distant: 0.07,
  street: 0.14,
  crowd: 0.13,
  room: 0.14,
  wind: 0.12,
  water: 0.16,
  phone: 0.07,
  impact: 0.2,
  bystander: 0.07,
};

const bufferCache = new Map<string, AudioBuffer>();
const warned = new Set<string>();
let deps: AmbienceAudioDeps = {};
let generation = 0;
let startCount = 0;
let running = false;
let ducked = false;
let currentProfile: AmbienceProfile | undefined;
let graph: Graph | undefined;
let leftoverTimer: ReturnType<typeof setTimeout> | undefined;
const leftovers: Graph[] = [];
let resumeCtx: AudioContext | undefined;
let resumeHandler: (() => void) | undefined;
let ownedCtx: AudioContext | undefined;
const inflightBoot = new Map<number, Promise<void>>();
const USER_RESUME_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'click'] as const;

export function configureAmbience(next?: AmbienceAudioDeps): void {
  deps = next ?? {};
}

export function resetAmbienceForTests(): void {
  generation += 1;
  detachResume();
  if (leftoverTimer !== undefined) {
    clearTimeout(leftoverTimer);
    leftoverTimer = undefined;
  }
  killGraph(graph);
  graph = undefined;
  for (const item of leftovers.splice(0)) {
    killGraph(item);
  }
  running = false;
  ducked = false;
  currentProfile = undefined;
  startCount = 0;
  warned.clear();
  bufferCache.clear();
  deps = {};
  ownedCtx = undefined;
  inflightBoot.clear();
  listenVoice(undefined);
}

export function ambienceEngineState(): {
  generation: number;
  startCount: number;
  running: boolean;
  ducked: boolean;
  type?: AmbienceType;
  sourceCount: number;
  instanceCount: number;
} {
  return {
    generation,
    startCount,
    running,
    ducked,
    type: currentProfile?.type,
    sourceCount: (graph?.voices.length ?? 0) + leftovers.reduce((sum, item) => sum + item.voices.length, 0),
    instanceCount: (graph ? 1 : 0) + leftovers.length,
  };
}

export function startCallAmbience(profile: AmbienceProfile, audio?: AmbienceAudioDeps): void {
  if (audio) {
    deps = { ...deps, ...audio };
  }
  const token = ++generation;
  startCount += 1;
  ducked = false;
  currentProfile = profile;
  running = profile.gain > 0 && profile.layers.length > 0;
  listenVoice(onVoiceActivity);
  if (leftoverTimer !== undefined) {
    clearTimeout(leftoverTimer);
    leftoverTimer = undefined;
  }
  for (const item of leftovers.splice(0)) {
    killGraph(item);
  }
  releaseCurrent(0);
  detachResume();
  if (!running) {
    return;
  }
  const ctx = audioContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume();
  }
  armResume(token, profile, ctx);
  queueBoot(token, profile);
}

export function stopCallAmbience(): void {
  generation += 1;
  running = false;
  ducked = false;
  currentProfile = undefined;
  detachResume();
  listenVoice(undefined);
  if (leftoverTimer !== undefined) {
    clearTimeout(leftoverTimer);
    leftoverTimer = undefined;
  }
  releaseCurrent(deps.fadeOutSec ?? FADE_OUT_SEC);
}

function queueBoot(token: number, profile: AmbienceProfile): void {
  const existing = inflightBoot.get(token);
  if (existing) {
    return;
  }
  const pending = boot(token, profile).finally(() => {
    inflightBoot.delete(token);
  });
  inflightBoot.set(token, pending);
}

function onVoiceActivity(active: boolean): void {
  if (!running || !currentProfile || !graph) {
    return;
  }
  if (ducked === active) {
    return;
  }
  ducked = active;
  rampGain(graph.master, effectiveAmbienceGain(currentProfile, ducked), 0.12);
}

async function boot(token: number, profile: AmbienceProfile): Promise<void> {
  const ctx = audioContext();
  if (!ctx || token !== generation) {
    return;
  }
  if (graph && token === generation && running) {
    return;
  }
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (token !== generation) {
      return;
    }
    if (ctx.state === 'suspended') {
      armResume(token, profile, ctx);
      return;
    }
    const voices = await buildVoices(ctx, token, profile);
    if (!voices.length || token !== generation) {
      for (const voice of voices) {
        killVoice(voice);
      }
      if (token === generation) {
        running = false;
        graph = undefined;
      }
      return;
    }
    const master = ctx.createGain();
    master.gain.value = 0;
    const extras: AudioNode[] = [];
    const sceneBed =
      profile.type === 'FIRE' || profile.layers.some((layer) => layer.kind === 'bystander')
        ? fireBedInput(ctx, master, extras)
        : undefined;
    for (const voice of voices) {
      const phone =
        sceneBed && (profile.type === 'FIRE' || voice.kind === 'bystander') ? sceneBed : master;
      voice.gain.connect(phone);
    }
    master.connect(ctx.destination);
    if (token !== generation) {
      try {
        master.disconnect();
      } catch {
        undefined;
      }
      disconnectAll(extras);
      for (const voice of voices) {
        killVoice(voice);
      }
      return;
    }
    tapRecording(master);
    graph = { master, voices, extras };
    running = true;
    detachResume();
    rampGain(master, effectiveAmbienceGain(profile, ducked), FADE_IN_SEC);
  } catch {
    warnOnce('engine', 'Ambience unavailable; call audio continues without background.');
    if (token === generation) {
      running = false;
      graph = undefined;
    }
  }
}

async function buildVoices(ctx: AudioContext, token: number, profile: AmbienceProfile): Promise<Voice[]> {
  const voices: Voice[] = [];
  for (const layer of profile.layers) {
    if (token !== generation) {
      break;
    }
    const buffer = await loadLayer(ctx, layer);
    if (!buffer || token !== generation) {
      continue;
    }
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0.0001, layer.gain);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = layer.loop;
    if (layer.loop) {
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
    }
    source.connect(gain);
    const when = ctx.currentTime + Math.max(0, layer.delaySec);
    const offset = layer.loop ? loopOffset(buffer, profile) : 0;
    try {
      source.start(when, offset);
    } catch {
      source.start();
    }
    voices.push({ source, gain, kind: layer.kind });
  }
  return voices;
}

function fireBedInput(ctx: AudioContext, master: GainNode, extras: AudioNode[]): AudioNode | undefined {
  try {
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = FIRE_BED.highpassHz;
    highpass.Q.value = FIRE_BED.highpassQ;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = FIRE_BED.lowpassHz;
    lowpass.Q.value = FIRE_BED.lowpassQ;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = FIRE_BED.shelfHz;
    shelf.gain.value = FIRE_BED.shelfDb;
    highpass.connect(lowpass);
    lowpass.connect(shelf);
    shelf.connect(master);
    extras.push(highpass, lowpass, shelf);
    return highpass;
  } catch {
    disconnectAll(extras.splice(0));
    return undefined;
  }
}

function disconnectAll(nodes: AudioNode[]): void {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      undefined;
    }
  }
}

async function loadLayer(ctx: AudioContext, layer: AmbienceLayer): Promise<AudioBuffer | undefined> {
  const urls = [layer.assetUrl, ...(layer.fallbackUrls ?? [])].filter((url): url is string => Boolean(url));
  if (
    layer.loop &&
    layer.kind !== 'fire_crackle' &&
    layer.kind !== 'siren_distant' &&
    layer.kind !== 'bystander' &&
    !urls.includes('/audio/ambience/generic_emergency_loop.mp3')
  ) {
    urls.push('/audio/ambience/generic_emergency_loop.mp3');
  }
  for (const url of urls) {
    const cacheKey = `asset:${url}`;
    const cached = bufferCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    try {
      const encoded = await fetchBytes(url);
      const decoded = await ctx.decodeAudioData(encoded.slice(0));
      if (!decoded || !Number.isFinite(decoded.duration) || decoded.duration < 0.15 || decoded.length < 32) {
        throw new Error('invalid ambience buffer');
      }
      prepareDecodedBuffer(decoded, layer);
      bufferCache.set(cacheKey, decoded);
      return decoded;
    } catch {
      warnOnce(url, `Ambience asset failed (${layer.kind}); trying fallback.`);
    }
  }
  const generated = renderProcedural(ctx, layer.kind);
  if (generated) {
    bufferCache.set(`proc:${layer.kind}`, generated);
  }
  return generated;
}

export function renderProcedural(ctx: AudioContext, kind: AmbienceLayerKind): AudioBuffer | undefined {
  const rate = ctx.sampleRate || 48000;
  const seconds = kind === 'impact' ? 1.1 : LOOP_SECONDS;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  fillProcedural(data, rate, kind);
  if (kind !== 'impact') {
    crossfadeLoop(data, Math.floor(rate * 0.16));
  }
  normalizeRms(data, TARGET_RMS[kind]);
  return buffer;
}

function fillProcedural(data: Float32Array, rate: number, kind: AmbienceLayerKind): void {
  let brown = 0;
  let low = 0;
  let crackleEnv = 0;
  for (let i = 0; i < data.length; i += 1) {
    const t = i / rate;
    const w = hashNoise(i, kind) * 2 - 1;
    brown = (brown + 0.018 * w) / 1.018;
    low = 0.995 * low + 0.005 * w;
    if (kind === 'fire_crackle') {
      if (hashNoise(i + 3, kind) > 0.9991) {
        crackleEnv = 0.08 + hashNoise(i, kind) * 0.07;
      }
      crackleEnv *= 0.994;
      const roar = brown * 0.22 + low * 0.14;
      const hiss = w * 0.02;
      data[i] = roar + hiss + w * crackleEnv;
    } else if (kind === 'traffic_road') {
      const whoosh = 0.58 + 0.42 * Math.sin(2 * Math.PI * 0.08 * t);
      data[i] = (low * 0.7 + brown * 0.3) * whoosh + 0.1 * w * Math.sin(2 * Math.PI * 0.17 * t);
    } else if (kind === 'siren_distant') {
      const sweep = 620 + 180 * Math.sin(2 * Math.PI * 0.22 * t);
      data[i] = 0.18 * Math.sin(2 * Math.PI * sweep * t) * (0.55 + 0.2 * brown) + low * 0.08;
    } else if (kind === 'crowd' || kind === 'bystander') {
      data[i] = brown * 0.55 + low * 0.28 + 0.04 * Math.sin(2 * Math.PI * (180 + 40 * brown) * t);
    } else if (kind === 'street' || kind === 'wind') {
      data[i] = low * 0.62 + brown * 0.28 + 0.05 * w * Math.sin(2 * Math.PI * 0.05 * t);
    } else if (kind === 'room') {
      data[i] = brown * 0.72 + low * 0.22;
    } else if (kind === 'water') {
      data[i] = low * 0.45 + brown * 0.35 + 0.12 * Math.sin(2 * Math.PI * (1.7 + 0.4 * brown) * t) * w;
    } else if (kind === 'phone') {
      data[i] = w * 0.08 + brown * 0.12;
    } else {
      const env = Math.exp(-t * 7.5);
      data[i] = (brown * 0.4 + w * 0.6) * env;
    }
  }
}

function normalizeRms(data: Float32Array, target: number): void {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i];
  }
  const rms = Math.sqrt(sum / data.length) || 1;
  const scale = target / rms;
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.max(-0.9, Math.min(0.9, data[i] * scale));
  }
}

function hashNoise(index: number, kind: string): number {
  const key = kind.charCodeAt(0) + kind.length * 17;
  const x = Math.imul(index + 1, 1597334677 ^ key);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

function crossfadeLoop(data: Float32Array, fade: number): void {
  const n = Math.min(fade, Math.floor(data.length / 2));
  for (let i = 0; i < n; i += 1) {
    const mix = i / n;
    const start = data[i] ?? 0;
    const end = data[data.length - n + i] ?? 0;
    data[i] = end * (1 - mix) + start * mix;
    data[data.length - n + i] = start * (1 - mix) + end * mix;
  }
}

function prepareDecodedBuffer(buffer: AudioBuffer, layer: AmbienceLayer): void {
  const data = buffer.getChannelData(0);
  const target = TARGET_RMS[layer.kind];
  if (layer.kind === 'impact') {
    const current = bufferRms(data);
    if (current > 0 && current < 0.08) {
      normalizeRms(data, 0.16);
    }
  } else if (layer.kind === 'fire_crackle') {
    const current = bufferRms(data);
    if (current > target) {
      normalizeRms(data, target);
    }
    if (layer.loop) {
      crossfadeLoop(data, Math.floor(buffer.sampleRate * 0.14));
    }
  } else if (target > 0) {
    normalizeRms(data, target);
    if (layer.loop) {
      crossfadeLoop(data, Math.floor(buffer.sampleRate * 0.14));
    }
  }
}

function bufferRms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length) || 0;
}

function loopOffset(buffer: AudioBuffer, profile: AmbienceProfile): number {
  const span = Math.max(0, buffer.duration * 0.65);
  if (span <= 0) {
    return 0;
  }
  return profile.variation.loopOffsetRatio * span;
}

function releaseCurrent(fadeSec: number): void {
  const active = graph;
  graph = undefined;
  if (!active) {
    return;
  }
  rampGain(active.master, 0.0001, fadeSec);
  const delay = fadeSec > 0 ? Math.ceil(fadeSec * 1000) + 24 : 0;
  if (delay <= 0) {
    killGraph(active);
    return;
  }
  leftovers.push(active);
  leftoverTimer = setTimeout(() => {
    const index = leftovers.indexOf(active);
    if (index >= 0) {
      leftovers.splice(index, 1);
    }
    killGraph(active);
  }, delay);
}

function killGraph(item: Graph | undefined): void {
  if (!item) {
    return;
  }
  for (const voice of item.voices) {
    killVoice(voice);
  }
  disconnectAll(item.extras ?? []);
  try {
    item.master.disconnect();
  } catch {
    undefined;
  }
  untapRecording(item.master);
}

function killVoice(item: Voice): void {
  try {
    item.source.stop();
  } catch {
    undefined;
  }
  try {
    item.source.disconnect();
  } catch {
    undefined;
  }
  if (item.element) {
    try {
      item.element.pause();
      item.element.removeAttribute('src');
      item.element.load();
    } catch {
      undefined;
    }
  }
  try {
    item.gain.disconnect();
  } catch {
    undefined;
  }
}

function rampGain(node: GainNode, value: number, seconds: number): void {
  const ctx = audioContext();
  const now = ctx?.currentTime ?? 0;
  try {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    if (seconds <= 0) {
      node.gain.value = value;
      return;
    }
    node.gain.linearRampToValueAtTime(value, now + seconds);
  } catch {
    node.gain.value = value;
  }
}

function audioContext(): AudioContext | undefined {
  try {
    const shared = deps.getContext?.();
    if (shared) {
      return shared;
    }
  } catch {
    undefined;
  }
  try {
    const Ctor =
      globalThis.AudioContext ||
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      warnOnce('context', 'Ambience unavailable; call audio continues without background.');
      return undefined;
    }
    ownedCtx ??= new Ctor();
    return ownedCtx;
  } catch {
    warnOnce('context', 'Ambience unavailable; call audio continues without background.');
    return undefined;
  }
}

function armResume(token: number, profile: AmbienceProfile, ctx: AudioContext | undefined): void {
  if (!ctx) {
    return;
  }
  const retry = () => {
    if (token !== generation || !currentProfile) {
      return;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    if (ctx.state === 'running') {
      detachResume();
      queueBoot(token, profile);
    }
  };
  detachResume();
  resumeCtx = ctx;
  resumeHandler = retry;
  try {
    ctx.addEventListener('statechange', retry);
  } catch {
    undefined;
  }
  if (typeof window !== 'undefined') {
    for (const type of USER_RESUME_EVENTS) {
      window.addEventListener(type, retry, { passive: true });
    }
  }
}

function detachResume(): void {
  if (resumeCtx && resumeHandler) {
    try {
      resumeCtx.removeEventListener('statechange', resumeHandler);
    } catch {
      undefined;
    }
    if (typeof window !== 'undefined') {
      for (const type of USER_RESUME_EVENTS) {
        window.removeEventListener(type, resumeHandler);
      }
    }
  }
  resumeCtx = undefined;
  resumeHandler = undefined;
}

function tapRecording(node: AudioNode): void {
  deps.connectRecording?.(node);
}

function untapRecording(node: AudioNode): void {
  deps.disconnectRecording?.(node);
}

function listenVoice(listener?: (active: boolean) => void): void {
  deps.listenVoiceActivity?.(listener);
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  if (deps.fetchAsset) {
    return deps.fetchAsset(url);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ambience ${response.status}`);
  }
  const type = response.headers.get('content-type') || '';
  if (type.includes('text/html')) {
    throw new Error('ambience html');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 64) {
    throw new Error('ambience empty');
  }
  return bytes;
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(message);
}
