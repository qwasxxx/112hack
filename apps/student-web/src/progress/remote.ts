import type { LessonRecord } from './types';
import type { AssignmentStore } from './assignments';
import type { ClassSession } from './class-session';
import type { LivePresence } from './live-presence';

type OverlayMap = Record<string, { expertScore?: number; comment?: string }>;

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`/api/v1/training${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
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

export async function pullLessons(): Promise<LessonRecord[]> {
  const rows = await request<LessonRecord[]>('/lessons');
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
