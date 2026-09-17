import { useState } from 'react';
import { Role } from '@sys112/shared-types';
import { AdminApp } from './admin/admin-app';
import {
  DEMO_PASSWORD,
  authenticate,
  loadAccounts,
  readSession,
  saveAccounts,
  writeSession,
  type Account,
  type Session,
} from './auth/accounts';
import { LoginPage } from './pages/login-page';
import { StudentApp } from './student-app';
import { TeacherApp } from './teacher/teacher-app';

function nextAccountId(): string {
  return `user-${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [error, setError] = useState<string>();

  function persist(next: Account[]) {
    setAccounts(next);
    saveAccounts(next);
  }

  function login(login: string, password: string) {
    const result = authenticate(accounts, login, password);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(undefined);
    setSession(result.session);
    writeSession(result.session);
  }

  function logout() {
    setSession(null);
    writeSession(null);
  }

  function createAccount(input: { name: string; login: string; role: Account['role'] }): Account {
    const account: Account = {
      id: nextAccountId(),
      name: input.name,
      login: input.login,
      password: DEMO_PASSWORD,
      role: input.role,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    persist([account, ...accounts]);
    return account;
  }

  function toggleAccount(userId: string) {
    persist(
      accounts.map((item) =>
        item.id === userId
          ? { ...item, status: item.status === 'active' ? 'blocked' : 'active' }
          : item,
      ),
    );
  }

  if (!session) {
    return <LoginPage error={error} onSubmit={login} />;
  }

  if (session.role === Role.ADMIN) {
    return (
      <AdminApp
        operator={session}
        accounts={accounts}
        onLogout={logout}
        onCreateAccount={createAccount}
        onToggleAccount={toggleAccount}
      />
    );
  }

  if (session.role === Role.TEACHER) {
    return <TeacherApp operator={session} onLogout={logout} />;
  }

  return <StudentApp operator={session} onLogout={logout} />;
}
