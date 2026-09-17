import { Role, type Role as RoleName } from '@sys112/shared-types';

const ACCOUNTS_KEY = 'sys112.accounts';
const SESSION_KEY = 'sys112.session';

export const DEMO_PASSWORD = '112';

export type AccountStatus = 'active' | 'blocked';

export type Account = {
  id: string;
  name: string;
  login: string;
  password?: string;
  role: RoleName;
  status: AccountStatus;
  createdAt: string;
};

export type Session = {
  id: string;
  name: string;
  login: string;
  role: RoleName;
};

export const ROLE_LABEL: Record<RoleName, string> = {
  [Role.STUDENT]: 'Обучающийся',
  [Role.TEACHER]: 'Преподаватель',
  [Role.ADMIN]: 'Администратор',
};

export const SEED_ACCOUNTS: Account[] = [
  {
    id: 'admin-volkova',
    name: 'Волкова М. И.',
    login: 'volkova',
    password: DEMO_PASSWORD,
    role: Role.ADMIN,
    status: 'active',
    createdAt: '2026-03-02T09:00:00.000Z',
  },
  {
    id: 'teacher-petrov',
    name: 'Петров Д. А.',
    login: 'petrov',
    password: DEMO_PASSWORD,
    role: Role.TEACHER,
    status: 'active',
    createdAt: '2026-04-11T10:15:00.000Z',
  },
  {
    id: 'student-smirnova',
    name: 'Смирнова А. В.',
    login: 'smirnova',
    password: DEMO_PASSWORD,
    role: Role.STUDENT,
    status: 'active',
    createdAt: '2026-05-18T08:40:00.000Z',
  },
];

const DIRECTORY_ONLY: Account[] = [
  {
    id: 'student-kozlov',
    name: 'Козлов И. П.',
    login: 'kozlov',
    role: Role.STUDENT,
    status: 'active',
    createdAt: '2026-05-18T08:41:00.000Z',
  },
  {
    id: 'student-novikova',
    name: 'Новикова Е. С.',
    login: 'novikova',
    role: Role.STUDENT,
    status: 'blocked',
    createdAt: '2026-06-03T12:20:00.000Z',
  },
];

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readStoredAccounts(): Account[] {
  if (!canUseStorage()) {
    return [];
  }
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Account[]) : [];
  } catch {
    return [];
  }
}

export function loadAccounts(): Account[] {
  const byLogin = new Map<string, Account>();
  for (const account of [...DIRECTORY_ONLY, ...SEED_ACCOUNTS]) {
    byLogin.set(account.login, account);
  }
  for (const account of readStoredAccounts()) {
    const current = byLogin.get(account.login);
    byLogin.set(account.login, {
      ...current,
      ...account,
      password: account.password ?? current?.password,
    });
  }
  return [...byLogin.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export function saveAccounts(accounts: Account[]): void {
  if (!canUseStorage()) {
    return;
  }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function readSession(): Session | null {
  if (!canUseStorage()) {
    return null;
  }
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null): void {
  if (!canUseStorage()) {
    return;
  }
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function authenticate(
  accounts: Account[],
  login: string,
  password: string,
): { ok: true; session: Session } | { ok: false; message: string } {
  const key = login.trim().toLowerCase();
  const account = accounts.find((item) => item.login === key);
  if (!account || !account.password) {
    return { ok: false, message: 'Нет такой учётной записи.' };
  }
  if (account.status === 'blocked') {
    return { ok: false, message: 'Учётная запись заблокирована.' };
  }
  if (account.password !== password) {
    return { ok: false, message: 'Неверный пароль.' };
  }
  return {
    ok: true,
    session: { id: account.id, name: account.name, login: account.login, role: account.role },
  };
}

export function toSession(account: Account): Session {
  return { id: account.id, name: account.name, login: account.login, role: account.role };
}
