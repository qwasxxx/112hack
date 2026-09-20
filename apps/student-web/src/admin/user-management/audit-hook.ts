import type { Role as RoleName } from '@sys112/shared-types';
import { ROLE_LABEL, type Account } from '../../auth/accounts';
import {
  createAuditEntry,
  type AuditEntry,
  type AuditEventType,
  type AuditSeverity,
} from '../data/admin';
import { appendAuditEntry } from '../data/system-persistence';

export type UserAuditKind = 'create' | 'block' | 'unblock' | 'role-change' | 'password-reset';

type AccountRef = Pick<Account, 'login' | 'role' | 'name'>;

export type UserAuditPayload = {
  action: string;
  target: string;
  eventType: AuditEventType;
  details: string;
  severity: AuditSeverity;
};

/**
 * Compatibility payload for the shared local audit journal.
 * Does not open a second database: persist via appendAuditEntry()
 * into the existing adminAudit store of sys112-local-auth.
 */
export function userAuditEvent(
  kind: UserAuditKind,
  account: AccountRef,
  extra?: { role?: RoleName },
): UserAuditPayload {
  const currentRole = ROLE_LABEL[account.role].toLowerCase();
  const nextRole = extra?.role ? ROLE_LABEL[extra.role].toLowerCase() : currentRole;
  if (kind === 'create') {
    return {
      action: 'Создана учётная запись',
      target: `${account.login} · ${currentRole}`,
      eventType: 'account_created',
      details: 'Локальная учётка учебного контура',
      severity: 'ok',
    };
  }
  if (kind === 'block') {
    return {
      action: 'Учётная запись заблокирована',
      target: `${account.login} · ${currentRole}`,
      eventType: 'account_blocked',
      details: 'Доступ к учебному комплексу приостановлен',
      severity: 'warn',
    };
  }
  if (kind === 'unblock') {
    return {
      action: 'Учётная запись разблокирована',
      target: `${account.login} · ${currentRole}`,
      eventType: 'account_unblocked',
      details: 'Доступ восстановлен',
      severity: 'ok',
    };
  }
  if (kind === 'password-reset') {
    return {
      action: 'Сброшен локальный пароль',
      target: `${account.login} · ${currentRole}`,
      eventType: 'password_reset',
      details: 'Новый пароль сохранён как хеш, открытый текст не хранится',
      severity: 'warn',
    };
  }
  return {
    action: 'Изменена роль учётной записи',
    target: `${account.login} · ${currentRole} → ${nextRole}`,
    eventType: 'role_changed',
    details: `Новая роль: ${nextRole}`,
    severity: extra?.role === 'ADMIN' ? 'warn' : 'ok',
  };
}

export function toAuditEntry(
  actor: { id: string; name: string; login: string },
  payload: UserAuditPayload,
): AuditEntry {
  return createAuditEntry({
    actor: actor.name,
    actorId: actor.id,
    actorLogin: actor.login,
    ...payload,
  });
}

/**
 * Optional write path for the Users agent. Does not replace AdminApp.log().
 * Uses putInStore on adminAudit so a parallel write cannot wipe the journal.
 */
export async function recordUserAudit(
  actor: { id: string; name: string; login: string },
  kind: UserAuditKind,
  account: AccountRef,
  extra?: { role?: RoleName },
): Promise<AuditEntry> {
  const entry = toAuditEntry(actor, userAuditEvent(kind, account, extra));
  await appendAuditEntry(entry);
  return entry;
}

export async function recordAuthEvent(
  actor: { id: string; name: string; login: string },
  kind: 'login' | 'logout' | 'register',
  extra?: { role?: string },
): Promise<AuditEntry> {
  const role = extra?.role ? extra.role.toLowerCase() : '';
  const payload: UserAuditPayload =
    kind === 'register'
      ? {
          action: 'Создана учётная запись',
          target: `${actor.login}${role ? ` · ${role}` : ''}`,
          eventType: 'account_created',
          details: 'Саморегистрация в локальном учебном контуре',
          severity: 'ok',
        }
      : kind === 'logout'
        ? {
            action: 'Выход из контура',
            target: actor.login,
            eventType: 'logout',
            details: 'Сессия завершена',
            severity: 'info',
          }
        : {
            action: 'Вход в контур',
            target: actor.login,
            eventType: 'login',
            details: 'Сессия учебного контура',
            severity: 'info',
          };
  const entry = toAuditEntry(actor, payload);
  await appendAuditEntry(entry);
  return entry;
}
