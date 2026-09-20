import { Role, type Role as RoleName } from '@sys112/shared-types';
import {
  ROLE_LABEL,
  type Account,
  type AccountSource,
  type AccountStatus,
} from '../../auth/accounts';
import { hashPassword } from '../../auth/password';

export type DirectoryQuery = {
  search: string;
  role: RoleName | 'all';
  status: AccountStatus | 'all';
};

export type AccountOrigin = AccountSource;

export type GuardResult = { ok: true } | { ok: false; message: string };

export type DirectoryResult =
  | { ok: true; accounts: Account[]; account: Account }
  | { ok: false; message: string };

const GENERATED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function accountOrigin(account: Account): AccountOrigin {
  if (account.source) {
    return account.source;
  }
  if (!GENERATED_ID.test(account.id)) {
    return 'seed';
  }
  if (account.login === account.email) {
    return 'self-register';
  }
  return 'admin';
}

export function originLabel(origin: AccountOrigin): string {
  if (origin === 'self-register') {
    return 'Саморегистрация';
  }
  if (origin === 'admin') {
    return 'Создана администратором';
  }
  return 'Системная';
}

export function fullName(account: Account): string {
  return [account.lastName, account.firstName, account.middleName].filter(Boolean).join(' ') || account.name;
}

export function isPrivilegedRole(role: RoleName): boolean {
  return role === Role.ADMIN || role === Role.TEACHER;
}

export function filterDirectory(accounts: Account[], query: DirectoryQuery): Account[] {
  const search = query.search.trim().toLowerCase();
  return accounts
    .filter((account) => {
      if (query.role !== 'all' && account.role !== query.role) {
        return false;
      }
      if (query.status !== 'all' && account.status !== query.status) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = [account.name, account.firstName, account.lastName, account.middleName, account.login, account.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function canChangeRole(
  accounts: Account[],
  userId: string,
  nextRole: RoleName,
  _operatorId: string,
): GuardResult {
  const account = accounts.find((item) => item.id === userId);
  if (!account) {
    return { ok: false, message: 'Учётная запись не найдена.' };
  }
  if (account.role === nextRole) {
    return { ok: true };
  }
  if (account.role === Role.ADMIN && nextRole !== Role.ADMIN && !hasOtherActiveAdmin(accounts, userId)) {
    return { ok: false, message: 'Нельзя снять роль с последнего администратора.' };
  }
  return { ok: true };
}

export function canBlockAccount(accounts: Account[], userId: string, operatorId: string): GuardResult {
  const account = accounts.find((item) => item.id === userId);
  if (!account) {
    return { ok: false, message: 'Учётная запись не найдена.' };
  }
  if (userId === operatorId) {
    return { ok: false, message: 'Нельзя заблокировать собственную учётку.' };
  }
  if (account.role === Role.ADMIN && account.status === 'active' && !hasOtherActiveAdmin(accounts, userId)) {
    return { ok: false, message: 'Нельзя заблокировать последнего администратора.' };
  }
  return { ok: true };
}

export function applyRoleChange(
  accounts: Account[],
  userId: string,
  role: RoleName,
  operatorId: string,
): DirectoryResult {
  const guard = canChangeRole(accounts, userId, role, operatorId);
  if (!guard.ok) {
    return guard;
  }
  const account = accounts.find((item) => item.id === userId);
  if (!account) {
    return { ok: false, message: 'Учётная запись не найдена.' };
  }
  if (account.role === role) {
    return { ok: true, account, accounts };
  }
  const next: Account = { ...account, role, updatedAt: new Date().toISOString() };
  return { ok: true, account: next, accounts: replaceAccount(accounts, next) };
}

export function applyStatusChange(
  accounts: Account[],
  userId: string,
  status: AccountStatus,
  operatorId: string,
): DirectoryResult {
  const account = accounts.find((item) => item.id === userId);
  if (!account) {
    return { ok: false, message: 'Учётная запись не найдена.' };
  }
  if (account.status === status) {
    return { ok: true, account, accounts };
  }
  if (status === 'blocked') {
    const guard = canBlockAccount(accounts, userId, operatorId);
    if (!guard.ok) {
      return guard;
    }
  }
  const next: Account = { ...account, status, updatedAt: new Date().toISOString() };
  return { ok: true, account: next, accounts: replaceAccount(accounts, next) };
}

export async function resetLocalPassword(
  accounts: Account[],
  userId: string,
  password: string,
): Promise<DirectoryResult> {
  const account = accounts.find((item) => item.id === userId);
  if (!account) {
    return { ok: false, message: 'Учётная запись не найдена.' };
  }
  const secret = password.trim();
  if (!secret) {
    return { ok: false, message: 'Укажите новый пароль.' };
  }
  const next: Account = {
    ...account,
    passwordHash: await hashPassword(secret),
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, account: next, accounts: replaceAccount(accounts, next) };
}

export function recordLastSeen(accounts: Account[], userId: string): Account[] {
  const now = new Date().toISOString();
  return accounts.map((item) => (item.id === userId ? { ...item, lastSeenAt: now } : item));
}

export function roleTone(role: RoleName): 'admin' | 'teacher' | 'student' {
  if (role === Role.ADMIN) {
    return 'admin';
  }
  if (role === Role.TEACHER) {
    return 'teacher';
  }
  return 'student';
}

export { ROLE_LABEL };

function hasOtherActiveAdmin(accounts: Account[], userId: string): boolean {
  return accounts.some((item) => item.id !== userId && item.role === Role.ADMIN && item.status === 'active');
}

function replaceAccount(accounts: Account[], next: Account): Account[] {
  return accounts.map((item) => (item.id === next.id ? next : item));
}
