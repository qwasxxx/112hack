import { useEffect, useRef, useState } from 'react';
import type { Role } from '@sys112/shared-types';
import sidebarBase from '../assets/catalog/catalog-sidebar-base.webp';
import { AccountBar } from '../auth/account-bar';
import { type Account, type ManagedAccountInput, type Session } from '../auth/accounts';
import {
  INITIAL_AUDIT,
  INITIAL_BACKUPS,
  INITIAL_PROGRESS,
  INITIAL_SERVICES,
  INITIAL_SETTINGS,
  createAuditEntry,
  emptyStudentProgress,
  nextId,
  type AuditEntry,
  type AuditEventType,
  type AuditSeverity,
  type BackupRecord,
  type ContourSettings,
  type ServiceRecord,
} from './data/admin';
import {
  appendAuditEntry,
  loadAdminSystemState,
  persistBackup,
  persistService,
  persistSettings,
  persistTraining,
} from './data/system-persistence';
import { createRemoteBackup, pullBackupStatus, pullContourStatus } from './data/admin-remote';
import { bindAdminDashboardTilt, playAdminPress, useAdminTilt } from './admin-tilt';
import { ContourPage } from './pages/contour-page';
import { JournalPage } from './pages/journal-page';
import { OverviewPage } from './pages/overview-page';
import { TrainingPage } from './pages/training-page';
import { userAuditEvent } from './user-management/audit-hook';
import { UsersPage } from './pages/users-page';

type Screen = 'overview' | 'users' | 'training' | 'contour' | 'journal';
type ConnectionStatus = 'ok' | 'bad' | 'pending';

type AdminGlyphName = 'overview' | 'users' | 'training' | 'contour' | 'journal' | 'collapse' | 'expand' | 'menu';

const NAV: { id: Screen; label: string; icon: AdminGlyphName }[] = [
  { id: 'overview', label: 'Обзор', icon: 'overview' },
  { id: 'users', label: 'Пользователи', icon: 'users' },
  { id: 'training', label: 'Обучение', icon: 'training' },
  { id: 'contour', label: 'Контур', icon: 'contour' },
  { id: 'journal', label: 'Журнал', icon: 'journal' },
];

const PAGE_COPY: Record<Screen, { kicker: string }> = {
  overview: { kicker: 'Локальный центр управления' },
  users: { kicker: 'Доступ и роли' },
  training: { kicker: 'Использование комплекса' },
  contour: { kicker: 'Локальная инфраструктура' },
  journal: { kicker: 'Аудит действий' },
};

type Props = {
  operator: Session;
  accounts: Account[];
  onLogout: () => void;
  onCreateAccount: (input: ManagedAccountInput) => Account | Promise<Account>;
  onToggleAccount: (userId: string) => void | boolean;
  onChangeRole?: (userId: string, role: Role) => boolean;
  onResetPassword?: (userId: string, password: string) => boolean | Promise<boolean>;
};

export function AdminApp(props: Props) {
  const [screen, setScreen] = useState<Screen>('overview');
  const [services, setServices] = useState(INITIAL_SERVICES);
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [audit, setAudit] = useState(INITIAL_AUDIT);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [backups, setBackups] = useState(INITIAL_BACKUPS);
  const [auditLive, setAuditLive] = useState(false);
  const [backupsLive, setBackupsLive] = useState(false);
  const [progressLive, setProgressLive] = useState(false);
  const [apiStatus, setApiStatus] = useState<ConnectionStatus>('pending');
  const [realtimeStatus, setRealtimeStatus] = useState<ConnectionStatus>('pending');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [overlayNav, setOverlayNav] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<ServiceRecord['id']>>(new Set());
  const contentRef = useRef<HTMLElement>(null);
  const healthErrorRef = useRef<Record<string, boolean>>({});
  const busyRef = useRef<Set<ServiceRecord['id']>>(new Set());
  const collapseTilt = useAdminTilt<HTMLButtonElement>({ x: 4.4, y: 5.2 }, 'button');
  const collapsePress = useRef(0);

  useEffect(
    () => (screen === 'journal' ? () => {} : bindAdminDashboardTilt(contentRef.current)),
    [screen, services, settings, busyIds],
  );
  useEffect(() => () => cancelAnimationFrame(collapsePress.current), []);
  useEffect(() => {
    let cancelled = false;
    void loadAdminSystemState().then((state) => {
      if (cancelled) {
        return;
      }
      setServices(state.services);
      setProgress(state.progress);
      setProgressLive(state.progressLive);
      setSettings(state.settings);
      setBackups(state.backups);
      setAudit(state.audit);
      setAuditLive(state.auditLive);
      setBackupsLive(state.backupsLive);
    });
    return () => {
      cancelled = true;
    };
  }, [props.operator.id, props.operator.login, props.operator.name]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setOverlayNav(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    void fetch('/api/v1/health')
      .then((response) => setApiStatus(response.ok ? 'ok' : 'bad'))
      .catch(() => setApiStatus('bad'));

    let cancelled = false;
    const syncStatus = () => {
      void pullContourStatus().then((status) => {
        if (cancelled || !status) {
          return;
        }
        const at = status.at;
        setServices((current) =>
          current.map((service) => {
            const hit = status.services.find((item) => item.id === service.id);
            if (!hit) {
              return service;
            }
            return {
              ...service,
              running: service.id === 'sip' ? false : hit.running,
              lastChangeAt: at,
              startedAt: hit.running && service.id !== 'sip' ? service.startedAt || at : undefined,
            };
          }),
        );
      });
      void pullBackupStatus().then((status) => {
        if (cancelled || !status?.lastAt) {
          return;
        }
        setSettings((current) =>
          current.lastBackupAt === status.lastAt
            ? current
            : { ...current, lastBackupAt: status.lastAt as string, lastBackupStatus: 'ok' },
        );
      });
    };
    syncStatus();
    const timer = window.setInterval(syncStatus, 5000);

    let disconnect: (() => void) | undefined;
    void import('@sys112/api-client')
      .then(({ RealtimeClient }) => {
        if (cancelled) {
          return;
        }
        const realtime = new RealtimeClient(window.location.origin);
        realtime.connect();
        const off = realtime.onEvent((event) => {
          if (event.type === 'ConnectionEstablished') {
            setRealtimeStatus('ok');
          }
        });
        disconnect = () => {
          off();
          realtime.disconnect();
        };
      })
      .catch(() => {
        if (!cancelled) {
          setRealtimeStatus('bad');
        }
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      disconnect?.();
    };
  }, []);

  const navOpen = overlayNav ? menuOpen : !sidebarCollapsed;

  function toggleSidebar() {
    if (overlayNav) {
      setMenuOpen((value) => !value);
      return;
    }
    setSidebarCollapsed((value) => !value);
  }

  function navigate(id: Screen) {
    setScreen(id);
    setMenuOpen(false);
  }

  function log(
    action: string,
    target: string,
    eventType: AuditEventType,
    details: string,
    severity: AuditSeverity = 'info',
  ) {
    const entry = makeAuditEntry(props.operator, { action, target, eventType, details, severity });
    setAudit((current) => [entry, ...(auditLive ? current : [])]);
    setAuditLive(true);
    void appendAuditEntry(entry);
  }

  useEffect(() => {
    const api = services.find((item) => item.id === 'api');
    const realtime = services.find((item) => item.id === 'realtime');
    if (api?.running && apiStatus === 'bad' && !healthErrorRef.current.api) {
      healthErrorRef.current.api = true;
      log(
        'Ошибка сервиса',
        'API',
        'service_error',
        'Локальный учебный контур: нет ответа health-проверки',
        'error',
      );
    }
    if (apiStatus === 'ok') {
      healthErrorRef.current.api = false;
    }
    if (realtime?.running && realtimeStatus === 'bad' && !healthErrorRef.current.realtime) {
      healthErrorRef.current.realtime = true;
      log(
        'Ошибка сервиса',
        'Realtime',
        'service_error',
        'Локальный учебный контур: канал сессий недоступен',
        'error',
      );
    }
    if (realtimeStatus === 'ok') {
      healthErrorRef.current.realtime = false;
    }
  }, [apiStatus, realtimeStatus, services]);

  function handleLogout() {
    props.onLogout();
  }

  async function createUser(input: ManagedAccountInput) {
    const user = await props.onCreateAccount(input);
    if (input.role === 'STUDENT' && progressLive) {
      setProgress((current) => {
        const next = [emptyStudentProgress(user.id, user.createdAt), ...current];
        void persistTraining(next);
        return next;
      });
    }
    const copy = userAuditEvent('create', { login: user.login, role: user.role, name: user.name });
    log(
      copy.action,
      copy.target,
      copy.eventType,
      'Локальная учётка · пароль задан администратором, хеш не отображается',
      copy.severity,
    );
    return user;
  }

  function toggleUser(userId: string) {
    const user = props.accounts.find((item) => item.id === userId);
    if (!user || user.id === props.operator.id) {
      return false;
    }
    const blocked = user.status === 'active';
    const ok = props.onToggleAccount(userId);
    if (!ok) {
      return false;
    }
    const copy = userAuditEvent(blocked ? 'block' : 'unblock', user);
    log(copy.action, copy.target, copy.eventType, copy.details, copy.severity);
    return true;
  }

  function changeRole(userId: string, role: Role) {
    const user = props.accounts.find((item) => item.id === userId);
    if (!user || !props.onChangeRole) {
      return false;
    }
    const ok = props.onChangeRole(userId, role);
    if (!ok) {
      return false;
    }
    const copy = userAuditEvent('role-change', user, { role });
    log(copy.action, copy.target, copy.eventType, copy.details, copy.severity);
    return true;
  }

  async function resetPassword(userId: string, password: string) {
    const user = props.accounts.find((item) => item.id === userId);
    if (!user || !props.onResetPassword) {
      return false;
    }
    const ok = await props.onResetPassword(userId, password);
    if (!ok) {
      return false;
    }
    const copy = userAuditEvent('password-reset', user);
    log(copy.action, copy.target, copy.eventType, copy.details, copy.severity);
    return true;
  }

  function toggleService(id: ServiceRecord['id']) {
    if (id === 'sip') {
      log(
        'Сервис остановлен',
        'SIP / VoIP',
        'service_stopped',
        'SIP не входит в учебный контур',
        'warn',
      );
      return;
    }
    const service = services.find((item) => item.id === id);
    if (!service || busyRef.current.has(id)) {
      return;
    }
    busyRef.current.add(id);
    setBusyIds(new Set(busyRef.current));
    window.setTimeout(() => {
      const at = new Date().toISOString();
      const running = !service.running;
      const nextService: ServiceRecord = {
        ...service,
        running,
        lastChangeAt: at,
        startedAt: running ? at : undefined,
      };
      setServices((current) => current.map((item) => (item.id === id ? nextService : item)));
      void persistService(nextService);
      log(
        running ? 'Сервис запущен' : 'Сервис остановлен',
        service.title,
        running ? 'service_started' : 'service_stopped',
        running
          ? 'Локальный учебный контур: компонент включён'
          : 'Локальный учебный контур: компонент выключен',
        running ? 'ok' : 'warn',
      );
      busyRef.current.delete(id);
      setBusyIds(new Set(busyRef.current));
    }, 280);
  }

  function saveSettings(next: ContourSettings) {
    setSettings(next);
    void persistSettings(next);
  }

  function backup() {
    void createRemoteBackup().then((snapshot) => {
      const at = new Date().toISOString();
      const ok = Boolean(snapshot);
      if (snapshot) {
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = `sys112-backup-${at.slice(0, 19).replace(/[:T]/g, '-')}.json`;
        link.click();
        URL.revokeObjectURL(href);
      }
      const record: BackupRecord = {
        id: nextId('backup'),
        at,
        status: ok ? 'ok' : 'failed',
        kind: 'manual',
        note: ok ? 'снимок PostgreSQL: учётки, занятия, назначения' : 'нет связи с API',
        userCount: props.accounts.length,
        auditCount: audit.length,
      };
      const nextSettings: ContourSettings = { ...settings, lastBackupAt: at, lastBackupStatus: record.status };
      setBackups((current) => [record, ...(backupsLive ? current : [])]);
      setBackupsLive(true);
      setSettings(nextSettings);
      void persistBackup(record);
      void persistSettings(nextSettings);
      log(
        'Резервная копия',
        'снимок PostgreSQL',
        'backup_created',
        record.note,
        ok ? 'ok' : 'error',
      );
    });
  }

  const page = PAGE_COPY[screen];
  const hasNonSeedAccounts = props.accounts.some(
    (item) => item.source === 'self-register' || item.source === 'admin',
  );
  const trainingProgress = progressLive || !hasNonSeedAccounts ? progress : [];
  const trainingSource = progressLive || hasNonSeedAccounts ? 'live' : 'demo';

  return (
    <div className={`ad-app${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <div className="ad-sidebar-shell">
        <aside className={`ad-sidebar${menuOpen ? ' is-open' : ''}`}>
          <div className="ad-brand">
            <span className="ad-brand-mark">112</span>
            <div className="ad-brand-copy">
              <strong>SYS112</strong>
              <small>Система-112</small>
            </div>
            <button
              ref={collapseTilt.ref}
              type="button"
              className="ad-collapse ad-tilt ad-tilt--button"
              onClick={() => {
                playAdminPress(collapseTilt.ref.current, collapsePress);
                toggleSidebar();
              }}
              onPointerDown={(event) => {
                if (event.button === 0) {
                  playAdminPress(collapseTilt.ref.current, collapsePress);
                }
              }}
              onPointerMove={collapseTilt.onPointerMove}
              onPointerLeave={collapseTilt.onPointerLeave}
              onPointerCancel={collapseTilt.onPointerLeave}
              aria-label={navOpen ? 'Свернуть навигацию' : 'Развернуть навигацию'}
              aria-expanded={navOpen}
            >
              <AdminGlyph name={navOpen ? 'collapse' : 'expand'} />
            </button>
          </div>
          <nav aria-label="Разделы администратора">
            {NAV.map((item) => (
              <AdminNavButton
                key={item.id}
                active={screen === item.id}
                label={item.label}
                icon={item.icon}
                onClick={() => navigate(item.id)}
              />
            ))}
          </nav>
          <div className="ad-sidebar-foot">
            <span className="ad-local-chip">ЛОКАЛЬНЫЙ КОНТУР</span>
            <p>Учебный комплекс работает на этой машине. Облачные зависимости не используются.</p>
          </div>
          <div className="ad-sidebar-art" aria-hidden="true">
            <img src={sidebarBase} alt="" />
          </div>
        </aside>
      </div>

      {menuOpen ? (
        <button className="ad-backdrop" type="button" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />
      ) : null}

      <div className="ad-main">
        <header className="ad-topbar">
          <button
            type="button"
            className="ad-menu"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
          >
            <AdminGlyph name="menu" />
          </button>
          <div className="ad-topbar-title">
            <strong>Система-112 · Администратор</strong>
            <span>
              {page.kicker} ·{' '}
              {new Intl.DateTimeFormat('ru-RU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date())}
            </span>
          </div>
          <div className="ad-system-status" aria-label="Состояние локальной среды">
            <span className={`ad-status-dot is-${apiStatus}`}>
              API {statusLabel(apiStatus, 'доступен', 'проверка', 'нет связи')}
            </span>
            <span className={`ad-status-dot is-${realtimeStatus}`}>
              Realtime {statusLabel(realtimeStatus, 'подключён', 'подключение', 'нет связи')}
            </span>
            <span className="ad-status-dot is-ok">Локальная среда</span>
          </div>
          <div className="ad-user">
            <AccountBar user={props.operator} onLogout={handleLogout} />
          </div>
        </header>

        <main ref={contentRef} className="ad-content">
          {screen === 'overview' ? (
            <OverviewPage
              users={props.accounts}
              services={services}
              progress={trainingProgress}
              audit={audit}
              settings={settings}
              apiStatus={apiStatus}
              realtimeStatus={realtimeStatus}
            />
          ) : null}
          {screen === 'users' ? (
            <UsersPage
              users={props.accounts}
              operatorId={props.operator.id}
              onCreate={createUser}
              onToggle={toggleUser}
              onChangeRole={changeRole}
              onResetPassword={resetPassword}
            />
          ) : null}
          {screen === 'training' ? (
            <TrainingPage users={props.accounts} progress={trainingProgress} audit={audit} dataSource={trainingSource} />
          ) : null}
          {screen === 'contour' ? (
            <ContourPage
              services={services}
              settings={settings}
              backups={backups}
              auditCount={audit.length}
              lastAuditAt={audit[0]?.at}
              userCount={props.accounts.length}
              busyIds={busyIds}
              apiStatus={apiStatus}
              realtimeStatus={realtimeStatus}
              onToggleService={toggleService}
              onSettings={saveSettings}
              onBackup={backup}
            />
          ) : null}
          {screen === 'journal' ? <JournalPage audit={audit} /> : null}
        </main>
      </div>
    </div>
  );
}

function makeAuditEntry(
  actor: { id: string; name: string; login: string },
  draft: {
    action: string;
    target: string;
    eventType: AuditEventType;
    details: string;
    severity: AuditSeverity;
  },
): AuditEntry {
  return createAuditEntry({
    actor: actor.name,
    actorId: actor.id,
    actorLogin: actor.login,
    ...draft,
  });
}

function statusLabel(status: ConnectionStatus, ok: string, pending: string, bad: string) {
  if (status === 'ok') {
    return ok;
  }
  if (status === 'pending') {
    return pending;
  }
  return bad;
}

function AdminNavButton(props: {
  active: boolean;
  label: string;
  icon: AdminGlyphName;
  onClick: () => void;
}) {
  const tilt = useAdminTilt<HTMLButtonElement>({ x: 5.2, y: 6.1 }, 'button');
  const press = useRef(0);
  useEffect(() => () => cancelAnimationFrame(press.current), []);
  return (
    <button
      ref={tilt.ref}
      type="button"
      className={`ad-nav-item ad-tilt ad-tilt--button${props.active ? ' is-active' : ''}`}
      onClick={() => {
        playAdminPress(tilt.ref.current, press);
        props.onClick();
      }}
      onPointerDown={(event) => {
        if (event.button === 0) {
          playAdminPress(tilt.ref.current, press);
        }
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <span className="ad-nav-icon" aria-hidden="true">
        <AdminGlyph name={props.icon} />
      </span>
      <span className="ad-nav-label">{props.label}</span>
    </button>
  );
}

function AdminGlyph(props: { name: AdminGlyphName }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {props.name === 'collapse' ? (
        <path
          d="M14.6 5.2 9.2 12l5.4 6.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'expand' ? (
        <path
          d="M9.4 5.2 14.8 12l-5.4 6.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'menu' ? (
        <path
          d="M5 7h14M5 12h14M5 17h14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'overview' ? (
        <path
          d="M4.5 4.5h6.2v6.2H4.5V4.5zm8.8 0H19.5v9.2h-6.2V4.5zM4.5 13.3h6.2v6.2H4.5v-6.2zm8.8 3.4H19.5v2.8h-6.2v-2.8z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'users' ? (
        <path
          d="M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zm10.2-1.2a2.6 2.6 0 1 0-2.4-4.3M3.5 19.4c.7-3 2.8-4.6 5.5-4.6s4.8 1.6 5.5 4.6M16.8 13.8c2.1.2 3.8 1.5 4.4 3.8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'training' ? (
        <path
          d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      ) : null}
      {props.name === 'contour' ? (
        <path
          d="M4 8.5 12 4l8 4.5-8 4.5L4 8.5zm0 5.5 8 4.5 8-4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'journal' ? (
        <path
          d="M5 19V10m7 9V5m7 14v-7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
