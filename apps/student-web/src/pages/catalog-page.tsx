import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import './catalog-page.css';
import dispatchCenter from '../assets/catalog/catalog-dispatch-center.webp';
import heroPhone from '../assets/catalog/catalog-hero-phone.webp';
import heroPrep from '../assets/catalog/catalog-hero-prep.webp';
import heroSkills from '../assets/catalog/catalog-hero-skills.webp';
import sidebarBase from '../assets/catalog/catalog-sidebar-base.webp';
import { pictogramVisualFor } from '../data/scenario-visuals';
import { LEARNER_TRACK_LABEL, type LearnerTrack } from '../learner-track';
import {
  SCENARIOS,
  DIFFICULTY_LABEL,
  DIFFICULTY_ORDER,
  SERVICE_LABEL,
  type ServiceKind,
  type TrainingScenario,
} from '../data/scenarios';
import { HandbookBoard } from './handbook-page';
import { SessionsBoard } from './sessions-page';
import { DDS_LANES, readDdsLane, scenarioMatchesDdsLane, writeDdsLane, type DdsLaneId } from '../dds-lanes';
import { assignedScenarioIds } from '../progress';
import { readClassSession } from '../progress/class-session';

export type CatalogView = 'catalog' | 'sessions' | 'handbook';

type Props = {
  accountBar: ReactNode;
  track: LearnerTrack;
  view?: CatalogView;
  operatorLogin: string;
  operatorName: string;
  onTrack: (track: LearnerTrack) => void;
  onOpen: (scenario: TrainingScenario) => void;
  onTheory: () => void;
  onSessions: () => void;
  onHandbook: () => void;
  onCatalog: () => void;
};

type DifficultyFilter = 'all' | TrainingScenario['difficulty'];
type DurationFilter = 'all' | 'short' | 'long';
type ServiceFilter = 'all' | ServiceKind;

const SERVICE_FILTERS: ServiceFilter[] = [
  'all',
  ...Array.from(new Set(SCENARIOS.flatMap((scenario) => scenario.services))),
];

const DIFFICULTY_FILTERS: DifficultyFilter[] = ['all', ...DIFFICULTY_ORDER];

const HERO_POINTS: Record<
  LearnerTrack,
  Array<{ title: string; icon: 'phone' | 'people' | 'shield'; art: string }>
> = {
  operator112: [
    { title: 'Звонок заявителя', icon: 'phone', art: heroPhone },
    { title: 'Заполнение карточки', icon: 'people', art: heroSkills },
    { title: 'Оператор 112', icon: 'shield', art: heroPrep },
  ],
  dds: [
    { title: 'Готовая карточка', icon: 'phone', art: heroPhone },
    { title: 'Проверка ошибок', icon: 'people', art: heroSkills },
    { title: 'Направление служб', icon: 'shield', art: heroPrep },
  ],
};

export function CatalogPage(props: Props) {
  const [query, setQuery] = useState('');
  const [service, setService] = useState<ServiceFilter>('all');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const [duration, setDuration] = useState<DurationFilter>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lane, setLane] = useState<DdsLaneId>(() => readDdsLane());
  const [assignedIds, setAssignedIds] = useState(() => assignedScenarioIds(props.operatorLogin));
  const [classLive, setClassLive] = useState(() => readClassSession().active);
  const [scope, setScope] = useState<'assigned' | 'all'>(assignedIds.length || classLive ? 'assigned' : 'all');
  const view = props.view ?? 'catalog';

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAssignedIds(assignedScenarioIds(props.operatorLogin));
      const active = readClassSession().active;
      setClassLive(active);
      if (active) {
        setScope('assigned');
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [props.operatorLogin]);

  function resetWorkspace() {
    setQuery('');
    setService('all');
    setDifficulty('all');
    setDuration('all');
  }

  function changeLane(next: DdsLaneId) {
    setLane(next);
    writeDdsLane(next);
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SCENARIOS.filter((scenario) => {
      const haystack =
        `${scenario.code} ${scenario.title} ${scenario.summary} ${scenario.situation ?? ''} ${scenario.address ?? ''}`.toLowerCase();
      const matchesQuery = needle.length === 0 || haystack.includes(needle);
      const matchesService = service === 'all' || scenario.services.includes(service);
      const matchesDifficulty = difficulty === 'all' || scenario.difficulty === difficulty;
      const matchesDuration =
        duration === 'all' ||
        (duration === 'short' && scenario.durationMin <= 8) ||
        (duration === 'long' && scenario.durationMin >= 10);
      const matchesLane = props.track !== 'dds' || scenarioMatchesDdsLane(scenario, lane);
      const matchesAssigned = scope !== 'assigned' || assignedIds.includes(scenario.id);
      return matchesQuery && matchesService && matchesDifficulty && matchesDuration && matchesLane && matchesAssigned;
    });
  }, [assignedIds, difficulty, duration, lane, props.track, query, scope, service]);

  return (
    <div className={`catalog-screen${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <StudentSidebar
        collapsed={sidebarCollapsed}
        track={props.track}
        view={view}
        onTrack={props.onTrack}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onReset={resetWorkspace}
        onTheory={props.onTheory}
        onSessions={props.onSessions}
        onHandbook={props.onHandbook}
        onCatalog={props.onCatalog}
      />
      <div className="catalog-shell">
        <CatalogHeader accountBar={props.accountBar} />
        <div className={`catalog-body${view === 'catalog' ? '' : ' is-sessions'}`}>
          {view === 'sessions' ? (
            <section className="catalog-board" aria-labelledby="sessions-title">
              <SessionsBoard login={props.operatorLogin} name={props.operatorName} />
            </section>
          ) : view === 'handbook' ? (
            <section className="catalog-board" aria-labelledby="handbook-title">
              <HandbookBoard />
            </section>
          ) : (
            <>
          <CatalogHero track={props.track} />
          <ScenarioToolbar
            track={props.track}
            query={query}
            service={service}
            difficulty={difficulty}
            duration={duration}
            lane={lane}
            scope={scope}
            assignedCount={assignedIds.length}
            found={visible.length}
            onQuery={setQuery}
            onService={setService}
            onDifficulty={setDifficulty}
            onDuration={setDuration}
            onLane={changeLane}
            onScope={setScope}
            onRandom={() => {
              if (!visible.length) {
                return;
              }
              props.onOpen(visible[Math.floor(Math.random() * visible.length)]);
            }}
          />
          <section className="catalog-board" aria-labelledby="catalog-title">
            {classLive ? (
              <p className="catalog-assign">Идёт занятие преподавателя. Открывайте назначенные билеты.</p>
            ) : null}
            {assignedIds.length ? (
              <p className="catalog-assign">
                Преподаватель назначил {assignedIds.length} билетов.
                {scope === 'assigned' ? ' Показаны только они.' : ' Сейчас открыт весь каталог.'}
              </p>
            ) : null}
            <CatalogTheoryEntry onOpen={props.onTheory} />
            <ScenarioListShell>
              <div className="scenario-list-head">
                <span className="scenario-head-lead">
                  <span>Код</span>
                  <span>Сценарий</span>
                </span>
                <span>Службы</span>
                <span>Норматив</span>
                <span>Уровень</span>
                <span className="scenario-list-head-action">Действие</span>
              </div>
              <ul className="scenario-list">
                {visible.length === 0 ? (
                  <li className="scenario-empty">Нет сценариев по текущему запросу.</li>
                ) : (
                  visible.map((scenario) => (
                    <ScenarioRow
                      key={scenario.id}
                      scenario={scenario}
                      track={props.track}
                      onOpen={props.onOpen}
                    />
                  ))
                )}
              </ul>
            </ScenarioListShell>
          </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StudentSidebar(props: {
  collapsed: boolean;
  track: LearnerTrack;
  view: CatalogView;
  onTrack: (track: LearnerTrack) => void;
  onToggle: () => void;
  onReset: () => void;
  onTheory: () => void;
  onSessions: () => void;
  onHandbook: () => void;
  onCatalog: () => void;
}) {
  return (
    <aside className="catalog-sidebar" aria-label="Навигация обучающегося">
      <div className="catalog-sidebar-brand">
        <span className="catalog-mark">112</span>
        <div className="catalog-sidebar-identity">
          <p className="catalog-sidebar-product">Система-112</p>
        </div>
        <CatalogCollapseButton collapsed={props.collapsed} onToggle={props.onToggle} />
      </div>
      <nav className="catalog-nav">
        <CatalogNavItem
          label={LEARNER_TRACK_LABEL.operator112}
          icon="phone"
          active={props.view === 'catalog' && props.track === 'operator112'}
          onActivate={() => {
            props.onTrack('operator112');
            props.onReset();
            props.onCatalog();
          }}
        />
        <CatalogNavItem
          label={LEARNER_TRACK_LABEL.dds}
          icon="layers"
          active={props.view === 'catalog' && props.track === 'dds'}
          onActivate={() => {
            props.onTrack('dds');
            props.onReset();
            props.onCatalog();
          }}
        />
        <CatalogNavItem label="Теория АРМ-112" icon="book" active={false} onActivate={props.onTheory} />
        <CatalogNavItem
          label="Мои сессии"
          icon="clock"
          active={props.view === 'sessions'}
          onActivate={props.onSessions}
        />
        <CatalogNavItem
          label="Справочные материалы"
          icon="bars"
          active={props.view === 'handbook'}
          onActivate={props.onHandbook}
        />
      </nav>
      <div className="catalog-sidebar-art" aria-hidden="true">
        <img src={sidebarBase} alt="" />
      </div>
    </aside>
  );
}

function CatalogNavItem(props: {
  label: string;
  icon: 'book' | 'layers' | 'bars' | 'gear' | 'phone' | 'clock';
  active: boolean;
  onActivate?: () => void;
}) {
  const tilt = useCatalogTilt<HTMLButtonElement>({ x: 2.2, y: 2.4 }, 'button');

  return (
    <button
      ref={tilt.ref}
      type="button"
      className={`catalog-nav-item catalog-tilt${props.active ? ' is-active' : ''}`}
      title={props.label}
      aria-current={props.active ? 'page' : undefined}
      aria-disabled={props.onActivate ? undefined : true}
      onClick={() => {
        if (props.onActivate) {
          props.onActivate();
        }
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <CatalogGlyph name={props.icon} />
      <span>{props.label}</span>
    </button>
  );
}

function CatalogCollapseButton(props: { collapsed: boolean; onToggle: () => void }) {
  const tilt = useCatalogTilt<HTMLButtonElement>({ x: 3.8, y: 4.2 }, 'button');
  const pressFrame = useRef(0);

  useEffect(() => {
    return () => cancelAnimationFrame(pressFrame.current);
  }, []);

  return (
    <button
      ref={tilt.ref}
      type="button"
      className="catalog-collapse catalog-tilt"
      aria-label={props.collapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'}
      aria-expanded={!props.collapsed}
      onClick={() => {
        playCatalogPress(tilt.ref.current, pressFrame);
        props.onToggle();
      }}
      onPointerDown={(event) => {
        if (event.button === 0) {
          playCatalogPress(tilt.ref.current, pressFrame);
        }
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <CatalogGlyph name={props.collapsed ? 'expand' : 'collapse'} />
    </button>
  );
}

function CatalogHeader(props: { accountBar: ReactNode }) {
  return (
    <header className="catalog-header">
      <div className="catalog-brand-text">
        <p className="catalog-product">Учебный комплекс Системы-112</p>
      </div>
      <CatalogUserControls>{props.accountBar}</CatalogUserControls>
    </header>
  );
}

function CatalogUserControls(props: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const nodes = [...root.querySelectorAll<HTMLElement>('.operator > *')];
    const releases = nodes.map((node) =>
      bindElementTilt(node, { x: 3.2, y: 3.4 }, 'button', node.tagName === 'BUTTON'),
    );
    return () => {
      releases.forEach((release) => release());
    };
  }, []);

  return (
    <div ref={rootRef} className="catalog-user">
      {props.children}
    </div>
  );
}

function CatalogHero(props: { track: LearnerTrack }) {
  const groupTilt = useCatalogGroupTilt<HTMLDivElement>({ x: 5.2, y: 5.8 });

  return (
    <section className="catalog-hero" aria-labelledby="catalog-title">
      <div className="catalog-hero-media" aria-hidden="true">
        <img className="catalog-hero-visual" src={dispatchCenter} alt="" />
        <div className="catalog-hero-fade" />
      </div>
      <div className="catalog-hero-copy">
        <h1 id="catalog-title" className="catalog-title">
          {props.track === 'dds' ? 'Карточки для ДДС' : 'Учебные сценарии'}
        </h1>
        <div ref={groupTilt.ref} className="catalog-highlight-group">
          <ul className="catalog-highlights">
            {HERO_POINTS[props.track].map((item) => (
              <CatalogHighlight key={item.title} {...item} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function CatalogHighlight(props: {
  title: string;
  icon: 'phone' | 'people' | 'shield';
  art: string;
}) {
  return (
    <li className="catalog-highlight">
      <span className={`catalog-highlight-icon is-${props.icon}`}>
        <img src={props.art} alt="" />
      </span>
      <strong>{props.title}</strong>
    </li>
  );
}

function ScenarioToolbar(props: {
  track: LearnerTrack;
  query: string;
  service: ServiceFilter;
  difficulty: DifficultyFilter;
  duration: DurationFilter;
  lane: DdsLaneId;
  scope: 'assigned' | 'all';
  assignedCount: number;
  found: number;
  onQuery: (value: string) => void;
  onService: (value: ServiceFilter) => void;
  onDifficulty: (value: DifficultyFilter) => void;
  onDuration: (value: DurationFilter) => void;
  onLane: (value: DdsLaneId) => void;
  onScope: (value: 'assigned' | 'all') => void;
  onRandom: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <div className="catalog-toolbar">
      <label className="catalog-search" htmlFor="catalog-search">
        <CatalogGlyph name="search" />
        <input
          id="catalog-search"
          type="search"
          value={props.query}
          placeholder="Поиск по коду или ситуации..."
          autoComplete="off"
          onChange={(event) => props.onQuery(event.target.value)}
        />
      </label>
      {props.track === 'dds' ? (
        <CatalogMenu
          label="Лента ДДС"
          value={props.lane}
          open={openMenu === 'lane'}
          onOpenChange={(open) => setOpenMenu(open ? 'lane' : null)}
          onChange={(value) => props.onLane(value as DdsLaneId)}
          options={DDS_LANES.map((item) => ({ value: item.id, label: item.label }))}
          icon="people"
        />
      ) : (
        <CatalogMenu
          label="Службы"
          value={props.service}
          open={openMenu === 'service'}
          onOpenChange={(open) => setOpenMenu(open ? 'service' : null)}
          onChange={(value) => props.onService(value as ServiceFilter)}
          options={[
            { value: 'all', label: 'Все службы' },
            ...SERVICE_FILTERS.filter((item) => item !== 'all').map((item) => ({
              value: item,
              label: SERVICE_LABEL[item],
            })),
          ]}
          icon="people"
        />
      )}
      <CatalogMenu
        label="Назначение"
        value={props.scope}
        open={openMenu === 'scope'}
        onOpenChange={(open) => setOpenMenu(open ? 'scope' : null)}
        onChange={(value) => props.onScope(value as 'assigned' | 'all')}
        options={[
          { value: 'assigned', label: `Назначенные (${props.assignedCount})` },
          { value: 'all', label: 'Все билеты' },
        ]}
        icon="people"
      />
      <CatalogMenu
        label="Уровень"
        value={props.difficulty}
        open={openMenu === 'difficulty'}
        onOpenChange={(open) => setOpenMenu(open ? 'difficulty' : null)}
        onChange={(value) => props.onDifficulty(value as DifficultyFilter)}
        options={[
          { value: 'all', label: 'Любой уровень' },
          ...DIFFICULTY_FILTERS.filter((item) => item !== 'all').map((item) => ({
            value: item,
            label: DIFFICULTY_LABEL[item],
          })),
        ]}
        icon="bars"
      />
      <CatalogMenu
        label="Длительность"
        value={props.duration}
        open={openMenu === 'duration'}
        onOpenChange={(open) => setOpenMenu(open ? 'duration' : null)}
        onChange={(value) => props.onDuration(value as DurationFilter)}
        options={[
          { value: 'all', label: 'Любая длительность' },
          { value: 'short', label: 'До 8 мин' },
          { value: 'long', label: 'От 10 мин' },
        ]}
        icon="clock"
      />
      <p className="catalog-found">
        Найдено сценариев: <strong>{props.found}</strong>
      </p>
      <button type="button" className="catalog-random" onClick={props.onRandom} disabled={props.found === 0}>
        Случайная карточка
      </button>
    </div>
  );
}

function CatalogMenu(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  icon: 'people' | 'bars' | 'clock';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pressFrame = useRef(0);
  const selected =
    props.options.find((option) => option.value === props.value)?.label ?? props.label;
  const selectedIndex = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.value),
  );

  useEffect(() => {
    return () => cancelAnimationFrame(pressFrame.current);
  }, []);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    const onOpenChange = props.onOpenChange;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [props.open, props.onOpenChange]);

  function move(delta: number) {
    const next = (selectedIndex + delta + props.options.length) % props.options.length;
    props.onChange(props.options[next].value);
  }

  function press() {
    playCatalogPress(buttonRef.current, pressFrame);
  }

  return (
    <div ref={rootRef} className={`catalog-menu${props.open ? ' is-open' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className="catalog-filter"
        aria-haspopup="listbox"
        aria-expanded={props.open}
        aria-label={props.label}
        onClick={() => props.onOpenChange(!props.open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            props.onOpenChange(true);
          }
          if (event.key === 'ArrowDown' && props.open) {
            move(1);
          }
          if (event.key === 'ArrowUp' && props.open) {
            move(-1);
          }
        }}
        onPointerDown={(event) => {
          if (event.button === 0) {
            press();
          }
        }}
      >
        <CatalogGlyph name={props.icon} />
        <span>{selected}</span>
      </button>
      {props.open ? (
        <div className="catalog-menu-panel" role="listbox" aria-label={props.label}>
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              className={`catalog-menu-option${option.value === props.value ? ' is-selected' : ''}`}
              aria-selected={option.value === props.value}
              onClick={() => {
                props.onChange(option.value);
                props.onOpenChange(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CatalogTheoryEntry(props: { onOpen: () => void }) {
  return (
    <button type="button" className="catalog-theory-entry" onClick={props.onOpen}>
      <span className="catalog-theory-icon" aria-hidden="true">
        <CatalogGlyph name="book" />
      </span>
      <span className="catalog-theory-copy">
        <strong>Теория АРМ-112</strong>
        <span>Как заполнять поля карточки происшествия.</span>
      </span>
      <span className="catalog-theory-go">
        Открыть
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.2 6h7.1M6.4 3.1 9.6 6 6.4 8.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}

function ScenarioListShell(props: { children: ReactNode }) {
  return <div className="scenario-list-shell">{props.children}</div>;
}

function ScenarioRow(props: {
  scenario: TrainingScenario;
  track: LearnerTrack;
  onOpen: (scenario: TrainingScenario) => void;
}) {
  const scenario = props.scenario;
  const description =
    props.track === 'dds'
      ? 'Очередь карточек на рабочее место ДДС. Свои исправляете и направляете, чужой профиль передаёте.'
      : scenario.summary;

  return (
    <li className="scenario-row">
      <div className="scenario-lead">
        <p className="scenario-code">{scenario.code}</p>
        <ScenarioPictogram scenario={scenario} />
        <div className="scenario-copy">
          <strong className="scenario-title">{scenario.title}</strong>
          <p className="scenario-desc">{description}</p>
        </div>
      </div>
      <div className="scenario-services">
        {props.track === 'dds' ? (
          <span className="scenario-service is-hidden">По карточке</span>
        ) : (
          scenario.services.map((item) => <ServiceTag key={item} kind={item} />)
        )}
        {props.track !== 'dds' && scenario.situationNo === 2 ? (
          <span className="scenario-service is-sms">SMS</span>
        ) : null}
      </div>
      <p className="scenario-time">
        <CatalogGlyph name="clock" />
        {scenario.durationMin} мин
      </p>
      <p className={`scenario-level ${difficultyClass(scenario.difficulty)}`}>
        <CatalogGlyph name="bars" />
        {DIFFICULTY_LABEL[scenario.difficulty]}
      </p>
      <div className="scenario-col-action">
        <CatalogOpenButton onOpen={() => props.onOpen(scenario)} />
      </div>
    </li>
  );
}

function ScenarioPictogram(props: { scenario: TrainingScenario }) {
  const pictogram = pictogramVisualFor(props.scenario);
  return (
    <span className={`scenario-pictogram is-${pictogram.kind}`} aria-hidden="true">
      <img src={pictogram.src} alt="" />
    </span>
  );
}

function ServiceTag(props: { kind: ServiceKind }) {
  return (
    <span className={`scenario-service is-${props.kind}`}>
      <ServiceMark kind={props.kind} />
      {SERVICE_LABEL[props.kind]}
    </span>
  );
}

function ServiceMark(props: { kind: ServiceKind }) {
  return (
    <svg
      className="scenario-service-mark"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {props.kind === 'fire' ? (
        <>
          <path
            fill="currentColor"
            d="M8.1 1.1c.35 2.05 2.55 3.15 2.55 5.45 0 1.05-.4 1.9-1.05 2.5.85-.15 1.55-1.05 1.85-2.15.7 1.25.85 2.7.85 3.55A4.3 4.3 0 1 1 5.05 6.3C6.1 5.05 7.15 3.5 8.1 1.1z"
          />
          <path
            fill="currentColor"
            opacity="0.42"
            d="M8 8.05c.85 0 1.45.7 1.45 1.7 0 1.2-.7 2.45-1.45 2.45S6.55 10.95 6.55 9.75c0-1 .6-1.7 1.45-1.7z"
          />
        </>
      ) : null}
      {props.kind === 'ambulance' ? (
        <>
          <circle cx="8" cy="8" r="6.05" fill="none" stroke="currentColor" strokeWidth="1.55" />
          <path
            fill="currentColor"
            d="M7.15 4.2h1.7v2.95h2.95v1.7H8.85v2.95h-1.7V8.85H4.2v-1.7h2.95z"
          />
        </>
      ) : null}
      {props.kind === 'police' ? (
        <>
          <path
            fill="currentColor"
            d="M8 1.35 13.15 3.2v3.45c0 3.05-2.2 5.45-5.15 6.7C5.05 12.1 2.85 9.7 2.85 6.65V3.2L8 1.35z"
          />
          <path
            fill="none"
            stroke="#fff"
            strokeOpacity="0.35"
            strokeWidth="1.1"
            d="M8 3.15 11.55 4.35v2.45c0 2.05-1.5 3.65-3.55 4.5-2.05-.85-3.55-2.45-3.55-4.5V4.35L8 3.15z"
          />
        </>
      ) : null}
      {props.kind === 'gas' ? (
        <path
          fill="currentColor"
          d="M8 1.4c2.15 2.25 3.45 3.9 3.45 5.85A3.45 3.45 0 1 1 4.55 7.25C4.55 5.3 5.85 3.65 8 1.4z"
        />
      ) : null}
    </svg>
  );
}

function CatalogOpenButton(props: { onOpen: () => void }) {
  const tilt = useCatalogTilt<HTMLButtonElement>({ x: 2.6, y: 2.8 }, 'button');
  const pressFrame = useRef(0);

  useEffect(() => {
    return () => cancelAnimationFrame(pressFrame.current);
  }, []);

  function press() {
    playCatalogPress(tilt.ref.current, pressFrame);
  }

  return (
    <button
      ref={tilt.ref}
      type="button"
      className="scenario-action catalog-tilt"
      onClick={() => {
        press();
        props.onOpen();
      }}
      onPointerDown={(event) => {
        if (event.button === 0) {
          press();
        }
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <span className="scenario-action-label">
        Открыть
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.2 6h7.1M6.4 3.1 9.6 6 6.4 8.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}

function difficultyClass(level: TrainingScenario['difficulty']) {
  if (level === 'базовый') {
    return 'is-basic';
  }
  if (level === 'сложный') {
    return 'is-hard';
  }
  return 'is-standard';
}

function CatalogGlyph(props: {
  name:
    | 'collapse'
    | 'expand'
    | 'book'
    | 'layers'
    | 'bars'
    | 'gear'
    | 'search'
    | 'people'
    | 'clock'
    | 'phone'
    | 'shield';
}) {
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
      {props.name === 'book' ? (
        <path
          d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      ) : null}
      {props.name === 'layers' ? (
        <path
          d="M4 8.5L12 4l8 4.5-8 4.5L4 8.5zm0 5.5l8 4.5 8-4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'bars' ? (
        <path
          d="M5 19V10m7 9V5m7 14v-7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'gear' ? (
        <path
          d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6zm7.2 3.1l1.7-1-1-1.8-2 .4a7 7 0 0 0-1.2-1.2l.4-2-1.8-1-1 1.7a7 7 0 0 0-1.6 0L11 4.7l-1.8 1 .4 2a7 7 0 0 0-1.2 1.2l-2-.4-1 1.8 1.7 1a7 7 0 0 0 0 1.6l-1.7 1 1 1.8 2-.4c.37.45.76.86 1.2 1.2l-.4 2 1.8 1 1-1.7a7 7 0 0 0 1.6 0l1 1.7 1.8-1-.4-2c.44-.34.83-.75 1.2-1.2l2 .4 1-1.8-1.7-1a7 7 0 0 0 0-1.6z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      ) : null}
      {props.name === 'search' ? (
        <path
          d="M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4zm5.3-1.9L21 21"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'people' ? (
        <path
          d="M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zm10.2-1.2a2.6 2.6 0 1 0-2.4-4.3M3.5 19.4c.7-3 2.8-4.6 5.5-4.6s4.8 1.6 5.5 4.6M16.8 13.8c2.1.2 3.8 1.5 4.4 3.8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'clock' ? (
        <path
          d="M12 20.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17zm0-8.5V8.2m0 3.8 3.4 2.2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'phone' ? (
        <path
          d="M8.2 3.8h2.3l1.2 3.1-1.5 1.1a12.5 12.5 0 0 0 5.3 5.3l1.1-1.5 3.1 1.2v2.3c0 .8-.5 1.7-2.2 1.9C9.8 18.4 5.6 14.2 4.3 6c.2-1.7 1.1-2.2 1.9-2.2z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'shield' ? (
        <path
          d="M12 3.5l7 2.4v6.3c0 4.1-2.8 7.3-7 8.8-4.2-1.5-7-4.7-7-8.8V5.9L12 3.5z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

type TiltKind = 'strong' | 'medium' | 'light' | 'button';

function applyTiltFrame(
  node: HTMLElement,
  current: { rx: number; ry: number; gx: number; gy: number; i: number },
  kind: TiltKind,
) {
  node.style.setProperty('--catalog-tilt-x', `${current.rx.toFixed(3)}deg`);
  node.style.setProperty('--catalog-tilt-y', `${current.ry.toFixed(3)}deg`);
  node.style.setProperty('--catalog-tilt-gx', `${current.gx.toFixed(1)}%`);
  node.style.setProperty('--catalog-tilt-gy', `${current.gy.toFixed(1)}%`);
  node.style.setProperty('--catalog-tilt-i', current.i.toFixed(3));
  const shadowGain = kind === 'button' ? 1.6 : kind === 'strong' ? 2.2 : kind === 'light' ? 1 : 1.6;
  node.style.setProperty('--catalog-tilt-sx', `${(-current.ry * shadowGain).toFixed(2)}px`);
  node.style.setProperty(
    '--catalog-tilt-sy',
    `${((kind === 'button' ? 6 : 8) + current.rx * 0.7).toFixed(2)}px`,
  );
}

function bindElementTilt(
  node: HTMLElement,
  rotation: { x: number; y: number },
  kind: TiltKind,
  pressable: boolean,
) {
  node.classList.add('catalog-tilt', 'catalog-control-tilt');
  let reduced = false;
  let hover = false;
  let frame = 0;
  const pressFrame = { current: 0 };
  const target = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
  const current = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');
  const sync = () => {
    reduced = motion.matches || coarse.matches;
    if (reduced) {
      target.rx = 0;
      target.ry = 0;
      target.i = 0;
    }
  };
  sync();
  motion.addEventListener('change', sync);
  coarse.addEventListener('change', sync);

  function animate() {
    const ease = 0.18;
    current.rx += (target.rx - current.rx) * ease;
    current.ry += (target.ry - current.ry) * ease;
    current.gx += (target.gx - current.gx) * ease;
    current.gy += (target.gy - current.gy) * ease;
    current.i += (target.i - current.i) * ease;
    applyTiltFrame(node, current, kind);
    const settled =
      Math.abs(current.rx - target.rx) < 0.012 &&
      Math.abs(current.ry - target.ry) < 0.012 &&
      Math.abs(current.i - target.i) < 0.012;
    if (!settled || hover) {
      frame = requestAnimationFrame(animate);
      return;
    }
    frame = 0;
  }

  function startLoop() {
    if (!frame) {
      frame = requestAnimationFrame(animate);
    }
  }

  function onMove(event: globalThis.PointerEvent) {
    if (event.pointerType !== 'mouse' || reduced) {
      return;
    }
    hover = true;
    const rect = node.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    target.rx = (0.5 - y) * rotation.x;
    target.ry = (x - 0.5) * rotation.y;
    target.gx = x * 100;
    target.gy = y * 100;
    target.i = 1;
    startLoop();
  }

  function onLeave() {
    hover = false;
    target.rx = 0;
    target.ry = 0;
    target.gx = 50;
    target.gy = 50;
    target.i = 0;
    startLoop();
  }

  function onDown(event: globalThis.PointerEvent) {
    if (pressable && event.button === 0) {
      playCatalogPress(node, pressFrame);
    }
  }

  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerleave', onLeave);
  node.addEventListener('pointercancel', onLeave);
  node.addEventListener('pointerdown', onDown);
  return () => {
    motion.removeEventListener('change', sync);
    coarse.removeEventListener('change', sync);
    node.removeEventListener('pointermove', onMove);
    node.removeEventListener('pointerleave', onLeave);
    node.removeEventListener('pointercancel', onLeave);
    node.removeEventListener('pointerdown', onDown);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(pressFrame.current);
    node.classList.remove('catalog-tilt', 'catalog-control-tilt');
  };
}

function bindHighlightGroupTilt(
  node: HTMLElement,
  rotation: { x: number; y: number },
  options: { idle?: boolean } = {},
) {
  const idleEnabled = options.idle !== false;
  let reduced = false;
  let phase: 'idle' | 'hover' | 'return' = idleEnabled ? 'idle' : 'return';
  let frame = 0;
  let idleOrigin = performance.now();
  const target = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
  const current = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');

  function idlePose(now: number) {
    const t = (now - idleOrigin) / 1000;
    return {
      rx: Math.sin((t * Math.PI * 2) / 14) * 0.32,
      ry: Math.sin((t * Math.PI * 2) / 11) * 0.95,
      gx: 50,
      gy: 50,
      i: 0,
    };
  }

  function sync() {
    reduced = motion.matches || coarse.matches;
    if (reduced) {
      phase = 'return';
      target.rx = 0;
      target.ry = 0;
      target.gx = 50;
      target.gy = 50;
      target.i = 0;
    }
  }

  function animate(now: number) {
    if (reduced) {
      current.rx = 0;
      current.ry = 0;
      current.gx = 50;
      current.gy = 50;
      current.i = 0;
      applyTiltFrame(node, current, 'medium');
      frame = 0;
      return;
    }
    if (phase === 'idle' && idleEnabled) {
      const pose = idlePose(now);
      target.rx = pose.rx;
      target.ry = pose.ry;
      target.gx = pose.gx;
      target.gy = pose.gy;
      target.i = pose.i;
    }
    const ease = phase === 'hover' ? 0.16 : 0.12;
    current.rx += (target.rx - current.rx) * ease;
    current.ry += (target.ry - current.ry) * ease;
    current.gx += (target.gx - current.gx) * ease;
    current.gy += (target.gy - current.gy) * ease;
    current.i += (target.i - current.i) * ease;
    applyTiltFrame(node, current, 'medium');
    const settled =
      Math.abs(current.rx - target.rx) < 0.012 &&
      Math.abs(current.ry - target.ry) < 0.012 &&
      Math.abs(current.i - target.i) < 0.012;
    if (phase === 'return' && settled) {
      if (idleEnabled) {
        phase = 'idle';
        idleOrigin = now;
      }
    }
    if ((phase === 'idle' && idleEnabled) || phase === 'hover' || !settled) {
      frame = requestAnimationFrame(animate);
      return;
    }
    frame = 0;
  }

  function startLoop() {
    if (!frame) {
      frame = requestAnimationFrame(animate);
    }
  }

  function onMove(event: globalThis.PointerEvent) {
    if (event.pointerType !== 'mouse' || reduced) {
      return;
    }
    phase = 'hover';
    const rect = node.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    target.rx = (0.5 - y) * rotation.x;
    target.ry = (x - 0.5) * rotation.y;
    target.gx = x * 100;
    target.gy = y * 100;
    target.i = 1;
    startLoop();
  }

  function onLeave() {
    if (reduced) {
      return;
    }
    phase = 'return';
    target.rx = 0;
    target.ry = 0;
    target.gx = 50;
    target.gy = 50;
    target.i = 0;
    startLoop();
  }

  sync();
  motion.addEventListener('change', sync);
  coarse.addEventListener('change', sync);
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerleave', onLeave);
  node.addEventListener('pointercancel', onLeave);
  if (!reduced && idleEnabled) {
    startLoop();
  }

  return () => {
    motion.removeEventListener('change', sync);
    coarse.removeEventListener('change', sync);
    node.removeEventListener('pointermove', onMove);
    node.removeEventListener('pointerleave', onLeave);
    node.removeEventListener('pointercancel', onLeave);
    cancelAnimationFrame(frame);
    current.rx = 0;
    current.ry = 0;
    current.gx = 50;
    current.gy = 50;
    current.i = 0;
    applyTiltFrame(node, current, 'medium');
  };
}

function useCatalogGroupTilt<T extends HTMLElement>(
  rotation: { x: number; y: number },
  options: { idle?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const idle = options.idle !== false;

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    return bindHighlightGroupTilt(node, rotation, { idle });
  }, [idle, rotation.x, rotation.y]);

  return { ref };
}

function useCatalogTilt<T extends HTMLElement>(
  rotation: { x: number; y: number },
  kind: TiltKind = 'medium',
) {
  const ref = useRef<T>(null);
  const reducedRef = useRef(false);
  const hoverRef = useRef(false);
  const frameRef = useRef(0);
  const targetRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 50, i: 0 });
  const currentRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 50, i: 0 });

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      reducedRef.current = motion.matches || coarse.matches;
      if (reducedRef.current) {
        targetRef.current = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
      }
    };
    sync();
    motion.addEventListener('change', sync);
    coarse.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
      coarse.removeEventListener('change', sync);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function animate() {
    const node = ref.current;
    if (!node) {
      return;
    }
    const target = targetRef.current;
    const current = currentRef.current;
    const ease = kind === 'button' ? 0.18 : 0.16;
    current.rx += (target.rx - current.rx) * ease;
    current.ry += (target.ry - current.ry) * ease;
    current.gx += (target.gx - current.gx) * ease;
    current.gy += (target.gy - current.gy) * ease;
    current.i += (target.i - current.i) * ease;
    applyTiltFrame(node, current, kind);
    const settled =
      Math.abs(current.rx - target.rx) < 0.012 &&
      Math.abs(current.ry - target.ry) < 0.012 &&
      Math.abs(current.i - target.i) < 0.012;
    if (!settled || hoverRef.current) {
      frameRef.current = requestAnimationFrame(animate);
      return;
    }
    frameRef.current = 0;
  }

  function startLoop() {
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(animate);
    }
  }

  function onPointerMove(event: PointerEvent<T>) {
    if (event.pointerType !== 'mouse' || reducedRef.current) {
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }
    hoverRef.current = true;
    const rect = node.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    targetRef.current = {
      rx: (0.5 - y) * rotation.x,
      ry: (x - 0.5) * rotation.y,
      gx: x * 100,
      gy: y * 100,
      i: 1,
    };
    startLoop();
  }

  function onPointerLeave() {
    hoverRef.current = false;
    targetRef.current = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
    startLoop();
  }

  return { ref, onPointerMove, onPointerLeave };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

let catalogLastPressAt = 0;

function playCatalogPress(element: HTMLElement | null, frameRef: { current: number }) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const now = performance.now();
  if (now - catalogLastPressAt < 80) {
    return;
  }
  catalogLastPressAt = now;
  const node = element;
  const start = performance.now();
  const duration = 128;
  cancelAnimationFrame(frameRef.current);
  function frame(now: number) {
    const t = Math.min(1, (now - start) / duration);
    let y = 0;
    let scale = 1;
    if (t < 0.22) {
      const p = t / 0.22;
      scale = 1 - 0.012 * p;
      y = 0.55 * p;
    } else if (t < 0.58) {
      const p = (t - 0.22) / 0.36;
      y = 0.5 - p * 0.7;
      scale = 0.988 + p * 0.014;
    } else {
      const p = (t - 0.58) / 0.42;
      scale = 1 + 0.004 * (1 - p);
      y = -0.18 * (1 - p);
    }
    node.style.setProperty('--catalog-press-y', `${y.toFixed(2)}px`);
    node.style.setProperty('--catalog-press-s', scale.toFixed(4));
    if (t < 1) {
      frameRef.current = requestAnimationFrame(frame);
      return;
    }
    node.style.setProperty('--catalog-press-y', '0px');
    node.style.setProperty('--catalog-press-s', '1');
    frameRef.current = 0;
  }
  frameRef.current = requestAnimationFrame(frame);
}
