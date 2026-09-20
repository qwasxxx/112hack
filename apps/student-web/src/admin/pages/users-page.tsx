import { useMemo, useState } from 'react';
import { Role, type Role as RoleName } from '@sys112/shared-types';
import {
  resolveAvatarUrl,
  validateManagedAccount,
  validatePasswordPair,
  type Account,
  type AccountStatus,
  type ManagedAccountInput,
} from '../../auth/accounts';
import { AdminFilterMenu, AdminSearchField } from '../components/admin-filter-menu';
import { formatWhen } from '../data/admin';
import { playAdminPress, useAdminTilt } from '../admin-tilt';
import {
  ROLE_LABEL,
  accountOrigin,
  canBlockAccount,
  canChangeRole,
  filterDirectory,
  fullName,
  isPrivilegedRole,
  originLabel,
  roleTone,
  type GuardResult,
} from '../user-management/user-directory';

type Props = {
  users: Account[];
  operatorId: string;
  onCreate: (input: ManagedAccountInput) => Account | Promise<Account>;
  onToggle: (userId: string) => boolean;
  onChangeRole: (userId: string, role: RoleName) => boolean;
  onResetPassword: (userId: string, password: string) => boolean | Promise<boolean>;
};

type PendingAction =
  | { kind: 'role'; user: Account; role: RoleName }
  | { kind: 'block'; user: Account }
  | { kind: 'unblock'; user: Account }
  | { kind: 'password'; user: Account };

const EMPTY_CREATE: ManagedAccountInput = {
  firstName: '',
  lastName: '',
  middleName: '',
  login: '',
  role: Role.STUDENT,
  password: '',
  passwordConfirm: '',
};

export function UsersPage(props: Props) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleName | 'all'>('all');
  const [status, setStatus] = useState<AccountStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [createInput, setCreateInput] = useState<ManagedAccountInput>(EMPTY_CREATE);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<PendingAction>();
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [dialogError, setDialogError] = useState<string>();
  const [openMenu, setOpenMenu] = useState<'role' | 'status' | 'createRole' | 'profileRole' | null>(null);
  const boardTilt = useAdminTilt<HTMLElement>({ x: 8.6, y: 10.8 }, 'strong');
  const profileTilt = useAdminTilt<HTMLElement>({ x: 6.4, y: 8.2 }, 'medium');

  const filtered = useMemo(
    () => filterDirectory(props.users, { search, role, status }),
    [props.users, search, role, status],
  );
  const selected = props.users.find((user) => user.id === selectedId) ?? filtered[0];
  const active = props.users.filter((user) => user.status === 'active').length;
  const blocked = props.users.length - active;
  const teachers = props.users.filter((user) => user.role === Role.TEACHER).length;
  const students = props.users.filter((user) => user.role === Role.STUDENT).length;

  function patchCreate(patch: Partial<ManagedAccountInput>) {
    setCreateInput((current) => ({ ...current, ...patch }));
  }

  async function submit() {
    const errors = validateManagedAccount(createInput, props.users);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      setError(firstError);
      return;
    }
    try {
      const created = await props.onCreate(createInput);
      setCreateInput(EMPTY_CREATE);
      setError(undefined);
      setSelectedId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать учётку.');
    }
  }

  function requestRole(user: Account, nextRole: RoleName) {
    if (nextRole === user.role) {
      return;
    }
    const guard = canChangeRole(props.users, user.id, nextRole, props.operatorId);
    if (!guard.ok) {
      setError(guard.message);
      return;
    }
    setError(undefined);
    setDialogError(undefined);
    setPending({ kind: 'role', user, role: nextRole });
  }

  function requestToggle(user: Account) {
    if (user.status === 'active') {
      const guard = canBlockAccount(props.users, user.id, props.operatorId);
      if (!guard.ok) {
        setError(guard.message);
        return;
      }
      setPending({ kind: 'block', user });
      return;
    }
    setPending({ kind: 'unblock', user });
  }

  function requestPassword(user: Account) {
    setResetPassword('');
    setResetPasswordConfirm('');
    setDialogError(undefined);
    setPending({ kind: 'password', user });
  }

  async function confirmPending() {
    if (!pending) {
      return;
    }
    if (pending.kind === 'password') {
      const errors = validatePasswordPair(resetPassword, resetPasswordConfirm);
      const firstError = Object.values(errors)[0];
      if (firstError) {
        setDialogError(firstError);
        return;
      }
      const ok = await props.onResetPassword(pending.user.id, resetPassword);
      if (!ok) {
        setDialogError('Не удалось сохранить пароль.');
        return;
      }
      setResetPassword('');
      setResetPasswordConfirm('');
    } else if (pending.kind === 'role') {
      if (!props.onChangeRole(pending.user.id, pending.role)) {
        setDialogError('Не удалось изменить роль.');
        return;
      }
    } else if (!props.onToggle(pending.user.id)) {
      setDialogError('Не удалось изменить статус.');
      return;
    }
    setSelectedId(pending.user.id);
    setDialogError(undefined);
    setPending(undefined);
  }

  return (
    <div className="ad-page ad-users-page">
      <header className="ad-page-head">
        <div>
          <p className="ad-kicker">Доступ и роли</p>
          <h1>Пользователи</h1>
          <p className="ad-lead">
            Все локальные учётки учебного комплекса. Саморегистрация сразу появляется здесь — это та же
            база, без дублирования.
          </p>
        </div>
        <div className="ad-health-flag is-ok">
          <span className="ad-health-pulse" aria-hidden="true" />
          <div>
            <strong>Единая локальная база</strong>
            <small>
              {props.users.length} учёток · {active} активны · {blocked} в блоке
            </small>
          </div>
        </div>
      </header>

      <section className="ad-surface ad-summary" aria-label="Сводка учёток">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Контур доступа</p>
            <h2>Состояние учётных записей</h2>
          </div>
          <span className="ad-help">Источник — локальная база auth, не отдельный каталог</span>
        </div>
        <div className="ad-metrics ad-users-metrics">
          <article className="ad-metric">
            <span>Всего</span>
            <strong>{props.users.length}</strong>
            <small>локальные учётки</small>
          </article>
          <article className="ad-metric">
            <span>Активные</span>
            <strong>{active}</strong>
            <small>могут войти</small>
          </article>
          <article className="ad-metric">
            <span>Обучающиеся</span>
            <strong>{students}</strong>
            <small>роль по умолчанию</small>
          </article>
          <article className="ad-metric">
            <span>Преподаватели</span>
            <strong>{teachers}</strong>
            <small>панель занятий</small>
          </article>
        </div>
      </section>

      <div className="ad-users-layout">
        <section
          ref={boardTilt.ref}
          className="ad-surface ad-users-board ad-tilt ad-tilt--strong"
          aria-label="Список пользователей"
          onPointerMove={boardTilt.onPointerMove}
          onPointerLeave={boardTilt.onPointerLeave}
        >
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Каталог</p>
              <h2>Учётные записи</h2>
            </div>
            <span className="ad-help">
              {filtered.length} из {props.users.length}
            </span>
          </div>

          <div className="ad-users-toolbar ad-audit-toolbar">
            <AdminSearchField
              label="Поиск"
              value={search}
              placeholder="Имя, фамилия, почта или логин"
              onChange={setSearch}
            />
            <AdminFilterMenu
              label="Роль"
              value={role}
              options={[
                { value: 'all', label: 'Все роли' },
                { value: Role.STUDENT, label: ROLE_LABEL.STUDENT },
                { value: Role.TEACHER, label: ROLE_LABEL.TEACHER },
                { value: Role.ADMIN, label: ROLE_LABEL.ADMIN },
              ]}
              open={openMenu === 'role'}
              onOpenChange={(next) => setOpenMenu(next ? 'role' : null)}
              onChange={(value) => setRole(value as RoleName | 'all')}
            />
            <AdminFilterMenu
              label="Статус"
              value={status}
              options={[
                { value: 'all', label: 'Все статусы' },
                { value: 'active', label: 'Активна' },
                { value: 'blocked', label: 'Блок' },
              ]}
              open={openMenu === 'status'}
              onOpenChange={(next) => setOpenMenu(next ? 'status' : null)}
              onChange={(value) => setStatus(value as AccountStatus | 'all')}
            />
          </div>

          <form
            className="ad-users-create"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="field">
              <span>Фамилия</span>
              <input
                value={createInput.lastName}
                onChange={(event) => patchCreate({ lastName: event.target.value })}
                autoComplete="family-name"
              />
            </label>
            <label className="field">
              <span>Имя</span>
              <input
                value={createInput.firstName}
                onChange={(event) => patchCreate({ firstName: event.target.value })}
                autoComplete="given-name"
              />
            </label>
            <label className="field">
              <span>Отчество</span>
              <input
                value={createInput.middleName}
                onChange={(event) => patchCreate({ middleName: event.target.value })}
                autoComplete="additional-name"
              />
            </label>
            <label className="field">
              <span>Почта или логин</span>
              <input
                value={createInput.login}
                onChange={(event) => patchCreate({ login: event.target.value })}
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                value={createInput.password}
                onChange={(event) => patchCreate({ password: event.target.value })}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>Повтор пароля</span>
              <input
                type="password"
                value={createInput.passwordConfirm}
                onChange={(event) => patchCreate({ passwordConfirm: event.target.value })}
                autoComplete="new-password"
              />
            </label>
            <AdminFilterMenu
              label="Роль"
              value={createInput.role}
              options={[
                { value: Role.STUDENT, label: ROLE_LABEL.STUDENT },
                { value: Role.TEACHER, label: ROLE_LABEL.TEACHER },
                { value: Role.ADMIN, label: ROLE_LABEL.ADMIN },
              ]}
              open={openMenu === 'createRole'}
              onOpenChange={(next) => setOpenMenu(next ? 'createRole' : null)}
              onChange={(value) => patchCreate({ role: value as RoleName })}
            />
            <button type="submit" className="btn btn-primary ad-action">
              Создать
            </button>
          </form>
          {error ? <p className="hint">{error}</p> : null}

          <div className="ad-users-cols" aria-hidden="true">
            <span />
            <span>Пользователь</span>
            <span>Роль</span>
            <span>Статус</span>
            <span>Создана</span>
            <span className="ad-users-cols-actions">Действия</span>
          </div>

          <div className="ad-users-list">
            {filtered.length === 0 ? (
              <p className="ad-users-empty">Нет учёток по выбранным фильтрам.</p>
            ) : (
              filtered.map((user) => {
                const self = user.id === props.operatorId;
                const selectedRow = user.id === selected?.id;
                const contact = user.email || user.login;
                return (
                  <article
                    key={user.id}
                    className={`ad-user-row${selectedRow ? ' is-selected' : ''}${user.status === 'blocked' ? ' is-blocked' : ''}`}
                    onClick={() => {
                      setSelectedId(user.id);
                      setOpenMenu((current) => (current === 'profileRole' ? null : current));
                    }}
                  >
                    <UserAvatar account={user} />
                    <div className="ad-user-identity">
                      <strong title={fullName(user)}>{user.name}</strong>
                      <span className="mono" title={contact}>
                        {contact}
                      </span>
                    </div>
                    <span className={`ad-role-badge is-${roleTone(user.role)}`}>{ROLE_LABEL[user.role]}</span>
                    <span className={`ad-pill is-${user.status === 'active' ? 'ok' : 'bad'}`}>
                      {user.status === 'active' ? 'Активна' : 'Блок'}
                    </span>
                    <small className="ad-user-when" title={user.createdAt}>
                      {formatWhen(user.createdAt)}
                    </small>
                    <div className="ad-user-actions">
                      <button
                        type="button"
                        className="btn ad-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(user.id);
                        }}
                      >
                        Профиль
                      </button>
                      <button
                        type="button"
                        className={`btn ad-action${user.status === 'active' ? ' btn-danger' : ''}`}
                        disabled={self}
                        title={self ? 'Нельзя заблокировать собственную учётку' : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          requestToggle(user);
                        }}
                      >
                        {user.status === 'active' ? 'Блок' : 'Снять блок'}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <div className="ad-user-profile-shell">
          <aside
            ref={profileTilt.ref}
            className="ad-surface ad-user-profile ad-tilt"
            aria-label="Карточка пользователя"
            onPointerMove={profileTilt.onPointerMove}
            onPointerLeave={profileTilt.onPointerLeave}
          >
            {selected ? (
              <UserDetail
                user={selected}
                operatorId={props.operatorId}
                users={props.users}
                onRole={requestRole}
                onToggle={requestToggle}
                onPassword={() => requestPassword(selected)}
                roleMenuOpen={openMenu === 'profileRole'}
                onRoleMenuOpenChange={(next) => setOpenMenu(next ? 'profileRole' : null)}
              />
            ) : (
              <div className="ad-user-empty">
                <p className="ad-kicker">Профиль</p>
                <h2>Выберите учётку</h2>
                <p>Карточка откроет фото, роль, статус и безопасные действия.</p>
              </div>
            )}
          </aside>
        </div>
      </div>

      {pending ? (
        <ConfirmDialog
          pending={pending}
          operatorId={props.operatorId}
          password={resetPassword}
          passwordConfirm={resetPasswordConfirm}
          error={dialogError}
          onPassword={setResetPassword}
          onPasswordConfirm={setResetPasswordConfirm}
          onCancel={() => {
            setPending(undefined);
            setDialogError(undefined);
            setResetPassword('');
            setResetPasswordConfirm('');
          }}
          onConfirm={() => void confirmPending()}
        />
      ) : null}
    </div>
  );
}

function UserDetail(props: {
  user: Account;
  operatorId: string;
  users: Account[];
  onRole: (user: Account, role: RoleName) => void;
  onToggle: (user: Account) => void;
  onPassword: () => void;
  roleMenuOpen: boolean;
  onRoleMenuOpenChange: (open: boolean) => void;
}) {
  const self = props.user.id === props.operatorId;
  const origin = accountOrigin(props.user);
  const roleGuard = canChangeRole(props.users, props.user.id, Role.TEACHER, props.operatorId);
  const blockGuard: GuardResult =
    props.user.status === 'active'
      ? canBlockAccount(props.users, props.user.id, props.operatorId)
      : { ok: true };
  const lastActivity = props.user.lastSeenAt ?? props.user.updatedAt;
  const roleLocked = !roleGuard.ok && props.user.role === Role.ADMIN;

  return (
    <>
      <div className="ad-surface-head">
        <div>
          <p className="ad-kicker">Профиль</p>
          <h2 title={props.user.name}>{props.user.name}</h2>
        </div>
        <span className={`ad-pill is-${props.user.status === 'active' ? 'ok' : 'bad'}`}>
          {props.user.status === 'active' ? 'Активна' : 'Блок'}
        </span>
      </div>

      <div className="ad-user-hero">
        <UserAvatar account={props.user} large />
        <div>
          <strong title={fullName(props.user)}>{fullName(props.user)}</strong>
          <span className="mono" title={props.user.email}>
            {props.user.email}
          </span>
          <small>{originLabel(origin)}</small>
        </div>
      </div>

      <dl className="ad-user-meta">
        <div>
          <dt>Фамилия</dt>
          <dd>{props.user.lastName}</dd>
        </div>
        <div>
          <dt>Имя</dt>
          <dd>{props.user.firstName}</dd>
        </div>
        {props.user.middleName ? (
          <div>
            <dt>Отчество</dt>
            <dd>{props.user.middleName}</dd>
          </div>
        ) : null}
        <div>
          <dt>Логин</dt>
          <dd className="mono" title={props.user.login}>
            {props.user.login}
          </dd>
        </div>
        <div>
          <dt>Идентификатор</dt>
          <dd className="mono" title={props.user.id}>
            {props.user.id}
          </dd>
        </div>
        <div>
          <dt>Создана</dt>
          <dd>{formatWhen(props.user.createdAt)}</dd>
        </div>
        <div>
          <dt>Обновлена</dt>
          <dd>{formatWhen(props.user.updatedAt)}</dd>
        </div>
        <div>
          <dt>Последняя активность</dt>
          <dd>{formatWhen(lastActivity)}</dd>
        </div>
        <div>
          <dt>Источник</dt>
          <dd>{originLabel(origin)}</dd>
        </div>
        <div>
          <dt>Аватар</dt>
          <dd>{props.user.avatar.kind === 'upload' ? 'Загруженное фото' : 'Системный аватар'}</dd>
        </div>
      </dl>

      <AdminFilterMenu
        label="Роль"
        value={props.user.role}
        disabled={roleLocked}
        title={
          !roleGuard.ok
            ? roleGuard.message
            : self
              ? 'Изменение собственной роли потребует повторного входа'
              : undefined
        }
        options={[
          { value: Role.STUDENT, label: ROLE_LABEL.STUDENT },
          { value: Role.TEACHER, label: ROLE_LABEL.TEACHER },
          { value: Role.ADMIN, label: ROLE_LABEL.ADMIN },
        ]}
        open={props.roleMenuOpen}
        onOpenChange={props.onRoleMenuOpenChange}
        onChange={(value) => props.onRole(props.user, value as RoleName)}
      />

      <div className="ad-user-detail-actions">
        <button
          type="button"
          className={`btn ad-action${props.user.status === 'active' ? ' btn-danger' : ' btn-primary'}`}
          disabled={self || !blockGuard.ok}
          title={self ? 'Нельзя заблокировать собственную учётку' : blockGuard.ok ? undefined : blockGuard.message}
          onClick={() => props.onToggle(props.user)}
        >
          {props.user.status === 'active' ? 'Заблокировать' : 'Разблокировать'}
        </button>
        <button type="button" className="btn ad-action" onClick={props.onPassword}>
          Сбросить пароль
        </button>
      </div>
    </>
  );
}

function UserAvatar(props: { account: Account; large?: boolean }) {
  const url = resolveAvatarUrl(props.account.avatar);
  const initials = `${props.account.lastName?.[0] ?? ''}${props.account.firstName?.[0] ?? ''}`.toUpperCase();
  return (
    <span className={`ad-user-avatar${props.large ? ' is-large' : ''}`}>
      {url ? <img src={url} alt="" /> : <span>{initials || '?'}</span>}
    </span>
  );
}

function ConfirmDialog(props: {
  pending: PendingAction;
  operatorId: string;
  password: string;
  passwordConfirm: string;
  error?: string;
  onPassword: (value: string) => void;
  onPasswordConfirm: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const press = { current: 0 };
  const copy = dialogCopy(props.pending, props.operatorId);
  const passwordReset = props.pending.kind === 'password';
  return (
    <div className="ad-confirm-layer" role="presentation" onClick={props.onCancel}>
      <div
        className="ad-confirm ad-tilt ad-tilt--strong"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ad-user-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="ad-kicker">Подтверждение</p>
        <h2 id="ad-user-confirm-title">{copy.title}</h2>
        <p>{copy.body}</p>
        {passwordReset ? (
          <div className="ad-confirm-fields">
            <label className="field">
              <span>Новый пароль</span>
              <input
                type="password"
                value={props.password}
                onChange={(event) => props.onPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>Повтор пароля</span>
              <input
                type="password"
                value={props.passwordConfirm}
                onChange={(event) => props.onPasswordConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
        ) : null}
        {props.error ? <p className="hint">{props.error}</p> : null}
        <div className="ad-confirm-actions">
          <button type="button" className="btn ad-action" onClick={props.onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className={`btn ad-action${copy.danger ? ' btn-danger' : ' btn-primary'}`}
            onClick={(event) => {
              playAdminPress(event.currentTarget, press);
              props.onConfirm();
            }}
          >
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function dialogCopy(
  pending: PendingAction,
  operatorId: string,
): { title: string; body: string; confirm: string; danger: boolean } {
  if (pending.kind === 'role') {
    const self = pending.user.id === operatorId;
    return {
      title: self ? 'Изменить собственную роль?' : 'Изменить роль?',
      body: self
        ? `Это ваша текущая сессия. Назначить роль «${ROLE_LABEL[pending.role]}»? Если снять права администратора, панель закроется и потребуется повторный вход.`
        : `Назначить ${pending.user.name} роль «${ROLE_LABEL[pending.role]}». После выхода и повторного входа маршрутизация пойдёт по новой роли.`,
      confirm: 'Изменить роль',
      danger: self || pending.role === Role.ADMIN,
    };
  }
  if (pending.kind === 'password') {
    return {
      title: 'Задать новый пароль?',
      body: `Пароль для ${pending.user.name} будет сохранён как хеш. Открытый текст не хранится.`,
      confirm: 'Сохранить',
      danger: false,
    };
  }
  if (pending.kind === 'unblock') {
    return {
      title: 'Разблокировать учётку?',
      body: `${pending.user.name} снова сможет войти в учебный комплекс.`,
      confirm: 'Разблокировать',
      danger: false,
    };
  }
  const important = isPrivilegedRole(pending.user.role);
  return {
    title: important ? 'Заблокировать привилегированную учётку?' : 'Заблокировать учётку?',
    body: important
      ? `${pending.user.name} — ${ROLE_LABEL[pending.user.role].toLowerCase()}. После блока вход будет запрещён.`
      : `${pending.user.name} не сможет войти, пока учётку не разблокируют.`,
    confirm: 'Заблокировать',
    danger: true,
  };
}
