import type { LessonRecord } from './types';
import { pushLesson } from './remote';

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
  pushLesson(saved);
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
  pushLesson(next);
  return next;
}

export function removeLesson(id: string): void {
  if (!canUseStorage() || !id) {
    return;
  }
  for (const login of listLessonLogins()) {
    const current = readLessons(login);
    if (!current.some((item) => item.id === id)) {
      continue;
    }
    writeLessons(
      login,
      current.filter((item) => item.id !== id),
    );
  }
}

export function lessonsNewestFirst(login: string): LessonRecord[] {
  return [...readLessons(login)].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export function listLessonLogins(): string[] {
  if (!canUseStorage()) {
    return [];
  }
  const prefix = 'sys112.lessons.v1.';
  const logins: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) {
      logins.push(key.slice(prefix.length));
    }
  }
  return logins;
}

export function readAllLessons(): LessonRecord[] {
  return listLessonLogins().flatMap((login) => readLessons(login));
}

export function replaceLessonsFromServer(records: LessonRecord[], login?: string): void {
  if (!canUseStorage()) {
    return;
  }
  if (login) {
    writeLessons(
      login,
      records.filter((item) => !item.operatorLogin || item.operatorLogin === login),
    );
    return;
  }
  const grouped = new Map<string, LessonRecord[]>();
  for (const record of records) {
    if (!record.operatorLogin) {
      continue;
    }
    const list = grouped.get(record.operatorLogin) ?? [];
    list.push(record);
    grouped.set(record.operatorLogin, list);
  }
  const logins = new Set([...listLessonLogins(), ...grouped.keys()]);
  for (const name of logins) {
    writeLessons(name, grouped.get(name) ?? []);
  }
}

export function absorbLessons(records: LessonRecord[]): void {
  const grouped = new Map<string, LessonRecord[]>();
  for (const record of records) {
    const login = record.operatorLogin;
    if (!login) {
      continue;
    }
    if (!grouped.has(login)) {
      grouped.set(login, readLessons(login));
    }
    const list = grouped.get(login) as LessonRecord[];
    const index = list.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      list[index] = record;
    } else {
      list.push(record);
    }
  }
  for (const [login, list] of grouped) {
    writeLessons(login, list);
  }
}
