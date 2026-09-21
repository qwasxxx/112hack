import { pushClass } from './remote';

export const CLASS_CATEGORY_OPTIONS = [
  { id: 'fire', label: 'Пожар' },
  { id: 'ambulance', label: 'Медицина' },
  { id: 'police', label: 'Полиция / ДТП' },
  { id: 'gas', label: 'Газ' },
] as const;

export type ClassCategoryId = (typeof CLASS_CATEGORY_OPTIONS)[number]['id'];

export type ClassSession = {
  active: boolean;
  startedAt: string;
  teacherLogin: string;
  title: string;
  categories: string[];
};

const KEY = 'sys112.class.v1';

const idle = (): ClassSession => ({
  active: false,
  startedAt: '',
  teacherLogin: '',
  title: '',
  categories: [],
});

function asCategories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowed = new Set<string>(CLASS_CATEGORY_OPTIONS.map((item) => item.id));
  return value.filter((item): item is string => typeof item === 'string' && allowed.has(item));
}

export function readClassSession(): ClassSession {
  if (typeof localStorage === 'undefined') {
    return idle();
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return idle();
    }
    const parsed = JSON.parse(raw) as Partial<ClassSession>;
    return {
      active: Boolean(parsed.active),
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
      teacherLogin: typeof parsed.teacherLogin === 'string' ? parsed.teacherLogin : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      categories: asCategories(parsed.categories),
    };
  } catch {
    return idle();
  }
}

function persist(session: ClassSession, sync: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(session));
  }
  if (sync) {
    pushClass(session);
  }
}

export function startClass(
  teacherLogin: string,
  title = 'Учебное занятие',
  categories: string[] = [],
): ClassSession {
  const session: ClassSession = {
    active: true,
    startedAt: new Date().toISOString(),
    teacherLogin,
    title,
    categories: asCategories(categories),
  };
  persist(session, true);
  return session;
}

export function stopClass(): ClassSession {
  const session = idle();
  persist(session, true);
  return session;
}

export function replaceClassSession(session: ClassSession): void {
  persist(
    {
      active: Boolean(session.active),
      startedAt: session.startedAt || '',
      teacherLogin: session.teacherLogin || '',
      title: session.title || '',
      categories: asCategories(session.categories),
    },
    false,
  );
}
