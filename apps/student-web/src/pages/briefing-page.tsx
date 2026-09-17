import { useState, type ReactNode } from 'react';
import heroFire from '../assets/briefing/briefing-fire-apartment.webp';
import heroCrash from '../assets/briefing/briefing-traffic-accident.webp';
import heroChild from '../assets/briefing/briefing-missing-child.webp';
import iconDescription from '../assets/briefing/briefing-icon-description.png';
import iconGoals from '../assets/briefing/briefing-icon-goals.png';
import iconHints from '../assets/briefing/briefing-icon-hints.png';
import iconMaterials from '../assets/briefing/briefing-icon-materials.png';
import { LESSON_SECTIONS, type LessonSection, type TrainingScenario } from '../data/scenarios';
import { StudentShell } from '../student-shell/student-shell';
import { useStudentTilt } from '../student-shell/student-tilt';
import './briefing-page.css';

type Props = {
  scenario: TrainingScenario;
  accountBar: ReactNode;
  onBack: () => void;
  onStart: (section: LessonSection) => void;
  onStartDds: () => void;
};

type BriefingTab = 'description' | 'goals' | 'hints' | 'materials';

const DIFFICULTY_LABEL: Record<TrainingScenario['difficulty'], string> = {
  базовый: 'Базовый',
  стандарт: 'Стандарт',
  сложный: 'Сложный',
};

type LessonIcon = LessonSection | 'dds';

const HERO_BY_SCENARIO: Record<string, { src: string; position: string }> = {
  'apartment-fire': { src: heroFire, position: '84% 40%' },
  'road-accident': { src: heroCrash, position: '82% 48%' },
  'lost-child': { src: heroChild, position: '80% 46%' },
};

const GROUP_TILT = { x: 4.2, y: 4.8 } as const;

const TABS: Array<{ id: BriefingTab; label: string; icon: string }> = [
  { id: 'description', label: 'Описание', icon: iconDescription },
  { id: 'goals', label: 'Цели', icon: iconGoals },
  { id: 'hints', label: 'Подсказки', icon: iconHints },
  { id: 'materials', label: 'Материалы', icon: iconMaterials },
];

export function BriefingPage(props: Props) {
  const [tab, setTab] = useState<BriefingTab>('description');
  const scenario = props.scenario;
  const hero = HERO_BY_SCENARIO[scenario.id] ?? { src: heroFire, position: '78% 42%' };
  const hasGoals = scenario.checklist.length > 0;

  return (
    <StudentShell accountBar={props.accountBar} onCatalog={props.onBack}>
      <div className="briefing-body">
        <BriefingHero scenario={scenario} hero={hero} onBack={props.onBack} />
        <div className="briefing-workspace">
          <BriefingBrief
            scenario={scenario}
            tab={tab}
            hasGoals={hasGoals}
            onSelectTab={setTab}
          />
          <BriefingLessons onStart={props.onStart} onStartDds={props.onStartDds} />
        </div>
      </div>
    </StudentShell>
  );
}

function BriefingHero(props: {
  scenario: TrainingScenario;
  hero: { src: string; position: string };
  onBack: () => void;
}) {
  const scenario = props.scenario;

  return (
    <section className="briefing-hero" aria-labelledby="briefing-title">
      <img
        className="briefing-hero-visual"
        src={props.hero.src}
        alt=""
        style={{ objectPosition: props.hero.position }}
      />
      <div className="briefing-hero-fade" aria-hidden="true" />
      <div className="briefing-hero-copy">
        <BackControl onBack={props.onBack} />
        <div className="briefing-hero-text">
          <h1 id="briefing-title">{scenario.title}</h1>
          <p className="briefing-summary">{scenario.summary}</p>
          <p className="briefing-meta-line">
            <span>{scenario.code}</span>
            <span aria-hidden="true">·</span>
            <span>{scenario.durationMin} мин</span>
            <span aria-hidden="true">·</span>
            <span>{DIFFICULTY_LABEL[scenario.difficulty]}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function BackControl(props: { onBack: () => void }) {
  return (
    <button type="button" className="briefing-back" onClick={props.onBack}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M13 8H4.4M7.2 4.6 3.6 8l3.6 3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      К списку сценариев
    </button>
  );
}

function BriefingBrief(props: {
  scenario: TrainingScenario;
  tab: BriefingTab;
  hasGoals: boolean;
  onSelectTab: (tab: BriefingTab) => void;
}) {
  const tilt = useStudentTilt<HTMLElement>(GROUP_TILT, 'medium');

  return (
    <section
      ref={tilt.ref}
      className="briefing-main"
      aria-label="Брифинг сценария"
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <div className="briefing-tabs" role="tablist" aria-label="Разделы брифинга">
        {TABS.map((item) => (
          <BriefingTabButton
            key={item.id}
            tab={item}
            active={props.tab === item.id}
            onSelect={() => props.onSelectTab(item.id)}
          />
        ))}
      </div>
      <div className="briefing-panel" role="tabpanel">
        {props.tab === 'description' ? <DescriptionTab scenario={props.scenario} /> : null}
        {props.tab === 'goals' ? (
          props.hasGoals ? <GoalsTab items={props.scenario.checklist} /> : <EmptyTab />
        ) : null}
        {props.tab === 'hints' || props.tab === 'materials' ? <EmptyTab /> : null}
      </div>
    </section>
  );
}

function BriefingTabButton(props: {
  tab: { id: BriefingTab; label: string; icon: string };
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      className={`briefing-tab${props.active ? ' is-active' : ''}`}
      onClick={props.onSelect}
    >
      <img src={props.tab.icon} alt="" />
      {props.tab.label}
    </button>
  );
}

function DescriptionTab(props: { scenario: TrainingScenario }) {
  return (
    <div className="briefing-stack">
      <article className="briefing-block">
        <h3>
          <span className="briefing-block-icon is-situation">
            <img src={iconDescription} alt="" />
          </span>
          Ситуация
        </h3>
        <p>{props.scenario.summary}</p>
      </article>
      <article className="briefing-block is-prep">
        <h3>
          <span className="briefing-block-icon is-prep">i</span>
          Перед занятием
        </h3>
        <ol className="briefing-steps">
          {props.scenario.theory.map((item, index) => (
            <li key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item}
            </li>
          ))}
        </ol>
      </article>
      {props.scenario.checklist.length > 0 ? (
        <article className="briefing-block is-note">
          <h3>
            <span className="briefing-block-icon is-note">!</span>
            Важно
          </h3>
          <ul>
            {props.scenario.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </div>
  );
}

function GoalsTab(props: { items: string[] }) {
  return (
    <div className="briefing-stack">
      <article className="briefing-block">
        <h3>
          <span className="briefing-block-icon is-situation">
            <img src={iconGoals} alt="" />
          </span>
          Цели занятия
        </h3>
        <ol className="briefing-steps">
          {props.items.map((item, index) => (
            <li key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item}
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}

function EmptyTab() {
  return <p className="briefing-empty">Содержание раздела пока не подготовлено.</p>;
}

function BriefingLessons(props: { onStart: (section: LessonSection) => void; onStartDds: () => void }) {
  const tilt = useStudentTilt<HTMLElement>(GROUP_TILT, 'medium');

  return (
    <aside
      ref={tilt.ref}
      className="briefing-lessons"
      aria-labelledby="briefing-lessons-title"
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <h2 id="briefing-lessons-title">Разделы урока</h2>
      <div className="briefing-lesson-list">
        {LESSON_SECTIONS.map((section, index) => (
          <LessonCard
            key={section.id}
            icon={section.id}
            index={index + 1}
            title={section.title}
            youAre={section.youAre}
            enabled={section.enabled}
            onStart={() => props.onStart(section.id)}
          />
        ))}
        <LessonCard
          icon="dds"
          index={4}
          title="ДДС"
          youAre="Действия с карточкой"
          enabled={true}
          onStart={props.onStartDds}
        />
      </div>
    </aside>
  );
}

function LessonCard(props: {
  icon: LessonIcon;
  index: number;
  title: string;
  youAre: string;
  enabled: boolean;
  onStart: () => void;
}) {
  const label = `Начать: ${props.title}`;

  function start() {
    if (!props.enabled) {
      return;
    }
    props.onStart();
  }

  const body = (
    <>
      <div className="briefing-lesson-head">
        <span className="briefing-lesson-copy">
          <span className="briefing-lesson-kicker">
            <span className="briefing-lesson-index">{String(props.index).padStart(2, '0')}</span>
            <span className="briefing-lesson-role">{props.youAre}</span>
          </span>
          <span className="briefing-lesson-title">{props.title}</span>
        </span>
        <span className={`briefing-lesson-art is-${props.icon}`} aria-hidden="true">
          <LessonGlyph name={props.icon} />
        </span>
      </div>
      {props.enabled ? (
        <LessonAction label={label} />
      ) : (
        <span className="briefing-lesson-soon">Скоро</span>
      )}
    </>
  );

  if (!props.enabled) {
    return (
      <article
        className="briefing-lesson is-disabled"
        aria-disabled="true"
        aria-label={`${props.title}. ${props.youAre}. Скоро`}
      >
        {body}
      </article>
    );
  }

  return (
    <button
      type="button"
      className="briefing-lesson"
      aria-label={`${label}. ${props.youAre}`}
      onClick={start}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          start();
        }
      }}
    >
      {body}
    </button>
  );
}

function LessonGlyph(props: { name: LessonIcon }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {props.name === 'theory' ? (
        <path
          d="M4.8 19.2A2.2 2.2 0 0 1 7 17h12.4V3.6H7A2.2 2.2 0 0 0 4.8 5.8v13.4zM8.6 7.4h7.2M8.6 11h5.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'training' ? (
        <path
          d="M4.5 13a7.5 7.5 0 0 1 15 0M4.5 13v3.2A1.8 1.8 0 0 0 6.3 18H8v-5H6.3A1.8 1.8 0 0 0 4.5 14.8V13zm15 0v3.2a1.8 1.8 0 0 1-1.8 1.8H16v-5h1.7a1.8 1.8 0 0 1 1.8 1.8V13z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'exam' ? (
        <path
          d="M8 11V8a4 4 0 0 1 8 0v3M6.8 11h10.4v10H6.8z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'dds' ? (
        <path
          d="M7 4h7.2L19 8.8V20H7zM14.2 4v4.8H19M9.4 12.2h7M9.4 15.6h4.8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

function LessonAction(props: { label: string }) {
  return (
    <span className="briefing-start" aria-hidden="true">
      <span>
        {props.label}
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
    </span>
  );
}
