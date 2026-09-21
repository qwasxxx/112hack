import { pushClass } from './remote';

export type ClassSession = {
  active: boolean;
  startedAt: string;
  teacherLogin: string;
  title: string;
};

const KEY = 'sys112.class.v1';

const idle = (): ClassSession => ({
  active: false,
  startedAt: '',
  teacherLogin: '',
  title: '',
});

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

export function startClass(teacherLogin: string, title = 'Учебное занятие'): ClassSession {
  const session: ClassSession = {
    active: true,
    startedAt: new Date().toISOString(),
    teacherLogin,
    title,
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
  persist(session, false);
}
