import { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICE_LABEL } from '../../data/scenarios';
import type { TrainingScenario } from '../../data/scenarios';
import { ddsLaneLabel, readDdsLane } from '../../dds-lanes';
import { appendLesson, scoreDdsLesson } from '../../progress';
import { DdsCard } from './dds-card';
import { DdsJournal } from './dds-journal';
import { useDdsSession, type DdsCheckResult } from './use-dds-session';
import './dds-training.css';

type Props = {
  scenario: TrainingScenario;
  operatorLogin: string;
  onLeave: () => void;
  onCompleted?: (result: DdsCheckResult) => void;
};

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = [
  'Января',
  'Февраля',
  'Марта',
  'Апреля',
  'Мая',
  'Июня',
  'Июля',
  'Августа',
  'Сентября',
  'Октября',
  'Ноября',
  'Декабря',
];

export function DdsTrainingPage(props: Props) {
  const session = useDdsSession(props.scenario);
  const lane = readDdsLane();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => new Date());
  const reported = useRef(false);
  const savedRef = useRef<string | null>(null);
  const lesson = useMemo(() => {
    if (!session.result) {
      return null;
    }
    const completedAt = new Date(Date.parse(session.startedAt) + session.result.elapsedMs).toISOString();
    return scoreDdsLesson({
      scenario: props.scenario,
      operatorLogin: props.operatorLogin,
      draft: session.draft,
      facts: session.facts,
      startedAt: session.startedAt,
      completedAt,
      elapsedMs: session.result.elapsedMs,
    });
  }, [props.operatorLogin, props.scenario, session.draft, session.facts, session.result, session.startedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session.result || reported.current) {
      return;
    }
    reported.current = true;
    props.onCompleted?.(session.result);
  }, [props.onCompleted, session.result]);

  useEffect(() => {
    if (!lesson) {
      return;
    }
    const key = `${lesson.completedAt}:${lesson.scenarioId}`;
    if (savedRef.current === key) {
      return;
    }
    savedRef.current = key;
    appendLesson(props.operatorLogin, lesson);
  }, [lesson, props.operatorLogin]);

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const weekday = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="dds-page">
      <header className="dds-bar">
        <div>
          <h1>ДДС · {ddsLaneLabel(lane)}</h1>
          <p>
            Поступила карточка оператора 112 · {props.scenario.code}
            {session.result ? ' · Бригада направлена' : ''}
          </p>
        </div>
        <div>
          {session.view === 'card' && !session.result ? (
            <button type="button" onClick={session.closeCard}>
              К списку
            </button>
          ) : null}
          <button type="button" onClick={props.onLeave}>
            К уроку
          </button>
        </div>
      </header>
      <div className="dds-shell">
        {session.view === 'journal' ? (
          <DdsJournal
            query={query}
            onQuery={setQuery}
            items={session.items}
            activeId={null}
            clock={clock}
            weekday={weekday}
            onOpen={() => session.openCard()}
          />
        ) : (
          <DdsCard
            card={session.card}
            draft={session.draft}
            onPatch={session.patch}
            onToggleService={session.toggleService}
            onDispatch={session.dispatchCard}
            onClose={session.closeCard}
          />
        )}
        {session.result && lesson ? (
          <section className="dds-result" aria-label="Результат проверки">
            <h2>
              {lesson.passed ? 'Зачёт' : 'Незачёт'} · {lesson.score}
            </h2>
            <p className="dds-brigade">Бригада направлена</p>
            <p>Результат записан в «Мои сессии». Удалить его нельзя.</p>
            <ul>
              <li>
                Службы:{' '}
                {session.result.servicesOk
                  ? 'совпали с происшествием'
                  : [
                      ...session.result.missing.map((item) => `не хватает: ${SERVICE_LABEL[item]}`),
                      ...session.result.extra.map((item) => `лишняя: ${SERVICE_LABEL[item]}`),
                    ].join('; ')}
              </li>
              <li>Пострадавшие: {session.result.injuredOk ? 'верно' : 'надо было исправить по тексту карточки'}</li>
              <li>Телефон: {session.result.phoneOk ? 'на месте' : 'в карточке не хватало номера'}</li>
              <li>
                Время: {lesson.elapsedSeconds} с / норматив {lesson.cardTimerLimitSec} с
              </li>
              {lesson.findings.map((item) => (
                <li key={`${item.code}-${item.field}`}>
                  {item.field}: {item.message}
                </li>
              ))}
            </ul>
            {lesson.recommendations[0] ? <p>{lesson.recommendations[0]}</p> : null}
            <p>
              <button type="button" onClick={props.onLeave}>
                К уроку
              </button>
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
