import type { InterventionType } from '@sys112/shared-types';
import { pickInterventionNote } from './intervention-playbook';
import { pullCues, pushCue } from './remote';

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
const CHANNEL = 'sys112.cues.v1';
const LIVE_MS = 180_000;

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

function notifyCues(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('tick');
    channel.close();
  } catch {
    /* BroadcastChannel may be unavailable */
  }
}

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

function writeAll(items: TeacherCue[], broadcast = true): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 80)));
  if (broadcast) {
    notifyCues();
  }
}

export function mergeRemoteCues(items: TeacherCue[]): void {
  if (!items.length) {
    return;
  }
  const current = readAll();
  const byId = new Map(current.map((item) => [item.id, item]));
  let changed = false;
  for (const item of items) {
    if (!item?.id || !item.login) {
      continue;
    }
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, item);
      changed = true;
      continue;
    }
    if (item.llmSent && !prev.llmSent) {
      byId.set(item.id, { ...prev, llmSent: true });
      changed = true;
    }
    if (item.dismissed && !prev.dismissed) {
      byId.set(item.id, { ...byId.get(item.id)!, dismissed: true });
      changed = true;
    }
  }
  if (changed) {
    writeAll(
      [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)),
      true,
    );
  }
}

export function pushTeacherCue(login: string, type: InterventionType, note: string): TeacherCue {
  const cue: TeacherCue = {
    id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    login,
    type,
    note: pickInterventionNote(type, note),
    at: new Date().toISOString(),
    llmSent: false,
    dismissed: false,
  };
  writeAll([cue, ...readAll()]);
  pushCue(cue);
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

export function peekPendingLlmCues(login: string): TeacherCue[] {
  return readAll().filter((item) => item.login === login && !item.llmSent && !item.dismissed);
}

export function takePendingLlmCues(login: string): TeacherCue[] {
  const pending = peekPendingLlmCues(login);
  if (!pending.length) {
    return [];
  }
  markCuesLlmSent(pending.map((item) => item.id));
  return pending;
}

export function markCuesLlmSent(ids: string[]): void {
  if (!ids.length) {
    return;
  }
  const set = new Set(ids);
  writeAll(readAll().map((item) => (set.has(item.id) ? { ...item, llmSent: true } : item)));
  for (const item of readAll()) {
    if (set.has(item.id)) {
      pushCue(item);
    }
  }
}

export function dismissCue(id: string): void {
  writeAll(readAll().map((item) => (item.id === id ? { ...item, dismissed: true } : item)));
  const cue = readAll().find((item) => item.id === id);
  if (cue) {
    pushCue(cue);
  }
}

export async function refreshCuesFromApi(login?: string): Promise<void> {
  const rows = await pullCues(login);
  mergeRemoteCues(rows);
}

export function subscribeCues(onChange: () => void): () => void {
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
