import { useEffect, type ReactNode } from 'react';
import iconDescription from '../assets/briefing/briefing-icon-description.png';
import iconGoals from '../assets/briefing/briefing-icon-goals.png';
import { buildLessonSystemPrompt } from '../data/ags-tickets';
import { heroVisualFor } from '../data/scenario-visuals';
import {
  DIFFICULTY_LABEL,
  LESSON_SECTIONS,
  SERVICE_LABEL,
  type LessonSection,
  type TrainingScenario,
} from '../data/scenarios';
import { LEARNER_TRACK_LABEL, type LearnerTrack } from '../learner-track';
import { warmupLesson } from '../lib/llm-stream';
import { StudentShell } from '../student-shell/student-shell';
import { useStudentTilt } from '../student-shell/student-tilt';
import './briefing-page.css';

type Props = {
  scenario: TrainingScenario;
  track: LearnerTrack;
  accountBar: ReactNode;
  onBack: () => void;
  onSessions: () => void;
  onHandbook?: () => void;
  onStart: (section: LessonSection) => void;
  onStartDds: () => void;
};

type LessonIcon = LessonSection | 'dds';

const COLLECT = [
  'Где это происходит — адрес или понятный ориентир',
  'Что происходит прямо сейчас — если уже сказано в первой фразе, не переспрашивать',
  'Есть ли пострадавшие и угроза жизни',
  'Кто звонит и телефон для связи',
  'Какие службы направить',
];

const DDS_COLLECT = [
  'Подтвердить приём: статус «Принята», если зона ваша, или «Не принято», если чужой профиль',
  'Внизу карточки почистить службы 101–104: тёмный чип = привлечена. 101 пожар, 102 полиция, 103 скорая, 104 газ. Лишние снять, недостающие добавить. Проверка — разбор после смены: лишние и пропущенные службы.',
  'При необходимости перезвонить по трубке у АОН и уточнить адрес, пострадавших, телефон',
  'Наряд и статусы: начало реагирования → прибытие → работы → завершены, затем × в 112',
];

const GROUP_TILT = { x: 4.2, y: 4.8 } as const;

export function BriefingPage(props: Props) {
  const scenario = props.scenario;
  const hero = heroVisualFor(scenario);
  const isDds = props.track === 'dds';

  useEffect(() => {
    warmupLesson({
      conversationRole: 'victim',
      systemPrompt: isDds
        ? [
            buildLessonSystemPrompt(scenario, 'training'),
            'Это обратный звонок диспетчера ДДС. Ты заявитель, уже звонил в 112. Сейчас снимаешь трубку.',
          ].join('\n')
        : buildLessonSystemPrompt(scenario, 'training'),
      opening: isDds ? 'Алло.' : scenario.callerOpening,
    });
  }, [isDds, scenario]);

  return (
    <StudentShell
      accountBar={props.accountBar}
      onCatalog={props.onBack}
      onSessions={props.onSessions}
      onHandbook={props.onHandbook}
    >
      <div className="briefing-body">
        <BriefingHero scenario={scenario} track={props.track} hero={hero} onBack={props.onBack} />
        <div className="briefing-workspace">
          <BriefingBrief scenario={scenario} track={props.track} />
          <BriefingLessons
            scenario={scenario}
            track={props.track}
            onStart={props.onStart}
            onStartDds={props.onStartDds}
          />
        </div>
      </div>
    </StudentShell>
  );
}

function BriefingHero(props: {
  scenario: TrainingScenario;
  track: LearnerTrack;
  hero: { src: string; position: string };
  onBack: () => void;
}) {
  const scenario = props.scenario;
  const services = scenario.services.map((item) => SERVICE_LABEL[item]).join(', ');
  const summary =
    props.track === 'dds'
      ? 'Вам придёт очередь карточек на рабочее место выбранной ДДС. Принимаете карточку 112, при необходимости перезваниваете, направляете наряд и закрываете реагирование обратно в систему 112.'
      : scenario.summary;

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
          <p className="briefing-summary">{summary}</p>
          <p className="briefing-meta-line">
            <span>{LEARNER_TRACK_LABEL[props.track]}</span>
            <span aria-hidden="true">·</span>
            <span>{scenario.code}</span>
            {props.track === 'dds' ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span>{services}</span>
              </>
            )}
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

function BriefingBrief(props: { scenario: TrainingScenario; track: LearnerTrack }) {
  const tilt = useStudentTilt<HTMLElement>(GROUP_TILT, 'medium');
  const isDds = props.track === 'dds';
  const note = isDds
    ? 'Сначала подтвердите приём. Если данных мало — перезвоните. Свой профиль ведите статусами до «Работы завершены», чужой — «Не принято» или передайте.'
    : 'Снимите обязательные данные на линии и заполните карточку.';
  const steps = isDds ? DDS_COLLECT : COLLECT;

  return (
    <section
      ref={tilt.ref}
      className="briefing-main"
      aria-label="О занятии"
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <div className="briefing-panel">
        <div className="briefing-stack">
          <article className="briefing-block">
            <h3>
              <span className="briefing-block-icon is-situation">
                <img src={iconDescription} alt="" />
              </span>
              Задача
            </h3>
            <p>
              {isDds
                ? 'Вы — диспетчер ДДС. Оператор 112 уже заполнил карточку, но мог ошибиться. Подтвердите зону, уточните данные, направьте наряд и верните карточку в 112.'
                : 'Вы — оператор 112. Легенду билета выясняете на линии во время тренировки.'}
            </p>
          </article>
          <article className="briefing-block">
            <h3>
              <span className="briefing-block-icon is-situation">
                <img src={iconGoals} alt="" />
              </span>
              {isDds ? 'Что сделать с карточкой' : 'Что снять на линии'}
            </h3>
            <ol className="briefing-steps">
              {steps.map((item, index) => (
                <li key={item}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {item}
                </li>
              ))}
            </ol>
          </article>
          <article className="briefing-block is-note">
            <h3>
              <span className="briefing-block-icon is-note">!</span>
              Как работать
            </h3>
            <p>{note}</p>
          </article>
        </div>
      </div>
    </section>
  );
}

function BriefingLessons(props: {
  scenario: TrainingScenario;
  track: LearnerTrack;
  onStart: (section: LessonSection) => void;
  onStartDds: () => void;
}) {
  const tilt = useStudentTilt<HTMLElement>(GROUP_TILT, 'medium');
  const sms = props.scenario.situationNo === 2;
  const lessons =
    props.track === 'dds'
      ? [
          {
            icon: 'dds' as LessonIcon,
            title: 'Обработка карточки',
            youAre: 'Вы — диспетчер ДДС',
            lead: 'Готовая карточка от 112: найти ошибки и направить службы. Разговора нет.',
            enabled: true,
            onStart: props.onStartDds,
          },
        ]
      : LESSON_SECTIONS.map((section) => ({
          icon: section.id as LessonIcon,
          title: section.title,
          youAre: section.youAre,
          lead:
            section.id === 'training' && sms
              ? 'Ситуация придёт SMS: в тексте адрес, суть, ФИО и телефон. Голоса нет — всё берёте из сообщения.'
              : section.lead,
          enabled: section.enabled,
          onStart: () => props.onStart(section.id),
        }));

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
        {lessons.map((lesson, index) => (
          <LessonCard
            key={lesson.title}
            icon={lesson.icon}
            index={index + 1}
            title={lesson.title}
            youAre={lesson.youAre}
            lead={lesson.lead}
            enabled={lesson.enabled}
            onStart={lesson.onStart}
          />
        ))}
      </div>
    </aside>
  );
}

function LessonCard(props: {
  icon: LessonIcon;
  index: number;
  title: string;
  youAre: string;
  lead?: string;
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
          {props.lead ? <span className="briefing-lesson-lead">{props.lead}</span> : null}
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
