import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import sidebarBase from '../../../../student-web/src/assets/catalog/catalog-sidebar-base.webp';
import { useTeacherDashboard } from '../application/hooks/use-teacher-dashboard';
import type { TeacherDashboardRepository } from '../application/ports/teacher-dashboard-repository';
import { MockTeacherDashboardRepository } from '../infrastructure/mock/mock-teacher-dashboard-repository';
import { TeacherSystemStatuses } from './components/teacher-analytics-panels';
import { ActivePage } from './pages/active-page';
import { ObservationPage } from './pages/observation-page';
import { OverviewPage } from './pages/overview-page';
import { ResultsPage } from './pages/results-page';
import { ScenariosPage } from './pages/scenarios-page';
import { bindTeacherDashboardTilt, playTeacherPress, useTeacherTilt } from './teacher-tilt';

type Section = 'overview' | 'active' | 'scenarios' | 'results';
type ConnectionStatus = 'ok' | 'bad' | 'pending';
interface Action {
  type: InterventionType;
  label: string;
  hint: string;
}

const navigation: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'overview', label: 'Обзор', icon: '⌂' },
  { id: 'active', label: 'Активные занятия', icon: '◉' },
  { id: 'scenarios', label: 'Сценарии и материалы', icon: '▤' },
  { id: 'results', label: 'Результаты и аналитика', icon: '↗' },
];

export function TeacherDashboard({
  apiStatus,
  realtimeStatus,
  examActions,
  legacyStatus,
  examPanel,
  accountBar,
  repository,
  pollMs,
  classActive,
  onToggleClass,
}: {
  apiStatus: ConnectionStatus;
  realtimeStatus: ConnectionStatus;
  examActions: Action[];
  legacyStatus: ReactNode;
  examPanel: ReactNode;
  accountBar?: ReactNode;
  repository?: TeacherDashboardRepository;
  pollMs?: number;
  storageLabel?: string;
  classActive?: boolean;
  onToggleClass?: (input?: { categories?: string[] }) => void;
}) {
  const resolvedRepository = useMemo(
    () => repository ?? new MockTeacherDashboardRepository(),
    [repository],
  );
  const { state, notice, retry, saveScenario, deleteScenario, importCatalog, toggleArchive, intervene, saveComment, adjustScore } =
    useTeacherDashboard(resolvedRepository, pollMs);
  const [section, setSection] = useState<Section>('overview');
  const [observedId, setObservedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [overlayNav, setOverlayNav] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const collapseTilt = useTeacherTilt<HTMLButtonElement>({ x: 3.8, y: 4.2 }, 'button');
  const collapsePress = useRef(0);

  useLayoutEffect(
    () => bindTeacherDashboardTilt(contentRef.current),
    [section, observedId],
  );
  useEffect(() => () => cancelAnimationFrame(collapsePress.current), []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setOverlayNav(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const navOpen = overlayNav ? menuOpen : !sidebarCollapsed;
  const toggleSidebar = () => {
    if (overlayNav) {
      setMenuOpen((value) => !value);
      return;
    }
    setSidebarCollapsed((value) => !value);
  };
  const observe = (id: string) => {
    setObservedId(id);
    setSection('active');
    setMenuOpen(false);
  };
  const navigate = (id: Section) => {
    setSection(id);
    setObservedId(null);
    setMenuOpen(false);
  };

  if (state.loading && !state.snapshot)
    return (
      <main className="td-loading" aria-live="polite">
        <div className="td-loader" />
        <h1>Загружаем преподавательскую панель</h1>
        <p>Подключаем занятия и результаты учеников…</p>
      </main>
    );
  if (state.error || !state.snapshot)
    return (
      <main className="td-loading">
        <h1>Не удалось загрузить панель</h1>
        <p>{state.error}</p>
        <button className="td-btn td-btn--primary" onClick={() => void retry()}>
          Повторить
        </button>
      </main>
    );
  const observed = state.sessions.find((item) => item.callId === observedId);

  return (
    <div className={`td-app ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <div className="td-sidebar-shell">
        <aside className={`td-sidebar ${menuOpen ? 'is-open' : ''}`}>
          <div className="td-brand">
            <span className="td-brand-mark">112</span>
            <div>
              <strong>SYS112</strong>
              <small>Учебный центр</small>
            </div>
            <button
              ref={collapseTilt.ref}
              type="button"
              className="td-collapse td-tilt td-tilt--button"
              onClick={() => {
                playTeacherPress(collapseTilt.ref.current, collapsePress);
                toggleSidebar();
              }}
              onPointerDown={(event) => {
                if (event.button === 0) {
                  playTeacherPress(collapseTilt.ref.current, collapsePress);
                }
              }}
              onPointerMove={collapseTilt.onPointerMove}
              onPointerLeave={collapseTilt.onPointerLeave}
              onPointerCancel={collapseTilt.onPointerLeave}
              aria-label={navOpen ? 'Свернуть навигацию' : 'Развернуть навигацию'}
              aria-expanded={navOpen}
            >
              <TeacherNavGlyph name={navOpen ? 'collapse' : 'expand'} />
            </button>
          </div>
          <nav aria-label="Разделы преподавательской панели">
            {navigation.map((item) => (
              <button
                key={item.id}
                className={section === item.id && !observedId ? 'is-active' : ''}
                onClick={() => navigate(item.id)}
              >
                <span className="td-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="td-nav-label">{item.label}</span>
                {item.id === 'active' && <b>{state.sessions.length}</b>}
              </button>
            ))}
          </nav>
          <div className="td-sidebar-foot">
            <span className="td-demo-label">SYS112</span>
            <p>Учебная панель преподавателя. Активные занятия появляются, когда ученик открывает билет.</p>
          </div>
          <div className="td-sidebar-art" aria-hidden="true">
            <img src={sidebarBase} alt="" />
          </div>
        </aside>
      </div>
      {menuOpen && (
        <button
          className="td-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="td-main">
        <header className="td-topbar">
          <button
            className="td-menu"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
          >
            ☰
          </button>
          <div className="td-topbar-title">
            <strong>Панель преподавателя</strong>
            <span>
              {new Intl.DateTimeFormat('ru-RU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date())}{' '}
              · {state.snapshot.teacher.shift}
            </span>
          </div>
          <div className="td-system-status" aria-label="Статусы систем">
            <span className={`td-status-dot is-${apiStatus}`}>
              API{' '}
              {apiStatus === 'ok' ? 'доступен' : apiStatus === 'pending' ? 'проверка' : 'нет связи'}
            </span>
            <span className={`td-status-dot is-${realtimeStatus}`}>
              Realtime{' '}
              {realtimeStatus === 'ok'
                ? 'подключён'
                : realtimeStatus === 'pending'
                  ? 'подключение'
                  : 'нет связи'}
            </span>
          </div>
          <div className="catalog-user">
            {accountBar ?? (
              <div className="td-profile">
                <span>Преподаватель</span>
                <strong>{state.snapshot.teacher.name}</strong>
              </div>
            )}
          </div>
        </header>
        <main ref={contentRef} className="td-content">
          {observed ? (
            <ObservationPage
              session={observed}
              examActions={examActions}
              onBack={() => setObservedId(null)}
              onIntervene={(type, note) => intervene(observed.callId, type, note)}
            />
          ) : section === 'overview' ? (
            <>
              <OverviewPage
                snapshot={state.snapshot}
                sessions={state.sessions}
                results={state.results}
                onObserve={observe}
                classActive={classActive}
                onToggleClass={onToggleClass}
              />
              <TeacherSystemStatuses>{legacyStatus}</TeacherSystemStatuses>
              {examPanel}
            </>
          ) : section === 'active' ? (
            <ActivePage
              sessions={state.sessions}
              groups={state.snapshot.groups}
              onObserve={observe}
            />
          ) : section === 'scenarios' ? (
            <ScenariosPage
              scenarios={state.scenarios}
              materials={state.materials}
              onSave={saveScenario}
              onDelete={deleteScenario}
              onImport={importCatalog}
            />
          ) : (
            <ResultsPage
              results={state.results}
              groups={state.snapshot.groups}
              snapshot={state.snapshot}
              audit={state.audit}
              systemStatus={legacyStatus}
              onSaveComment={saveComment}
              onAdjustScore={adjustScore}
            />
          )}
        </main>
      </div>
      {notice && (
        <div className="td-toast" role="status">
          ✓ {notice}
        </div>
      )}
    </div>
  );
}

function TeacherNavGlyph(props: { name: 'collapse' | 'expand' }) {
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
      ) : (
        <path
          d="M9.4 5.2 14.8 12l-5.4 6.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
