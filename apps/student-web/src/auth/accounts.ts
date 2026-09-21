import { Role, type Role as RoleName } from '@sys112/shared-types';
import {
  BUILTIN_AVATARS,
  BUILTIN_AVATAR_IDS,
  isBuiltinAvatarId,
  type BuiltinAvatarId,
} from './avatars';
import { hashPassword, verifyPassword } from './password';
import { readAllUsers, writeAllUsers } from './user-db';
import { listRemoteUsers, loginRemote, registerRemote, createRemoteUser } from '../admin/data/admin-remote';

const LEGACY_ACCOUNTS_KEY = 'sys112.accounts';
const SESSION_KEY = 'sys112.session';
const FALLBACK_ACCOUNTS_KEY = 'sys112.accounts.v2';

export const DEMO_PASSWORD = '112';

export type AccountStatus = 'active' | 'blocked';

export type AccountSource = 'seed' | 'self-register' | 'admin';

export type AccountAvatar =
  | { kind: 'builtin'; id: BuiltinAvatarId }
  | { kind: 'upload'; dataUrl: string };

export type Account = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  login: string;
  email: string;
  passwordHash?: string;
  role: RoleName;
  status: AccountStatus;
  avatar: AccountAvatar;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
  source?: AccountSource;
};

export type Session = {
  id: string;
  name: string;
  login: string;
  role: RoleName;
  avatarUrl?: string;
};

export type RegistrationInput = {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  password: string;
  passwordConfirm: string;
  avatar: AccountAvatar | null;
};

export type FieldErrors = Partial<
  Record<
    'firstName' | 'lastName' | 'middleName' | 'email' | 'login' | 'password' | 'passwordConfirm' | 'avatar',
    string
  >
>;

export type ManagedAccountInput = {
  firstName: string;
  lastName: string;
  middleName?: string;
  login: string;
  role: RoleName;
  password: string;
  passwordConfirm: string;
};

export const ROLE_LABEL: Record<RoleName, string> = {
  [Role.STUDENT]: 'Обучающийся',
  [Role.TEACHER]: 'Преподаватель',
  [Role.ADMIN]: 'Администратор',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[\p{L}][\p{L}\s'-]{0,49}$/u;

type SeedSpec = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  name: string;
  login: string;
  email: string;
  role: RoleName;
  status: AccountStatus;
  avatarId: BuiltinAvatarId;
  createdAt: string;
  password?: string;
};

const SEED_SPECS: SeedSpec[] = [
  {
    id: 'admin-volkova',
    firstName: 'Мария',
    lastName: 'Волкова',
    middleName: 'Ивановна',
    name: 'Волкова М. И.',
    login: 'volkova',
    email: 'volkova@sys112.local',
    role: Role.ADMIN,
    status: 'active',
    avatarId: 'sys112-avatar-01',
    createdAt: '2026-03-02T09:00:00.000Z',
    password: DEMO_PASSWORD,
  },
  {
    id: 'teacher-petrov',
    firstName: 'Дмитрий',
    lastName: 'Петров',
    middleName: 'Александрович',
    name: 'Петров Д. А.',
    login: 'petrov',
    email: 'petrov@sys112.local',
    role: Role.TEACHER,
    status: 'active',
    avatarId: 'sys112-avatar-02',
    createdAt: '2026-04-11T10:15:00.000Z',
    password: DEMO_PASSWORD,
  },
  {
    id: 'student-smirnova',
    firstName: 'Анна',
    lastName: 'Смирнова',
    middleName: 'Викторовна',
    name: 'Смирнова А. В.',
    login: 'smirnova',
    email: 'smirnova@sys112.local',
    role: Role.STUDENT,
    status: 'active',
    avatarId: 'sys112-avatar-03',
    createdAt: '2026-05-18T08:40:00.000Z',
    password: DEMO_PASSWORD,
  },
  {
    id: 'student-kozlov',
    firstName: 'Иван',
    lastName: 'Козлов',
    middleName: 'Петрович',
    name: 'Козлов И. П.',
    login: 'kozlov',
    email: 'kozlov@sys112.local',
    role: Role.STUDENT,
    status: 'active',
    avatarId: 'sys112-avatar-04',
    createdAt: '2026-05-18T08:41:00.000Z',
  },
  {
    id: 'student-novikova',
    firstName: 'Елена',
    lastName: 'Новикова',
    middleName: 'Сергеевна',
    name: 'Новикова Е. С.',
    login: 'novikova',
    email: 'novikova@sys112.local',
    role: Role.STUDENT,
    status: 'blocked',
    avatarId: 'sys112-avatar-05',
    createdAt: '2026-06-03T12:20:00.000Z',
  },
];

export const SEED_ACCOUNTS: Account[] = SEED_SPECS.filter((item) => item.password).map((spec) => specToAccount(spec));

function specToAccount(spec: SeedSpec, passwordHash?: string): Account {
  return {
    id: spec.id,
    name: spec.name,
    firstName: spec.firstName,
    lastName: spec.lastName,
    middleName: spec.middleName,
    login: spec.login,
    email: spec.email,
    passwordHash,
    role: spec.role,
    status: spec.status,
    avatar: { kind: 'builtin', id: spec.avatarId },
    createdAt: spec.createdAt,
    updatedAt: spec.createdAt,
    source: 'seed',
  };
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function displayName(lastName: string, firstName: string, middleName?: string): string {
  return [lastName, firstName, middleName].filter(Boolean).join(' ');
}

function isRole(value: unknown): value is RoleName {
  return value === Role.ADMIN || value === Role.TEACHER || value === Role.STUDENT;
}

function isAccountSource(value: unknown): value is AccountSource {
  return value === 'seed' || value === 'self-register' || value === 'admin';
}

function credentialsFromLogin(raw: string): { login: string; email: string } {
  const value = normalizeKey(raw);
  if (value.includes('@')) {
    const local = value.slice(0, value.indexOf('@')).trim();
    return { login: local || value, email: value };
  }
  return { login: value, email: `${value}@sys112.local` };
}

function isAvatar(value: unknown): value is AccountAvatar {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const avatar = value as AccountAvatar;
  if (avatar.kind === 'builtin') {
    return isBuiltinAvatarId(avatar.id);
  }
  return avatar.kind === 'upload' && typeof avatar.dataUrl === 'string' && avatar.dataUrl.startsWith('data:image/');
}

function sanitizeAccount(value: unknown): (Account & { legacyPassword?: string }) | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<Account> & { password?: string };
  if (typeof raw.id !== 'string' || typeof raw.login !== 'string') {
    return null;
  }
  const login = normalizeKey(raw.login);
  const firstName =
    typeof raw.firstName === 'string' && raw.firstName.trim()
      ? raw.firstName.trim()
      : raw.name?.split(/\s+/)[1] || raw.name || login;
  const lastName =
    typeof raw.lastName === 'string' && raw.lastName.trim()
      ? raw.lastName.trim()
      : raw.name?.split(/\s+/)[0] || login;
  const middleName = typeof raw.middleName === 'string' && raw.middleName.trim() ? raw.middleName.trim() : undefined;
  const email =
    typeof raw.email === 'string' && raw.email.includes('@') ? normalizeKey(raw.email) : `${login}@sys112.local`;
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  return {
    id: raw.id,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : displayName(lastName, firstName, middleName),
    firstName,
    lastName,
    middleName,
    login,
    email,
    passwordHash: typeof raw.passwordHash === 'string' ? raw.passwordHash : undefined,
    role: isRole(raw.role) ? raw.role : Role.STUDENT,
    status: raw.status === 'blocked' ? 'blocked' : 'active',
    avatar: isAvatar(raw.avatar) ? raw.avatar : { kind: 'builtin', id: BUILTIN_AVATAR_IDS[0] },
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
    lastSeenAt: typeof raw.lastSeenAt === 'string' ? raw.lastSeenAt : undefined,
    source: isAccountSource(raw.source) ? raw.source : undefined,
    legacyPassword: !raw.passwordHash && typeof raw.password === 'string' ? raw.password : undefined,
  };
}

function mergeAccounts(primary: Account[], incoming: Account[]): Account[] {
  const byId = new Map<string, Account>();
  const byLogin = new Map<string, string>();
  const byEmail = new Map<string, string>();

  const put = (account: Account, overwrite: boolean) => {
    const current = byId.get(account.id);
    const merged = overwrite && current ? { ...current, ...account, passwordHash: account.passwordHash ?? current.passwordHash } : current ?? account;
    const loginOwner = byLogin.get(merged.login);
    if (loginOwner && loginOwner !== merged.id) {
      return;
    }
    const emailOwner = byEmail.get(merged.email);
    if (emailOwner && emailOwner !== merged.id) {
      return;
    }
    byId.set(merged.id, merged);
    byLogin.set(merged.login, merged.id);
    byEmail.set(merged.email, merged.id);
  };

  for (const account of primary) {
    put(account, false);
  }
  for (const account of incoming) {
    put(account, true);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function readFallbackAccounts(): Account[] {
  if (!canUseStorage()) {
    return [];
  }
  try {
    const raw = localStorage.getItem(FALLBACK_ACCOUNTS_KEY) ?? localStorage.getItem(LEGACY_ACCOUNTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(sanitizeAccount).filter((item): item is Account => item !== null);
  } catch {
    return [];
  }
}

function withoutSecrets(account: Account & { legacyPassword?: string }): Account {
  const { legacyPassword: _legacyPassword, ...safe } = account;
  return safe;
}

function writeFallbackAccounts(accounts: Account[]): void {
  if (!canUseStorage()) {
    return;
  }
  localStorage.setItem(FALLBACK_ACCOUNTS_KEY, JSON.stringify(accounts.map(withoutSecrets)));
  localStorage.removeItem(LEGACY_ACCOUNTS_KEY);
}

async function readStoredAccounts(): Promise<Account[]> {
  if (canUseIndexedDb()) {
    try {
      const rows = await readAllUsers<unknown>();
      const parsed = rows.map(sanitizeAccount).filter((item): item is Account => item !== null);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Fall through to local fallback if IndexedDB is blocked.
    }
  }
  return readFallbackAccounts();
}

async function persistAccounts(accounts: Account[]): Promise<void> {
  const rows = accounts.map(withoutSecrets);
  if (canUseIndexedDb()) {
    try {
      await writeAllUsers(rows);
      if (canUseStorage()) {
        localStorage.removeItem(LEGACY_ACCOUNTS_KEY);
        localStorage.removeItem(FALLBACK_ACCOUNTS_KEY);
      }
      return;
    } catch {
      // Keep a hashed local fallback so the prototype still survives reload.
    }
  }
  writeFallbackAccounts(rows);
}

function findAccount(accounts: Account[], loginOrEmail: string): Account | undefined {
  const key = normalizeKey(loginOrEmail);
  return accounts.find((item) => item.login === key || item.email === key);
}

export function resolveAvatarUrl(avatar: AccountAvatar | undefined): string | undefined {
  if (!avatar) {
    return undefined;
  }
  if (avatar.kind === 'builtin') {
    return BUILTIN_AVATARS[avatar.id];
  }
  return avatar.dataUrl;
}

export function toSession(account: Account): Session {
  return {
    id: account.id,
    name: account.name,
    login: account.login,
    role: account.role,
    avatarUrl: resolveAvatarUrl(account.avatar),
  };
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
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const session = parsed as Session;
    if (typeof session.id !== 'string' || typeof session.login !== 'string' || !isRole(session.role)) {
      return null;
    }
    return session;
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
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      id: session.id,
      name: session.name,
      login: session.login,
      role: session.role,
    }),
  );
}

export async function loadAccounts(): Promise<Account[]> {
  const stored = (await readStoredAccounts()) as Array<Account & { legacyPassword?: string }>;
  const missingSeeds = SEED_SPECS.filter(
    (spec) => !stored.some((item) => item.id === spec.id || item.login === spec.login),
  );
  const hashedSeeds = await Promise.all(
    missingSeeds.map(async (spec) =>
      specToAccount(spec, spec.password ? await hashPassword(spec.password) : undefined),
    ),
  );
  let merged = mergeAccounts(hashedSeeds, stored.map(withoutSecrets));
  let changed = hashedSeeds.length > 0 || stored.length === 0;

  merged = await Promise.all(
    merged.map(async (account) => {
      const raw = stored.find((item) => item.id === account.id);
      if (account.passwordHash || !raw?.legacyPassword) {
        return account;
      }
      changed = true;
      return {
        ...account,
        passwordHash: await hashPassword(raw.legacyPassword),
        updatedAt: new Date().toISOString(),
      };
    }),
  );

  for (const spec of SEED_SPECS) {
    if (!spec.password) {
      continue;
    }
    const current = merged.find((item) => item.id === spec.id || item.login === spec.login);
    if (current && !current.passwordHash) {
      changed = true;
      current.passwordHash = await hashPassword(spec.password);
      current.updatedAt = new Date().toISOString();
    }
  }

  if (changed) {
    await persistAccounts(merged);
  }

  const remote = await listRemoteUsers();
  if (remote?.length) {
    const byLogin = new Map(remote.map((item) => [item.login, item]));
    merged = merged.map((account) => {
      const hit = byLogin.get(account.login);
      if (!hit) {
        return account;
      }
      return {
        ...account,
        id: hit.id,
        name: hit.name,
        email: hit.email,
        role: hit.role,
        status: hit.status,
        createdAt: hit.createdAt,
      };
    });
    for (const user of remote) {
      if (!merged.some((account) => account.login === user.login)) {
        const parts = user.name.split(/\s+/);
        merged.push({
          id: user.id,
          name: user.name,
          firstName: parts[1] || user.login,
          lastName: parts[0] || user.login,
          login: user.login,
          email: user.email,
          role: user.role,
          status: user.status,
          avatar: { kind: 'builtin', id: BUILTIN_AVATAR_IDS[0] },
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
          source: 'admin',
        });
      }
    }
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
  await persistAccounts(accounts);
}

export function validateRegistration(input: RegistrationInput, accounts: Account[]): FieldErrors {
  const errors: FieldErrors = {};
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = normalizeKey(input.email);

  if (!firstName) {
    errors.firstName = 'Укажите имя.';
  } else if (!NAME_PATTERN.test(firstName)) {
    errors.firstName = 'Имя должно содержать буквы.';
  }

  if (!lastName) {
    errors.lastName = 'Укажите фамилию.';
  } else if (!NAME_PATTERN.test(lastName)) {
    errors.lastName = 'Фамилия должна содержать буквы.';
  }

  if (input.middleName?.trim() && !NAME_PATTERN.test(input.middleName.trim())) {
    errors.middleName = 'Отчество должно содержать буквы.';
  }

  if (!email) {
    errors.email = 'Укажите электронную почту.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Некорректный формат электронной почты.';
  } else if (findAccount(accounts, email)) {
    errors.email = 'Эта электронная почта уже используется.';
  }

  if (!input.password) {
    errors.password = 'Укажите пароль.';
  }

  if (!input.passwordConfirm) {
    errors.passwordConfirm = 'Повторите пароль.';
  } else if (input.password !== input.passwordConfirm) {
    errors.passwordConfirm = 'Пароли не совпадают.';
  }

  if (!input.avatar) {
    errors.avatar = 'Выберите аватар или загрузите фото.';
  }

  return errors;
}

export async function authenticate(
  accounts: Account[],
  login: string,
  password: string,
): Promise<{ ok: true; session: Session } | { ok: false; message: string }> {
  const remote = await loginRemote(login, password);
  if (remote?.ok && remote.user) {
    const existing = findAccount(accounts, remote.user.login) ?? findAccount(accounts, remote.user.id);
    return {
      ok: true,
      session: existing
        ? toSession({ ...existing, id: remote.user.id, name: remote.user.name, role: remote.user.role, status: remote.user.status })
        : {
            id: remote.user.id,
            name: remote.user.name,
            login: remote.user.login,
            role: remote.user.role,
          },
    };
  }
  if (remote && remote.ok === false && remote.message) {
    return { ok: false, message: remote.message };
  }

  const account = findAccount(accounts, login);
  if (!account || !account.passwordHash) {
    return { ok: false, message: 'Нет такой учётной записи.' };
  }
  if (account.status === 'blocked') {
    return { ok: false, message: 'Учётная запись заблокирована.' };
  }
  const matches = await verifyPassword(password, account.passwordHash);
  if (!matches) {
    return { ok: false, message: 'Неверный пароль.' };
  }
  return { ok: true, session: toSession(account) };
}

export async function registerAccount(
  accounts: Account[],
  input: RegistrationInput,
): Promise<{ ok: true; account: Account; session: Session; accounts: Account[] } | { ok: false; errors: FieldErrors; message: string }> {
  const errors = validateRegistration(input, accounts);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, message: Object.values(errors)[0] ?? 'Проверьте поля формы.' };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const middleName = input.middleName?.trim() || undefined;
  const email = normalizeKey(input.email);
  const now = new Date().toISOString();
  const account: Account = {
    id: crypto.randomUUID(),
    name: displayName(lastName, firstName, middleName),
    firstName,
    lastName,
    middleName,
    login: email,
    email,
    passwordHash: await hashPassword(input.password),
    role: Role.STUDENT,
    status: 'active',
    avatar: input.avatar as AccountAvatar,
    createdAt: now,
    updatedAt: now,
    source: 'self-register',
  };

  const next = mergeAccounts(accounts, [account]);
  try {
    await persistAccounts(next);
  } catch {
    return {
      ok: false,
      errors: { email: 'Не удалось сохранить учётную запись.' },
      message: 'Не удалось сохранить учётную запись.',
    };
  }
  void registerRemote({
    login: account.login,
    email: account.email,
    name: account.name,
    password: input.password,
  });
  return { ok: true, account, session: toSession(account), accounts: next };
}

export function validateManagedAccount(input: ManagedAccountInput, accounts: Account[]): FieldErrors {
  const errors: FieldErrors = {};
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const loginRaw = input.login.trim();

  if (!lastName) {
    errors.lastName = 'Укажите фамилию.';
  } else if (!NAME_PATTERN.test(lastName)) {
    errors.lastName = 'Фамилия должна содержать буквы.';
  }

  if (!firstName) {
    errors.firstName = 'Укажите имя.';
  } else if (!NAME_PATTERN.test(firstName)) {
    errors.firstName = 'Имя должно содержать буквы.';
  }

  if (input.middleName?.trim() && !NAME_PATTERN.test(input.middleName.trim())) {
    errors.middleName = 'Отчество должно содержать буквы.';
  }

  if (!loginRaw) {
    errors.login = 'Укажите почту или логин.';
  } else {
    const { login, email } = credentialsFromLogin(loginRaw);
    if (loginRaw.includes('@') && !EMAIL_PATTERN.test(email)) {
      errors.login = 'Некорректный формат электронной почты.';
    } else if (findAccount(accounts, login) || findAccount(accounts, email)) {
      errors.login = 'Такой логин или почта уже есть.';
    }
  }

  if (!input.password) {
    errors.password = 'Укажите пароль.';
  }

  if (!input.passwordConfirm) {
    errors.passwordConfirm = 'Повторите пароль.';
  } else if (input.password !== input.passwordConfirm) {
    errors.passwordConfirm = 'Пароли не совпадают.';
  }

  if (!isRole(input.role)) {
    errors.login = errors.login ?? 'Выберите роль явно.';
  }

  return errors;
}

export function validatePasswordPair(password: string, passwordConfirm: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!password.trim()) {
    errors.password = 'Укажите пароль.';
  }
  if (!passwordConfirm.trim()) {
    errors.passwordConfirm = 'Повторите пароль.';
  } else if (password !== passwordConfirm) {
    errors.passwordConfirm = 'Пароли не совпадают.';
  }
  return errors;
}

export async function createManagedAccount(accounts: Account[], input: ManagedAccountInput): Promise<Account> {
  const errors = validateManagedAccount(input, accounts);
  const firstError = Object.values(errors)[0];
  if (firstError) {
    throw new Error(firstError);
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const middleName = input.middleName?.trim() || undefined;
  let { login, email } = credentialsFromLogin(input.login);
  if (findAccount(accounts, login) && login !== email) {
    login = email;
  }
  const now = new Date().toISOString();
  const account: Account = {
    id: crypto.randomUUID(),
    name: displayName(lastName, firstName, middleName),
    firstName,
    lastName,
    middleName,
    login,
    email,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    status: 'active',
    avatar: { kind: 'builtin', id: BUILTIN_AVATAR_IDS[0] },
    createdAt: now,
    updatedAt: now,
    source: 'admin',
  };
  const remote = await createRemoteUser({
    login: account.login,
    name: account.name,
    role: account.role,
    password: input.password,
  });
  if (remote?.user) {
    account.id = remote.user.id;
  }
  return account;
}

export function hydrateSession(accounts: Account[], stored: Session | null): Session | null {
  if (!stored) {
    return null;
  }
  const account = accounts.find((item) => item.id === stored.id);
  if (!account || account.status !== 'active') {
    return null;
  }
  return toSession(account);
}

export { BUILTIN_AVATAR_IDS, BUILTIN_AVATARS };
export type { BuiltinAvatarId };
