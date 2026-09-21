export type LivePresence = {
  login: string;
  name: string;
  scenarioId: string;
  scenarioTitle: string;
  mode: 'training' | 'exam' | 'dds';
  startedAt: string;
  cardProgress: number;
  updatedAt: string;
};

const KEY = 'sys112.live.v1';
const STALE_MS = 15_000;

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
}

export function upsertLive(entry: LivePresence): void {
  const map = readMap();
  map[entry.login] = entry;
  writeMap(map);
}

export function clearLive(login: string): void {
  const map = readMap();
  delete map[login];
  writeMap(map);
}

export function readLiveSessions(): LivePresence[] {
  const now = Date.now();
  return Object.values(readMap()).filter((item) => now - Date.parse(item.updatedAt) < STALE_MS);
}
