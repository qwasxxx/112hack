import { useEffect, useState } from 'react';
import type { Role } from '@sys112/shared-types';
import type { Account, Session } from '../auth/accounts';
import { AccountBar } from '../auth/account-bar';
import { DEMO_PASSWORD, ROLE_LABEL } from '../auth/accounts';
import {
  INITIAL_AUDIT,
  INITIAL_PROGRESS,
  INITIAL_SERVICES,
  INITIAL_SETTINGS,
  nextId,
  type AuditEntry,
  type ContourSettings,
  type ServiceRecord,
  type StudentProgress,
} from './data/admin';
import { ContourPage } from './pages/contour-page';
import { JournalPage } from './pages/journal-page';
import { OverviewPage } from './pages/overview-page';
import { TrainingPage } from './pages/training-page';
import { UsersPage } from './pages/users-page';

type Screen = 'overview' | 'users' | 'training' | 'contour' | 'journal';

const NAV: { id: Screen; label: string }[] = [
  { id: 'overview', label: 'Сводка' },
  { id: 'users', label: 'Пользователи' },
  { id: 'training', label: 'Обучение' },
  { id: 'contour', label: 'Контур' },
  { id: 'journal', label: 'Журнал' },
];

type Props = {
  operator: Session;
  accounts: Account[];
  onLogout: () => void;
  onCreateAccount: (input: { name: string; login: string; role: Role }) => Account;
  onToggleAccount: (userId: string) => void;
};

export function AdminApp(props: Props) {
  const [screen, setScreen] = useState<Screen>('overview');
  const [services, setServices] = useState(INITIAL_SERVICES);
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [audit, setAudit] = useState(INITIAL_AUDIT);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [apiStatus, setApiStatus] = useState<'ok' | 'bad' | 'pending'>('pending');

  useEffect(() => {
    void fetch('/api/v1/health')
      .then((response) => setApiStatus(response.ok ? 'ok' : 'bad'))
      .catch(() => setApiStatus('bad'));
  }, []);

  function log(action: string, target: string) {
    const entry: AuditEntry = {
      id: nextId('audit'),
      at: new Date().toISOString(),
      actor: props.operator.name,
      action,
      target,
    };
    setAudit((current) => [entry, ...current]);
  }

  function createUser(input: { name: string; login: string; role: Role }) {
    const user = props.onCreateAccount(input);
    if (input.role === 'STUDENT') {
      setProgress((current) => [
        {
          userId: user.id,
          lessonsDone: 0,
          lessonsTotal: 3,
          lastScore: 0,
          lastAt: user.createdAt,
          lessons: [
            { code: '112-01', title: 'Пожар в квартире', percent: 0 },
            { code: '112-02', title: 'ДТП на перекрёстке', percent: 0 },
            { code: '112-03', title: 'Потерявшийся ребёнок', percent: 0 },
          ],
        },
        ...current,
      ]);
    }
    log(
      'Создана учётная запись',
      `${input.login} · ${ROLE_LABEL[input.role].toLowerCase()} · пароль ${DEMO_PASSWORD}`,
    );
  }

  function toggleUser(userId: string) {
    const user = props.accounts.find((item) => item.id === userId);
    if (!user || user.id === props.operator.id) {
      return;
    }
    const blocked = user.status === 'active';
    props.onToggleAccount(userId);
    log(
      blocked ? 'Учётная запись заблокирована' : 'Учётная запись разблокирована',
      `${user.login} · ${ROLE_LABEL[user.role].toLowerCase()}`,
    );
  }

  function toggleService(id: ServiceRecord['id']) {
    const service = services.find((item) => item.id === id);
    if (!service) {
      return;
    }
    setServices((current) =>
      current.map((item) => (item.id === id ? { ...item, running: !item.running } : item)),
    );
    log(service.running ? 'Сервис остановлен' : 'Сервис запущен', service.title);
  }

  function saveSettings(next: ContourSettings) {
    setSettings(next);
  }

  function backup() {
    const at = new Date().toISOString();
    setSettings((current) => ({ ...current, lastBackupAt: at }));
    log('Резервная копия', 'ручной снимок БД');
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">112</span>
          <div>
            <p className="brand-title">Учебный комплекс</p>
            <p className="brand-sub">Локальный контур подготовки операторов</p>
          </div>
        </div>
        <AccountBar user={props.operator} onLogout={props.onLogout} />
      </header>

      <nav className="admin-nav" aria-label="Разделы">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={screen === item.id ? 'btn btn-primary' : 'btn'}
            onClick={() => setScreen(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {screen === 'overview' ? (
        <OverviewPage
          users={props.accounts}
          services={services}
          progress={progress}
          audit={audit}
          apiStatus={apiStatus}
        />
      ) : null}
      {screen === 'users' ? (
        <UsersPage
          users={props.accounts}
          operatorId={props.operator.id}
          onCreate={createUser}
          onToggle={toggleUser}
        />
      ) : null}
      {screen === 'training' ? <TrainingPage users={props.accounts} progress={progress} /> : null}
      {screen === 'contour' ? (
        <ContourPage
          services={services}
          settings={settings}
          onToggleService={toggleService}
          onSettings={saveSettings}
          onBackup={backup}
        />
      ) : null}
      {screen === 'journal' ? <JournalPage audit={audit} /> : null}
    </div>
  );
}
