import type { InterventionType } from '@sys112/shared-types';

export type TeacherCue = {
  id: string;
  login: string;
  type: InterventionType;
  note: string;
  at: string;
  llmSent: boolean;
  dismissed: boolean;
};

const KEY = 'sys112.interventions.v1';
const LIVE_MS = 90_000;

export const CUE_LABEL: Record<InterventionType, string> = {
  set_emotional_state: 'Эмоции заявителя',
  add_circumstance: 'Новое обстоятельство',
  inject_event: 'Внезапное событие',
  reveal_fact: 'Открыт факт',
  conceal_fact: 'Скрыт факт',
  force_state: 'Смена фазы',
  adjust_difficulty: 'Сложность диалога',
  end_call: 'Завершить вызов',
};

function readAll(): TeacherCue[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TeacherCue[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: TeacherCue[]): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 80)));
}

export function pushTeacherCue(login: string, type: InterventionType, note: string): TeacherCue {
  const cue: TeacherCue = {
    id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    login,
    type,
    note: note.trim(),
    at: new Date().toISOString(),
    llmSent: false,
    dismissed: false,
  };
  writeAll([cue, ...readAll()]);
  return cue;
}

export function activeCues(login: string): TeacherCue[] {
  const now = Date.now();
  return readAll().filter(
    (item) =>
      item.login === login &&
      !item.dismissed &&
      now - Date.parse(item.at) < LIVE_MS,
  );
}

export function latestCue(login: string): TeacherCue | null {
  return activeCues(login)[0] ?? null;
}

export function takePendingLlmCues(login: string): TeacherCue[] {
  const pending = readAll().filter((item) => item.login === login && !item.llmSent && !item.dismissed);
  if (!pending.length) {
    return [];
  }
  const ids = new Set(pending.map((item) => item.id));
  writeAll(readAll().map((item) => (ids.has(item.id) ? { ...item, llmSent: true } : item)));
  return pending;
}

export function dismissCue(id: string): void {
  writeAll(readAll().map((item) => (item.id === id ? { ...item, dismissed: true } : item)));
}
