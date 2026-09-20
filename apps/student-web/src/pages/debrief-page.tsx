import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TrainingScenario } from '../data/scenarios';
import type { Arm112PracticalResult } from '../features/arm112-simulator/model/training-result';
import {
  appendLesson,
  clearArmDraft,
  patchLesson,
  requestCallAiScore,
  scoreCard50,
  scoreTrainingLesson,
  printLessonCertificate,
  type FieldCheck,
  type LessonRecord,
  type TranscriptTurn,
} from '../progress';
import { cardView, ticketFactsFrom } from '../progress/ticket-facts';
import { StudentShell } from '../student-shell/student-shell';
import './sessions-page.css';
import './debrief-page.css';

export type TrainingFinish = {
  scenario: TrainingScenario;
  result: Arm112PracticalResult;
  transcript: TranscriptTurn[];
  durationSec: number;
  kind?: 'training' | 'exam';
  channel?: 'call' | 'sms';
};

type Props = {
  finish: TrainingFinish;
  operatorLogin: string;
  operatorName: string;
  accountBar: ReactNode;
  onCatalog: () => void;
  onSessions: () => void;
  onHandbook?: () => void;
  onBriefing: () => void;
};

const JUDGE_STEPS = [
  'Считываю эталон билета',
  'Сверяю адрес и ориентиры',
  'Проверяю ФИО и телефон',
  'Смотрю пострадавших и службы',
  'Разбираю стенограмму',
  'Оцениваю тон и темп вопросов',
];

export function DebriefPage(props: Props) {
  const finish = props.finish;
  const checks = useMemo(() => scoreCard50(finish.result, finish.scenario).checks, [finish]);
  const facts = useMemo(() => ticketFactsFrom(finish.scenario), [finish.scenario]);
  const base = useMemo(
    () =>
      scoreTrainingLesson({
        result: finish.result,
        scenario: finish.scenario,
        operatorLogin: props.operatorLogin,
        transcript: finish.transcript,
        mode: finish.kind,
        channel: finish.channel,
      }),
    [finish, props.operatorLogin],
  );
  const [record, setRecord] = useState<LessonRecord>(() => ({ ...base, id: 'pending' }));
  const [revealed, setRevealed] = useState(false);
  const [step, setStep] = useState(0);
  const savedId = useRef<string | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const saved = appendLesson(props.operatorLogin, base);
    savedId.current = saved.id;
    setRecord(saved);
    clearArmDraft(props.operatorLogin, finish.scenario.id);
  }, [base, finish.scenario.id, props.operatorLogin]);

  useEffect(() => {
    if (reduced) {
      return;
    }
    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % JUDGE_STEPS.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [reduced]);

  useEffect(() => {
    let cancelled = false;
    const sms = finish.channel === 'sms' || finish.transcript.length === 0;
    if (sms) {
      const wait = window.setTimeout(() => {
        if (!cancelled) {
          setRevealed(true);
        }
      }, reduced ? 0 : 700);
      return () => {
        cancelled = true;
        window.clearTimeout(wait);
      };
    }
    const transcript = finish.transcript
      .map((item) => `${item.role === 'operator' ? 'Оператор' : 'Заявитель'}: ${item.text}`)
      .join('\n');
    const etalon = [
      `${finish.scenario.code} ${finish.scenario.title}`,
      `Адрес: ${facts.address}`,
      `Суть: ${facts.what}`,
      facts.callerFio ? `ФИО: ${facts.callerFio}` : '',
      facts.phone ? `Телефон: ${facts.phone}` : '',
      `Пострадавшие: ${facts.injuredKnown ? (facts.hasInjured ? `есть ${facts.injuredCount ?? ''}`.trim() : 'нет') : 'неизвестно'}`,
    ]
      .filter(Boolean)
      .join('\n');
    const filled = cardView(finish.result.card);
    void Promise.all([
      requestCallAiScore({
        transcript,
        facts: etalon,
        card: JSON.stringify(filled, null, 2),
        rules: `карточка ${base.cardScore}/50, опрос ${base.interviewScore}/20, скорость ${base.speedScore}/15, вежливость ${base.politenessScore}/15`,
      }),
      new Promise((resolve) => window.setTimeout(resolve, reduced ? 0 : 1100)),
    ]).then(([ai]) => {
      if (cancelled) {
        return;
      }
      if (ai) {
        const next = scoreTrainingLesson({
          result: finish.result,
          scenario: finish.scenario,
          operatorLogin: props.operatorLogin,
          transcript: finish.transcript,
          mode: finish.kind,
          channel: finish.channel,
          ai,
        });
        const id = savedId.current;
        if (id) {
          const patched = patchLesson(props.operatorLogin, id, next);
          if (patched) {
            setRecord(patched);
          } else {
            setRecord((current) => ({ ...next, id: current.id }));
          }
        }
      }
      setRevealed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [base, facts, finish, props.operatorLogin, reduced]);

  return (
    <StudentShell
      accountBar={props.accountBar}
      onCatalog={props.onCatalog}
      onSessions={props.onSessions}
      onHandbook={props.onHandbook}
    >
      <div className={`debrief-body${revealed ? ' is-revealed' : ' is-judging'}`}>
        {!revealed ? (
          <JudgeScreen operatorName={props.operatorName} step={step} reduced={reduced} />
        ) : (
          <ResultScreen
            record={record}
            checks={checks}
            scenario={finish.scenario}
            operatorName={props.operatorName}
            reduced={reduced}
            kind={finish.kind ?? 'training'}
            channel={finish.channel ?? 'call'}
            onSessions={props.onSessions}
            onBriefing={props.onBriefing}
            onCatalog={props.onCatalog}
          />
        )}
      </div>
    </StudentShell>
  );
}

function JudgeScreen(props: { operatorName: string; step: number; reduced: boolean }) {
  return (
    <div className="debrief-judge" role="status" aria-live="polite">
      <div className="debrief-orb" aria-hidden="true">
        <i />
        <i />
        <i />
        <b>112</b>
      </div>
      <p className="sessions-kicker">Разбор занятия · {props.operatorName}</p>
      <h1>Сверяю с эталоном билета</h1>
      <p>Карточка сравнивается с реальными данными ситуации, стенограмма разбирается отдельно.</p>
      <ol className="debrief-steps">
        {JUDGE_STEPS.map((label, index) => (
          <li key={label} className={index === props.step || props.reduced ? 'is-on' : index < props.step ? 'is-done' : ''}>
            <span />
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ResultScreen(props: {
  record: LessonRecord;
  checks: FieldCheck[];
  scenario: TrainingScenario;
  operatorName: string;
  reduced: boolean;
  kind: 'training' | 'exam';
  channel: 'call' | 'sms';
  onSessions: () => void;
  onBriefing: () => void;
  onCatalog: () => void;
}) {
  const record = props.record;
  const sms = props.channel === 'sms';
  const rows = sms
    ? [
        { label: 'Карточка', value: record.cardScore ?? 0, max: 50, hint: 'Совпадение с эталоном билета' },
        { label: 'Обработка SMS', value: record.interviewScore ?? 0, max: 20, hint: 'Поля закрыты по тексту сообщения' },
        { label: 'Норматив набора', value: record.speedScore ?? 0, max: 15, hint: 'Таймер карточки 30 секунд' },
        { label: 'Аккуратность', value: record.politenessScore ?? 0, max: 15, hint: 'Формулировки без срыва регистра' },
      ]
    : [
        { label: 'Карточка', value: record.cardScore ?? 0, max: 50, hint: 'Совпадение с эталоном билета' },
        { label: 'Опрос на линии', value: record.interviewScore ?? 0, max: 20, hint: 'Где, что случилось, пострадавшие, телефон' },
        { label: 'Скорость ответа', value: record.speedScore ?? 0, max: 15, hint: 'Пауза до следующего вопроса' },
        { label: 'Вежливость', value: record.politenessScore ?? 0, max: 15, hint: 'Тон разговора' },
      ];
  const findings = record.findings.filter((item) => item.code !== 'ai-note');
  return (
    <>
      <header className="debrief-head">
        <p className="sessions-kicker">Разбор занятия · {props.operatorName}</p>
        <p>
          {props.scenario.code} · {props.scenario.title}
        </p>
      </header>

      <div className="debrief-hero">
        <ScoreRing value={record.score} max={100} passed={record.passed} play={!props.reduced} />
        <div>
          <p className={`debrief-verdict${record.passed ? ' is-pass' : ''}`}>{record.passed ? 'Зачёт' : 'Незачёт'}</p>
          <p className="debrief-hero-lead">
            {props.kind === 'exam' ? 'Экзамен, зачёт от 80. ' : ''}
            Результат уже в «Мои сессии». Карточка сверена с фактами билета
            {sms ? ', канал SMS.' : ', разговор — отдельно.'}
          </p>
        </div>
      </div>

      <ul className="debrief-bars">
        {rows.map((row, index) => (
          <ScoreRow key={row.label} {...row} delay={index * 280} play={!props.reduced} />
        ))}
      </ul>

      <section className="debrief-compare" aria-label="Сверка с билетом">
        <h2>Сверка карточки с билетом</h2>
        <ul>
          {props.checks.map((item, index) => (
            <li key={item.id} className={`is-${item.state}`} style={{ animationDelay: `${1200 + index * 90}ms` }}>
              <div>
                <strong>{item.label}</strong>
                <b>
                  {item.points}/{item.max}
                </b>
              </div>
              <p>
                <span>Эталон</span>
                {item.expected || '—'}
              </p>
              <p>
                <span>В карточке</span>
                {item.got.length > 140 ? `${item.got.slice(0, 140)}…` : item.got || '—'}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {record.comment ? <p className="debrief-comment">{record.comment}</p> : null}

      <div className="debrief-notes-grid">
        <section className="debrief-notes">
          <h2>Замечания</h2>
          {findings.length ? (
            <ul>
              {findings.map((item) => (
                <li key={`${item.code}-${item.field}`}>
                  <span>{item.field}</span>
                  {item.message}
                </li>
              ))}
            </ul>
          ) : (
            <p>Расхождений с эталоном нет.</p>
          )}
        </section>
        <section className="debrief-notes">
          <h2>Что улучшить</h2>
          {record.recommendations.length ? (
            <ul>
              {record.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Держите тот же разбор на следующем билете.</p>
          )}
        </section>
      </div>

      <div className="debrief-actions">
        <button type="button" className="debrief-primary" onClick={props.onSessions}>
          Мои сессии
        </button>
        {record.passed ? (
          <button type="button" onClick={() => printLessonCertificate(record, props.operatorName)}>
            Справка о зачёте
          </button>
        ) : null}
        <button type="button" onClick={props.onBriefing}>
          К уроку
        </button>
        <button type="button" onClick={props.onCatalog}>
          К списку
        </button>
      </div>
    </>
  );
}

function ScoreRow(props: { label: string; value: number; max: number; hint: string; delay: number; play: boolean }) {
  const shown = useCountUp(props.value, props.play, 900, props.delay);
  const pct = props.max <= 0 ? 0 : Math.max(0, Math.min(100, (props.value / props.max) * 100));
  return (
    <li style={{ animationDelay: `${props.delay}ms` }}>
      <div>
        <strong>
          {props.label} · {shown}/{props.max}
        </strong>
        <span>{props.hint}</span>
      </div>
      <div className="debrief-meter" aria-hidden="true">
        <i style={{ width: `${pct}%`, transitionDelay: `${props.delay + 80}ms` }} />
      </div>
    </li>
  );
}

function ScoreRing(props: { value: number; max: number; passed: boolean; play: boolean }) {
  const shown = useCountUp(props.value, props.play, 1400, 1100);
  const radius = 54;
  const c = 2 * Math.PI * radius;
  const pct = props.max <= 0 ? 0 : Math.max(0, Math.min(1, shown / props.max));
  return (
    <div className={`debrief-ring${props.passed ? ' is-pass' : ''}`} aria-label={`${shown} из ${props.max}`}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle className="debrief-ring-track" cx="64" cy="64" r={radius} />
        <circle
          className="debrief-ring-value"
          cx="64"
          cy="64"
          r={radius}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div>
        <b>{shown}</b>
        <span>из {props.max}</span>
      </div>
    </div>
  );
}

function useCountUp(target: number, play: boolean, duration: number, delay: number) {
  const [value, setValue] = useState(play ? 0 : target);
  useEffect(() => {
    if (!play) {
      setValue(target);
      return;
    }
    setValue(0);
    let raf = 0;
    const startAt = performance.now() + delay;
    const tick = (now: number) => {
      if (now < startAt) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startAt) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(target * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, play, duration, delay]);
  return value;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduced;
}
