import { useMemo, useState, type ReactNode } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import { useTeacherDashboard } from '../application/hooks/use-teacher-dashboard';
import { MockTeacherDashboardRepository } from '../infrastructure/mock/mock-teacher-dashboard-repository';
import { ActivePage } from './pages/active-page';
import { ObservationPage } from './pages/observation-page';
import { OverviewPage } from './pages/overview-page';
import { ResultsPage } from './pages/results-page';
import { ScenariosPage } from './pages/scenarios-page';

type Section = 'overview' | 'active' | 'scenarios' | 'results';
type ConnectionStatus = 'ok' | 'bad' | 'pending';
interface Action { type: InterventionType; label: string; hint: string }

const navigation: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'overview', label: 'Обзор', icon: '⌂' }, { id: 'active', label: 'Активные занятия', icon: '◉' },
  { id: 'scenarios', label: 'Сценарии и материалы', icon: '▤' }, { id: 'results', label: 'Результаты и аналитика', icon: '↗' },
];

export function TeacherDashboard({ apiStatus, realtimeStatus, examActions, legacyStatus, examPanel }: { apiStatus: ConnectionStatus; realtimeStatus: ConnectionStatus; examActions: Action[]; legacyStatus: ReactNode; examPanel: ReactNode }) {
  const repository = useMemo(() => new MockTeacherDashboardRepository(), []);
  const { state, notice, retry, saveScenario, toggleArchive, intervene, saveComment, adjustScore } = useTeacherDashboard(repository);
  const [section, setSection] = useState<Section>('overview'); const [observedId, setObservedId] = useState<string | null>(null); const [menuOpen, setMenuOpen] = useState(false);
  const observe = (id: string) => { setObservedId(id); setSection('active'); setMenuOpen(false); };
  const navigate = (id: Section) => { setSection(id); setObservedId(null); setMenuOpen(false); };

  if (state.loading && !state.snapshot) return <main className="td-loading" aria-live="polite"><div className="td-loader" /><h1>Загружаем преподавательскую панель</h1><p>Mock-репозиторий подготавливает демонстрационные данные…</p></main>;
  if (state.error || !state.snapshot) return <main className="td-loading"><h1>Не удалось загрузить панель</h1><p>{state.error}</p><button className="td-btn td-btn--primary" onClick={() => void retry()}>Повторить</button></main>;
  const observed = state.sessions.find((item) => item.callId === observedId);

  return <div className="td-app">
    <aside className={`td-sidebar ${menuOpen ? 'is-open' : ''}`}><div className="td-brand"><span className="td-brand-mark">112</span><div><strong>SYS112</strong><small>Учебный центр</small></div></div><nav aria-label="Разделы преподавательской панели">{navigation.map((item) => <button key={item.id} className={section === item.id && !observedId ? 'is-active' : ''} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}{item.id === 'active' && <b>{state.sessions.length}</b>}</button>)}</nav><div className="td-sidebar-foot"><span className="td-demo-label">DEMO · MOCK DATA</span><p>Данные сбросятся после перезагрузки страницы.</p></div></aside>
    {menuOpen && <button className="td-backdrop" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />}
    <div className="td-main"><header className="td-topbar"><button className="td-menu" onClick={() => setMenuOpen((value) => !value)} aria-label="Открыть меню">☰</button><div className="td-topbar-title"><strong>Панель преподавателя</strong><span>{new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} · {state.snapshot.teacher.shift}</span></div><div className="td-system-status" aria-label="Статусы систем"><span className={`td-status-dot is-${apiStatus}`}>API {apiStatus === 'ok' ? 'доступен' : apiStatus === 'pending' ? 'проверка' : 'нет связи'}</span><span className={`td-status-dot is-${realtimeStatus}`}>Realtime {realtimeStatus === 'ok' ? 'подключён' : realtimeStatus === 'pending' ? 'подключение' : 'нет связи'}</span></div><div className="td-profile"><span>Преподаватель</span><strong>{state.snapshot.teacher.name}</strong></div></header>
      <main className="td-content">
        {observed ? <ObservationPage session={observed} examActions={examActions} onBack={() => setObservedId(null)} onIntervene={(type, note) => intervene(observed.callId, type, note)} /> : section === 'overview' ? <><OverviewPage snapshot={state.snapshot} sessions={state.sessions} results={state.results} onObserve={observe} /><section className="td-panel td-legacy-status"><div><h3>Системные статусы</h3><span className="td-help">Исходные индикаторы teacher-приложения</span></div>{legacyStatus}</section>{examPanel}</> : section === 'active' ? <ActivePage sessions={state.sessions} groups={state.snapshot.groups} onObserve={observe} /> : section === 'scenarios' ? <ScenariosPage scenarios={state.scenarios} materials={state.materials} onSave={saveScenario} onToggleArchive={toggleArchive} /> : <ResultsPage results={state.results} groups={state.snapshot.groups} audit={state.audit} onSaveComment={saveComment} onAdjustScore={adjustScore} />}
      </main>
    </div>
    {notice && <div className="td-toast" role="status">✓ {notice}</div>}
  </div>;
}
