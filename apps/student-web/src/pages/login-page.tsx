import { useState } from 'react';
import { DEMO_PASSWORD, SEED_ACCOUNTS, ROLE_LABEL } from '../auth/accounts';

type Props = {
  error?: string;
  onSubmit: (login: string, password: string) => void;
};

export function LoginPage(props: Props) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="page login-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">112</span>
          <div>
            <p className="brand-title">Учебный комплекс</p>
            <p className="brand-sub">Система обеспечения вызова экстренных служб</p>
          </div>
        </div>
      </header>

      <section className="panel login-panel">
        <div className="panel-head">
          <h1>Вход</h1>
          <p>Учётка определяет роль: обучающийся, преподаватель или администратор.</p>
        </div>
        <form
          className="card-form"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit(login, password);
          }}
        >
          <label className="field">
            <span>Логин</span>
            <input
              autoComplete="username"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {props.error ? <p className="hint">{props.error}</p> : null}
          <button type="submit" className="btn btn-primary btn-block">
            Войти
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Учебные учётки</h2>
          <p>Пока без базы. Пароль у всех трёх — {DEMO_PASSWORD}.</p>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Логин</th>
              <th>Роль</th>
              <th>Кто</th>
            </tr>
          </thead>
          <tbody>
            {SEED_ACCOUNTS.map((account) => (
              <tr key={account.id}>
                <td className="mono">{account.login}</td>
                <td>{ROLE_LABEL[account.role]}</td>
                <td>{account.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
