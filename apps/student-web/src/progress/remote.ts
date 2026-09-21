import type { LessonRecord } from './types';
import type { AssignmentStore } from './assignments';
import type { ClassSession } from './class-session';
import type { LivePresence } from './live-presence';

type OverlayMap = Record<string, { expertScore?: number; comment?: string }>;

type OutboxItem = {
  path: string;
  method: string;
  body: string;
  at: number;
};

const OUTBOX_KEY = 'sys112.outbox.v1';
const OUTBOX_TTL_MS = 30_000;

function readOutbox(): OutboxItem[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-40)));
}

function enqueue(path: string, method: string, body: string): void {
  const now = Date.now();
  const items = readOutbox().filter((item) => now - item.at < OUTBOX_TTL_MS);
  items.push({ path, method, body, at: now });
  writeOutbox(items);
}

async function request<T>(path: string, init?: RequestInit, queued = false): Promise<T | null> {
  try {
    const response = await fetch(`/api/v1/training${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      if (!queued && init?.method && init.method !== 'GET' && typeof init.body === 'string') {
        enqueue(path, init.method, init.body);
      }
      return null;
    }
    return (await response.json()) as T;
  } catch {
    if (!queued && init?.method && init.method !== 'GET' && typeof init.body === 'string') {
      enqueue(path, init.method, init.body);
    }
    return null;
  }
}

async function flushOutbox(): Promise<void> {
  const now = Date.now();
  const pending = readOutbox().filter((item) => now - item.at < OUTBOX_TTL_MS);
  if (!pending.length) {
    writeOutbox([]);
    return;
  }
  const kept: OutboxItem[] = [];
  for (const item of pending) {
    const ok = await request(item.path, { method: item.method, body: item.body }, true);
    if (ok == null && Date.now() - item.at < OUTBOX_TTL_MS) {
      kept.push(item);
    }
  }
  writeOutbox(kept);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushOutbox();
  });
  window.setInterval(() => {
    void flushOutbox();
  }, 4000);
}

export function pushLesson(record: LessonRecord): void {
  void request(`/lessons/${record.id}`, {
    method: 'PUT',
    body: JSON.stringify({ login: record.operatorLogin, payload: record }),
  });
}

export function pushAssignments(store: AssignmentStore): void {
  void request('/assignments', {
    method: 'PUT',
    body: JSON.stringify({ scenarioIds: store.scenarioIds, teacherLogin: store.teacherLogin }),
  });
}

export function pushClass(session: ClassSession): void {
  void request('/class', {
    method: 'PUT',
    body: JSON.stringify(session),
  });
}

export function pushOverlay(lessonId: string, overlay: { expertScore?: number; comment?: string }): void {
  void request(`/overlays/${lessonId}`, {
    method: 'PUT',
    body: JSON.stringify(overlay),
  });
}

export function pushAudit(id: string, payload: Record<string, unknown>): void {
  void request(`/audit/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function pushLive(entry: LivePresence): void {
  void request(`/live/${encodeURIComponent(entry.login)}`, {
    method: 'PUT',
    body: JSON.stringify(entry),
  });
}

export function removeLive(login: string): void {
  void request(`/live/${encodeURIComponent(login)}`, { method: 'DELETE' });
}

export async function pullLessons(login?: string): Promise<LessonRecord[]> {
  const suffix = login ? `?login=${encodeURIComponent(login)}` : '';
  const rows = await request<LessonRecord[]>(`/lessons${suffix}`);
  return Array.isArray(rows) ? rows : [];
}

export async function pullAssignments(): Promise<(AssignmentStore & { configured?: boolean }) | null> {
  return request('/assignments');
}

export async function pullClass(): Promise<ClassSession | null> {
  return request('/class');
}

export async function pullOverlays(): Promise<OverlayMap | null> {
  return request('/overlays');
}

export async function pullAudit(): Promise<unknown[] | null> {
  return request('/audit');
}

export async function pullLive(): Promise<LivePresence[]> {
  const rows = await request<LivePresence[]>('/live');
  return Array.isArray(rows) ? rows : [];
}
