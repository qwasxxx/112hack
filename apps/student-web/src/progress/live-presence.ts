import { pushLive, removeLive } from './remote';
import type { LiveCardRow } from './card-progress';

export type LiveTranscriptLine = {
  role: 'student' | 'caller' | 'system';
  text: string;
  at: string;
};

export type LivePresence = {
  login: string;
  name: string;
  scenarioId: string;
  scenarioTitle: string;
  mode: 'training' | 'exam' | 'dds';
  startedAt: string;
  cardProgress: number;
  foundActions?: number;
  missedActions?: number;
  phase?: string;
  cardRows?: LiveCardRow[];
  transcript?: LiveTranscriptLine[];
  updatedAt: string;
};

const KEY = 'sys112.live.v1';
const CHANNEL = 'sys112.live.v1';
const STALE_MS = 45_000;

function notifyLive(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('tick');
    channel.close();
  } catch {
    /* BroadcastChannel may be unavailable */
  }
}

function readMap(): Record<string, LivePresence> {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LivePresence>) : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, LivePresence>): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(map));
  notifyLive();
}

export function upsertLive(entry: LivePresence): void {
  const map = readMap();
  const previous = map[entry.login];
  map[entry.login] = {
    ...previous,
    ...entry,
    transcript: entry.transcript ?? previous?.transcript,
  };
  writeMap(map);
  pushLive(map[entry.login]);
}

export function patchLive(login: string, patch: Partial<LivePresence>): void {
  const map = readMap();
  const current = map[login];
  if (!current) {
    return;
  }
  map[login] = { ...current, ...patch, login, updatedAt: new Date().toISOString() };
  writeMap(map);
  pushLive(map[login]);
}

export function clearLive(login: string): void {
  const map = readMap();
  delete map[login];
  writeMap(map);
  removeLive(login);
}

export function mergeRemoteLive(entries: LivePresence[]): void {
  if (!entries.length) {
    return;
  }
  const map = readMap();
  for (const entry of entries) {
    if (!entry?.login) {
      continue;
    }
    map[entry.login] = entry;
  }
  writeMap(map);
}

export function readLiveSessions(): LivePresence[] {
  const now = Date.now();
  return Object.values(readMap()).filter((item) => {
    const stamp = Date.parse(item.updatedAt);
    return Number.isFinite(stamp) && now - stamp < STALE_MS;
  });
}

export function subscribeLive(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      onChange();
    }
  };
  window.addEventListener('storage', onStorage);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => onChange();
  } catch {
    channel = undefined;
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    channel?.close();
  };
}
