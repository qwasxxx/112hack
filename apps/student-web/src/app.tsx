import { useEffect, useState } from 'react';
import { Role } from '@sys112/shared-types';
import { AdminApp } from './admin/admin-app';
import {
  authenticate,
  createManagedAccount,
  hydrateSession,
  loadAccounts,
  readSession,
  registerAccount,
  saveAccounts,
  writeSession,
  type Account,
  type FieldErrors,
  type ManagedAccountInput,
  type RegistrationInput,
  type Session,
} from './auth/accounts';
import { recordCompletedTraining, scoreFromChecks, scoreFromFindings } from './admin/data/training-record';
import { recordAuthEvent } from './admin/user-management/audit-hook';
import {
  applyRoleChange,
  applyStatusChange,
  recordLastSeen,
  resetLocalPassword,
} from './admin/user-management/user-directory';
import type { Arm112PracticalResult } from './features/arm112-simulator/model/training-result';
import type { DdsCheckResult } from './features/dds-training/use-dds-session';
import { LoginPage } from './pages/login-page';
import { StudentApp } from './student-app';
import { TeacherApp } from './teacher/teacher-app';

export function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();

  useEffect(() => {
    let cancelled = false;
    void loadAccounts()
      .then((next) => {
        if (cancelled) {
          return;
        }
        const hydrated = hydrateSession(next, readSession());
        if (!hydrated) {
          writeSession(null);
        }
        setAccounts(next);
        setSession(hydrated);
        setReady(true);
        void import('./progress').then(({ hydrateFromApi }) => hydrateFromApi());
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(next: Account[]) {
    setAccounts(next);
    void saveAccounts(next);
  }

  async function login(loginValue: string, password: string) {
    try {
      const result = await authenticate(accounts, loginValue, password);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(undefined);
      setFieldErrors(undefined);
      persist(recordLastSeen(accounts, result.session.id));
      await recordAuthEvent(result.session, 'login', { role: result.session.role });
      setSession(result.session);
      writeSession(result.session);
    } catch {
      setError('Не удалось выполнить вход.');
    }
  }

  async function register(input: RegistrationInput): Promise<boolean> {
    try {
      const result = await registerAccount(accounts, input);
      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.errors);
        return false;
      }
      setError(undefined);
      setFieldErrors(undefined);
      setAccounts(result.accounts);
      void recordAuthEvent(
        { id: result.account.id, name: result.account.name, login: result.account.login },
        'register',
        { role: result.account.role },
      );
      return true;
    } catch {
      setError('Не удалось сохранить учётную запись.');
      return false;
    }
  }

  function logout() {
    const current = session;
    setSession(null);
    writeSession(null);
    if (current) {
      void recordAuthEvent(current, 'logout', { role: current.role });
    }
  }

  function recordArmTraining(result: Arm112PracticalResult) {
    if (!session) {
      return;
    }
    void recordCompletedTraining({
      userId: session.id,
      userName: session.name,
      userLogin: session.login,
      scenarioCode: result.scenarioCode,
      scenarioTitle: result.scenarioTitle,
      score: scoreFromFindings(result.validation.length),
    });
  }

  function recordDdsTraining(result: DdsCheckResult, scenario: { code: string; title: string }) {
    if (!session) {
      return;
    }
    void recordCompletedTraining({
      userId: session.id,
      userName: session.name,
      userLogin: session.login,
      scenarioCode: scenario.code,
      scenarioTitle: scenario.title,
      score: scoreFromChecks([
        result.servicesOk,
        result.injuredOk,
        result.phoneOk,
        result.transferredOk,
      ]),
    });
  }

  async function createAccount(input: ManagedAccountInput): Promise<Account> {
    const account = await createManagedAccount(accounts, input);
    persist([account, ...accounts]);
    return account;
  }

  function toggleAccount(userId: string): boolean {
    if (!session) {
      return false;
    }
    const current = accounts.find((item) => item.id === userId);
    if (!current) {
      return false;
    }
    const result = applyStatusChange(
      accounts,
      userId,
      current.status === 'active' ? 'blocked' : 'active',
      session.id,
    );
    if (!result.ok) {
      return false;
    }
    persist(result.accounts);
    return true;
  }

  function changeAccountRole(userId: string, role: Account['role']): boolean {
    if (!session) {
      return false;
    }
    const result = applyRoleChange(accounts, userId, role, session.id);
    if (!result.ok) {
      return false;
    }
    persist(result.accounts);
    if (userId === session.id && role !== Role.ADMIN) {
      logout();
    }
    return true;
  }

  async function resetAccountPassword(userId: string, password: string): Promise<boolean> {
    const result = await resetLocalPassword(accounts, userId, password);
    if (!result.ok) {
      return false;
    }
    persist(result.accounts);
    return true;
  }

  if (!ready) {
    return <div className="login-screen" aria-busy="true" />;
  }

  if (!session) {
    return (
      <LoginPage
        error={error}
        fieldErrors={fieldErrors}
        onSubmit={login}
        onRegister={register}
        onClearError={() => {
          setError(undefined);
          setFieldErrors(undefined);
        }}
      />
    );
  }

  if (session.role === Role.ADMIN) {
    return (
      <AdminApp
        operator={session}
        accounts={accounts}
        onLogout={logout}
        onCreateAccount={createAccount}
        onToggleAccount={toggleAccount}
        onChangeRole={changeAccountRole}
        onResetPassword={resetAccountPassword}
      />
    );
  }

  if (session.role === Role.TEACHER) {
    return <TeacherApp operator={session} onLogout={logout} />;
  }

  return (
    <StudentApp
      operator={session}
      onLogout={logout}
      onArmTrainingComplete={recordArmTraining}
      onDdsTrainingComplete={recordDdsTraining}
    />
  );
}
