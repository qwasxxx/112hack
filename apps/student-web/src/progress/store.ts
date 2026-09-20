import type { LessonRecord } from './types';

const keyFor = (login: string) => `sys112.lessons.v1.${login}`;

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function readLessons(login: string): LessonRecord[] {
  if (!canUseStorage() || !login) {
    return [];
  }
  try {
    const raw = localStorage.getItem(keyFor(login));
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LessonRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLessons(login: string, records: LessonRecord[]) {
  if (!canUseStorage() || !login) {
    return;
  }
  localStorage.setItem(keyFor(login), JSON.stringify(records));
}

/** Append-only. TZ: обучающийся не удаляет результаты. */
export function appendLesson(login: string, record: Omit<LessonRecord, 'id'>): LessonRecord {
  const current = readLessons(login);
  const duplicate = current.find(
    (item) =>
      item.mode === record.mode &&
      item.scenarioId === record.scenarioId &&
      item.completedAt === record.completedAt &&
      item.operatorLogin === record.operatorLogin,
  );
  if (duplicate) {
    return duplicate;
  }
  const saved: LessonRecord = { ...record, id: crypto.randomUUID() };
  writeLessons(login, [...current, saved]);
  return saved;
}

export function patchLesson(login: string, id: string, patch: Partial<Omit<LessonRecord, 'id'>>): LessonRecord | null {
  const current = readLessons(login);
  const index = current.findIndex((item) => item.id === id);
  if (index < 0) {
    return null;
  }
  const next = { ...current[index], ...patch, id: current[index].id };
  const copy = [...current];
  copy[index] = next;
  writeLessons(login, copy);
  return next;
}

export function lessonsNewestFirst(login: string): LessonRecord[] {
  return [...readLessons(login)].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}
