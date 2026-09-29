export type CoachNote = {
  approved: boolean;
  note: string;
};

const KEY = 'sys112.coach.v1';

function readMap(): Record<string, CoachNote> {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, CoachNote>) : {};
  } catch {
    return {};
  }
}

export function readCoachNote(id: string): CoachNote {
  return readMap()[id] ?? { approved: false, note: '' };
}

export function writeCoachNote(id: string, next: CoachNote): void {
  if (typeof localStorage === 'undefined' || !id) {
    return;
  }
  const map = readMap();
  map[id] = {
    approved: Boolean(next.approved),
    note: next.note.trim().slice(0, 400),
  };
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function coachPromptLine(id: string): string {
  const note = readCoachNote(id).note.trim();
  if (!note) {
    return '';
  }
  return `КАК ВЕСТИ СЕБЯ НА ЛИНИИ. Это тон и то, что видно, если спросят. Не добавляй отсюда адрес, телефон и имя: ${note.slice(0, 240)}`;
}
