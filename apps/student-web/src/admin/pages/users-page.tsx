import { useState } from 'react';
import { Role, type Role as RoleName } from '@sys112/shared-types';
import type { AdminUser } from '../data/admin';
import { ROLE_LABEL, formatWhen } from '../data/admin';

type Props = {
  users: AdminUser[];
  operatorId: string;
  onCreate: (input: { name: string; login: string; role: RoleName }) => void;
  onToggle: (userId: string) => void;
};

export function UsersPage(props: Props) {
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<RoleName>(Role.STUDENT);
  const [error, setError] = useState<string>();

  function submit() {
    const nextName = name.trim();
    const nextLogin = login.trim().toLowerCase();
    if (!nextName || !nextLogin) {
      setError('Нужны фамилия и логин.');
      return;
    }
    if (props.users.some((user) => user.login === nextLogin)) {
      setError('Такой логин уже есть.');
      return;
    }
    props.onCreate({ name: nextName, login: nextLogin, role });
    setName('');
    setLogin('');
    setRole(Role.STUDENT);
    setError(undefined);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h1>Учётные записи</h1>
        <p>Создание, роли и блокировка. Новой учётке ставится пароль 112. Удаление без копии недоступно.</p>
      </div>

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>Фамилия, инициалы</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Логин</span>
          <input value={login} onChange={(event) => setLogin(event.target.value)} />
        </label>
        <label className="field">
          <span>Роль</span>
          <select value={role} onChange={(event) => setRole(event.target.value as RoleName)}>
            <option value={Role.STUDENT}>{ROLE_LABEL.STUDENT}</option>
            <option value={Role.TEACHER}>{ROLE_LABEL.TEACHER}</option>
            <option value={Role.ADMIN}>{ROLE_LABEL.ADMIN}</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary">
          Создать
        </button>
      </form>
      {error ? <p className="hint">{error}</p> : null}

      <table className="grid">
        <thead>
          <tr>
            <th>Пользователь</th>
            <th>Роль</th>
            <th>Статус</th>
            <th>Создана</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.users.map((user) => {
            const self = user.id === props.operatorId;
            return (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong>
                  <div className="row-sub mono">{user.login}</div>
                </td>
                <td>{ROLE_LABEL[user.role]}</td>
                <td>
                  <span className={`badge ${user.status === 'active' ? 'badge-ok' : 'badge-bad'}`}>
                    {user.status === 'active' ? 'Активна' : 'Блок'}
                  </span>
                </td>
                <td className="mono">{formatWhen(user.createdAt)}</td>
                <td className="col-action">
                  <button
                    type="button"
                    className={user.status === 'active' ? 'btn btn-danger' : 'btn'}
                    disabled={self}
                    onClick={() => props.onToggle(user.id)}
                  >
                    {user.status === 'active' ? 'Блокировать' : 'Разблокировать'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
