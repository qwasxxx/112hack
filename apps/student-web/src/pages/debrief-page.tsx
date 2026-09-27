import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { type TrainingScenario } from '../data/scenarios';
import type { Arm112PracticalResult } from '../features/arm112-simulator/model/training-result';
import type { DdsDefect, DdsDraft, TicketFacts as DdsTicketFacts } from '../features/dds-training/incoming-card';
import {
  appendLesson,
  clearArmDraft,
  patchLesson,
  printLessonCertificate,
  readableScoreText,
  requestCallAiScore,
  scoreCard50,
  scoreDdsCard,
  scoreDdsLesson,
  scoreTrainingLesson,
  PASS_SCORE,
  PASS_SCORE_EXAM,
  type FieldCheck,
  type LessonRecord,
  type TranscriptTurn,
} from '../progress';
import { cardView, phonesMatch, ticketFactsFrom } from '../progress/ticket-facts';
import { recordingUrl, uploadRecording } from '../progress/remote';
import {
  loadLocalRecording,
  saveLocalRecording,
} from '../../../teacher-web/src/teacher-dashboard/infrastructure/local-recording';
import { useTeacherReviews } from '../progress/use-teacher-review';
import { blobToBase64, blobToWav, concatWavs } from '../lib/capture-audio';
import type { LearnerTrack } from '../learner-track';
import { StudentShell } from '../student-shell/student-shell';
import './sessions-page.css';
import './debrief-page.css';

export type DdsFinishCard = {
  id: string;
  scenario: TrainingScenario;
  role: 'own' | 'foreign';
  sourceLabel: string;
  draft: DdsDraft;
  facts: DdsTicketFacts;
  decision: 'dispatch' | 'transfer';
  elapsedMs: number;
  defects: DdsDefect[];
  naryad?: string;
  workplaceStatus?: string;
  callback?: boolean;
  contacts?: { service: string; said: string }[];
  dialogue?: { speaker: string; role: 'operator' | 'caller'; text: string }[];
  history?: { status: string; naryad?: string; comment?: string }[];
  openMs?: number | null;
  firstRecordMs?: number | null;
  chiefCalled?: boolean;
  crewCalled?: boolean;
  reportedTo112?: boolean;
};

export type DdsFinish = {
  scenario: TrainingScenario;
  workplace: string;
  startedAt: string;
  cards: DdsFinishCard[];
  audio?: Promise<Blob | null>;
  callSeconds?: number;
  clips?: { title: string; audio: Promise<Blob | null>; seconds: number }[];
};

export type TrainingFinish = {
  scenario: TrainingScenario;
  result: Arm112PracticalResult;
  transcript: TranscriptTurn[];
  durationSec: number;
  kind?: 'training' | 'exam';
  channel?: 'call' | 'sms';
  audio?: Promise<Blob | null>;
};

type Props = {
  finish: TrainingFinish;
  operatorLogin: string;
  operatorName: string;
  accountBar: ReactNode;
  track: LearnerTrack;
  onLogout: () => void;
  onTrack: (track: LearnerTrack) => void;
  onTheory: () => void;
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

function TeacherNote(props: { text?: string }) {
  if (!props.text) {
    return null;
  }
  return (
    <p className="debrief-comment debrief-teacher-comment">
      <span>Комментарий преподавателя</span>
      {props.text}
    </p>
  );
}

function ReviewHero(props: {
  draft: number;
  official?: number;
  threshold: number;
  play: boolean;
  confirmedLead: string;
}) {
  const waiting = props.official == null;
  const score = props.official ?? props.draft;
  const passed = props.official != null && props.official >= props.threshold;
  return (
    <div className="debrief-hero">
      <ScoreRing value={score} max={100} passed={passed} play={props.play} />
      <div>
        <p className={`debrief-verdict${waiting ? ' is-wait' : passed ? ' is-pass' : ''}`}>
          {waiting ? 'Ждёт преподавателя' : passed ? 'Зачёт' : 'Незачёт'}
        </p>
        <p className="debrief-hero-lead">
          {waiting
            ? `Черновик ИИ — ${props.draft} из 100. Итог появится, когда преподаватель подтвердит разбор. Занятие остаётся у него в мониторинге.`
            : props.confirmedLead}
        </p>
      </div>
    </div>
  );
}

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
    const audio = finish.audio;
    if (!audio) {
      return;
    }
    void audio.then(async (blob) => {
      if (!blob?.size) {
        return;
      }
      const wav = blob.type.includes('wav') ? blob : await blobToWav(blob);
      await saveLocalRecording(saved.id, wav).catch(() => undefined);
      setRecord((current) => ({ ...current, id: saved.id }));
      const data = await blobToBase64(wav);
      const uploaded = await uploadRecording({
        lessonId: saved.id,
        login: props.operatorLogin,
        scenarioId: finish.scenario.id,
        mime: 'audio/wav',
        durationSec: finish.durationSec,
        data,
      });
      if (uploaded?.id) {
        patchLesson(props.operatorLogin, saved.id, { recordingId: uploaded.id });
        setRecord((current) => ({ ...current, id: saved.id, recordingId: uploaded.id }));
      }
    }).catch(() => undefined);
  }, [base, finish.audio, finish.durationSec, finish.scenario.id, props.operatorLogin]);

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
      track={props.track}
      onTrack={props.onTrack}
      onTheory={props.onTheory}
      onLogout={props.onLogout}
      onCatalog={props.onCatalog}
      onSessions={props.onSessions}
      onHandbook={props.onHandbook}
    >
      <div className={`debrief-body${revealed ? ' is-revealed' : ' is-judging'}`}>
        {!revealed ? (
          <>
            <LessonExitBar onSessions={props.onSessions} onBriefing={props.onBriefing} onCatalog={props.onCatalog} />
            <JudgeScreen operatorName={props.operatorName} step={step} reduced={reduced} />
          </>
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

function JudgeScreen(props: {
  operatorName: string;
  step: number;
  reduced: boolean;
  mark?: string;
  title?: string;
  lead?: string;
  steps?: string[];
}) {
  const steps = props.steps ?? JUDGE_STEPS;
  return (
    <div className="debrief-judge" role="status" aria-live="polite">
      <div className="debrief-orb" aria-hidden="true">
        <i />
        <i />
        <i />
        <b>{props.mark ?? '112'}</b>
      </div>
      <p className="sessions-kicker">Разбор занятия · {props.operatorName}</p>
      <h1>{props.title ?? 'Сверяю с эталоном билета'}</h1>
      <p>{props.lead ?? 'Карточка сравнивается с реальными данными ситуации, стенограмма разбирается отдельно.'}</p>
      <ol className="debrief-steps">
        {steps.map((label, index) => (
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
  const reviews = useTeacherReviews();
  const review = record.id === 'pending' ? undefined : reviews[record.id];
  const official = review?.expertScore;
  const teacherComment = review?.comment;
  const threshold = props.kind === 'exam' ? PASS_SCORE_EXAM : PASS_SCORE;
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
        { label: 'Опрос на линии', value: record.interviewScore ?? 0, max: 20, hint: 'Адрес, пострадавшие, телефон; суть — если заявитель уже сказал сам' },
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

      <ReviewHero
        draft={record.score}
        official={official}
        threshold={threshold}
        play={!props.reduced}
        confirmedLead={`${props.kind === 'exam' ? 'Экзамен, зачёт от 80. ' : ''}Преподаватель подтвердил ${official} из 100. Карточка сверена с фактами билета${sms ? ', канал SMS.' : '.'}`}
      />

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

      <TeacherNote text={teacherComment} />
      {readableScoreText(record.comment ?? '') ? (
        <p className="debrief-comment">{readableScoreText(record.comment ?? '')}</p>
      ) : null}

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
          {record.recommendations.some((item) => readableScoreText(item) && !item.trim().startsWith('{')) ? (
            <ul>
              {record.recommendations
                .filter((item) => !item.trim().startsWith('{'))
                .map((item) => (
                  <li key={item}>{readableScoreText(item)}</li>
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
        {official != null && official >= threshold ? (
          <button
            type="button"
            onClick={() => printLessonCertificate({ ...record, score: official, passed: true }, props.operatorName)}
          >
            Справка о зачёте
          </button>
        ) : null}
        <DownloadWavButton
          lessonId={record.id}
          recordingId={record.recordingId}
          filename={`sys112-${record.scenarioCode || 'zvonok'}.wav`}
        />
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

function LessonExitBar(props: { onSessions: () => void; onBriefing: () => void; onCatalog: () => void }) {
  return (
    <div className="debrief-toolbar">
      <div className="debrief-actions">
        <button type="button" className="debrief-primary" onClick={props.onSessions}>
          Мои сессии
        </button>
        <button type="button" onClick={props.onBriefing}>
          К уроку
        </button>
        <button type="button" onClick={props.onCatalog}>
          К списку
        </button>
      </div>
    </div>
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

const DDS_JUDGE_STEPS = [
  'Читаю карточки от оператора 112',
  'Проверяю подтверждение приёма',
  'Сверяю пострадавших и телефон',
  'Смотрю наряд и статусы реагирования',
  'Слушаю, как связались со службой',
  'Проверяю закрытие карточки в 112',
  'Считаю норматив обработки',
];

type DdsDebriefProps = {
  finish: DdsFinish;
  operatorLogin: string;
  operatorName: string;
  accountBar: ReactNode;
  track: LearnerTrack;
  onLogout: () => void;
  onTrack: (track: LearnerTrack) => void;
  onTheory: () => void;
  onCatalog: () => void;
  onSessions: () => void;
  onHandbook?: () => void;
  onBriefing: () => void;
};

export function DdsDebriefPage(props: DdsDebriefProps) {
  const finish = props.finish;
  const base = useMemo(() => {
    const first = finish.cards[0];
    const elapsedMs = finish.cards.reduce((sum, item) => sum + item.elapsedMs, 0);
    return scoreDdsLesson({
      scenario: finish.scenario,
      operatorLogin: props.operatorLogin,
      draft: first?.draft ?? {
        callerName: '',
        callerPhone: '',
        address: '',
        description: '',
        injured: 'Нет',
        services: [],
      },
      facts: first?.facts ?? {
        callerName: '',
        callerPhone: '',
        address: '',
        description: '',
        injured: 'Нет',
        services: [],
      },
      startedAt: finish.startedAt,
      completedAt: new Date(Date.parse(finish.startedAt) + elapsedMs).toISOString(),
      elapsedMs,
      cards: finish.cards.map((item) => ({
        scenario: item.scenario,
        draft: item.draft,
        facts: item.facts,
        role: item.role,
        decision: item.decision,
        elapsedMs: item.elapsedMs,
        naryad: item.naryad,
        workplaceStatus: item.workplaceStatus,
        callback: item.callback,
        contacts: item.contacts,
        history: item.history,
        openMs: item.openMs,
        firstRecordMs: item.firstRecordMs,
        chiefCalled: item.chiefCalled,
        crewCalled: item.crewCalled,
        reportedTo112: item.reportedTo112,
        dialogue: item.dialogue,
      })),
    });
  }, [finish, props.operatorLogin]);
  const [record, setRecord] = useState<LessonRecord>(() => ({ ...base, id: 'pending' }));
  const reviews = useTeacherReviews();
  const review = record.id === 'pending' ? undefined : reviews[record.id];
  const official = review?.expertScore;
  const teacherComment = review?.comment;
  const [revealed, setRevealed] = useState(false);
  const [step, setStep] = useState(0);
  const savedId = useRef<string | null>(null);
  const reduced = useReducedMotion();
  const checks = useMemo(() => ddsFieldChecks(finish.cards), [finish.cards]);
  const rows = useMemo(() => ddsScoreRows(finish.cards), [finish.cards]);

  useEffect(() => {
    const saved = appendLesson(props.operatorLogin, base);
    savedId.current = saved.id;
    setRecord(saved);
    const clips = finish.clips?.length
      ? finish.clips
      : finish.audio
        ? [{ title: 'Звонок', audio: finish.audio, seconds: finish.callSeconds ?? 1 }]
        : [];
    if (!clips.length) {
      return;
    }
    void Promise.all(clips.map((clip) => clip.audio)).then(async (blobs) => {
      const ready = blobs.filter((blob): blob is Blob => Boolean(blob?.size));
      if (!ready.length) {
        return;
      }
      const wavs = await Promise.all(ready.map((blob) => (blob.type.includes('wav') ? blob : blobToWav(blob))));
      const wav = wavs.length === 1 ? wavs[0] : await concatWavs(wavs);
      await saveLocalRecording(saved.id, wav).catch(() => undefined);
      setRecord((current) => ({ ...current, id: saved.id }));
      const data = await blobToBase64(wav);
      const uploaded = await uploadRecording({
        lessonId: saved.id,
        login: props.operatorLogin,
        scenarioId: finish.scenario.id,
        mime: 'audio/wav',
        durationSec: clips.reduce((sum, clip) => sum + clip.seconds, 0) || 1,
        data,
      });
      if (uploaded?.id) {
        patchLesson(props.operatorLogin, saved.id, { recordingId: uploaded.id });
        setRecord((current) => ({ ...current, id: saved.id, recordingId: uploaded.id }));
      }
    }).catch(() => undefined);
  }, [base, finish.audio, finish.clips, finish.scenario.id, props.operatorLogin]);

  useEffect(() => {
    if (reduced) {
      return;
    }
    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % DDS_JUDGE_STEPS.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [reduced]);

  useEffect(() => {
    let cancelled = false;
    const transcript = finish.cards
      .flatMap((card) =>
        (card.contacts ?? []).map(
          (contact) => `Карточка ${card.scenario.code}, служба ${contact.service}. Диспетчер ДДС сказал: ${contact.said}`,
        ),
      )
      .join('\n');
    const facts = finish.cards
      .map((card) => `${card.scenario.code}: ${card.facts.address}. ${card.facts.description}. Пострадавшие: ${card.facts.injured}`)
      .join('\n');
    void Promise.all([
      requestCallAiScore({
        transcript: transcript || 'Со службами не связывались.',
        facts,
        card: finish.cards
          .map((card) => `${card.scenario.code}: статус ${card.workplaceStatus || 'нет'}, наряд ${card.naryad || 'нет'}`)
          .join('\n'),
        rules:
          'Это диспетчер ДДС, не оператор 112 и не заявитель. Оцени только, связался ли он со службой, назвал ли адрес и попросил ли направить наряд. Не ставь замечание, если разговора не было — это уже учтено правилами.',
      }),
      new Promise((resolve) => window.setTimeout(resolve, reduced ? 0 : 800)),
    ]).then(([ai]) => {
      if (cancelled) {
        return;
      }
      if (ai?.comment) {
        const id = savedId.current;
        const next = {
          comment: ai.comment,
          recommendations: [...base.recommendations, ...ai.recommendations].slice(0, 4),
        };
        if (id) {
          const patched = patchLesson(props.operatorLogin, id, next);
          if (patched) {
            setRecord(patched);
          }
        }
      }
      setRevealed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [base.recommendations, finish.cards, props.operatorLogin, reduced]);

  const findings = record.findings.filter((item) => item.code !== 'ai-note');
  return (
    <StudentShell
      accountBar={props.accountBar}
      track={props.track}
      onTrack={props.onTrack}
      onTheory={props.onTheory}
      onLogout={props.onLogout}
      onCatalog={props.onCatalog}
      onSessions={props.onSessions}
      onHandbook={props.onHandbook}
    >
      <div className={`debrief-body${revealed ? ' is-revealed' : ' is-judging'}`}>
        {!revealed ? (
          <>
            <LessonExitBar onSessions={props.onSessions} onBriefing={props.onBriefing} onCatalog={props.onCatalog} />
            <JudgeScreen
              operatorName={props.operatorName}
              step={step}
              reduced={reduced}
              mark="ДДС"
              title="Проверяю обработку смены"
              lead="Карточки сверяются с эталоном: приём, наряд, статусы и как вы передали адрес службе."
              steps={DDS_JUDGE_STEPS}
            />
          </>
        ) : (
          <>
            <header className="debrief-head">
              <p className="sessions-kicker">Разбор смены ДДС · {props.operatorName}</p>
              <p>
                {finish.workplace} · {finish.scenario.code} · {finish.cards.length} карточек
              </p>
            </header>
            <ReviewHero
              draft={record.score}
              official={official}
              threshold={PASS_SCORE}
              play={!reduced}
              confirmedLead={`Преподаватель подтвердил ${official} из 100. ${ddsVerdictLead(record)}`}
            />
            <ul className="debrief-bars">
              {rows.map((row, index) => (
                <ScoreRow key={row.label} {...row} delay={index * 280} play={!reduced} />
              ))}
            </ul>
            <section className="debrief-compare" aria-label="Сверка карточек смены">
              <h2>Сверка карточек с эталоном</h2>
              <ul>
                {checks.map((item, index) => (
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
                      <span>Сделали</span>
                      {item.got || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            <TeacherNote text={teacherComment} />
            <div className="debrief-notes-grid">
              <section className="debrief-notes">
                <h2>Замечания</h2>
                {findings.length ? (
                  <ul>
                    {findings.map((item) => (
                      <li key={`${item.code}-${item.field}-${item.message}`}>
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
                {record.recommendations.some((item) => !item.trim().startsWith('{')) ? (
                  <ul>
                    {record.recommendations
                      .filter((item) => !item.trim().startsWith('{'))
                      .map((item) => (
                        <li key={item}>{readableScoreText(item)}</li>
                      ))}
                  </ul>
                ) : (
                  <p>Держите тот же разбор на следующей смене.</p>
                )}
              </section>
            </div>
            <div className="debrief-actions">
              <button type="button" className="debrief-primary" onClick={props.onSessions}>
                Мои сессии
              </button>
              {official != null && official >= PASS_SCORE ? (
                <button
                  type="button"
                  onClick={() => printLessonCertificate({ ...record, score: official, passed: true }, props.operatorName)}
                >
                  Справка о зачёте
                </button>
              ) : null}
              <DownloadWavButton
                lessonId={record.id}
                recordingId={record.recordingId}
                filename={`sys112-${record.scenarioCode || 'zvonok'}.wav`}
              />
              <button type="button" onClick={props.onBriefing}>
                К уроку
              </button>
              <button type="button" onClick={props.onCatalog}>
                К списку
              </button>
            </div>
          </>
        )}
      </div>
    </StudentShell>
  );
}

function ddsVerdictLead(record: LessonRecord): string {
  const transfer = record.findings.find((item) => item.code === 'dds-transfer');
  const accept = record.findings.find((item) => item.code === 'dds-accept');
  const close = record.findings.find((item) => item.code === 'dds-close');
  const naryad = record.findings.find((item) => item.code === 'dds-naryad');
  if (record.passed) {
    return `Зачёт от ${PASS_SCORE}. Результат уже в «Мои сессии».`;
  }
  if (transfer) {
    return `${transfer.message} Порог ${PASS_SCORE}.`;
  }
  if (accept) {
    return `${accept.message} Порог ${PASS_SCORE}.`;
  }
  if (naryad) {
    return `${naryad.message} Порог ${PASS_SCORE}.`;
  }
  if (close) {
    return `${close.message} Порог ${PASS_SCORE}.`;
  }
  return `Нужно ${PASS_SCORE} баллов. Сейчас ${record.score}.`;
}

function ddsScoreRows(cards: DdsFinishCard[]) {
  const own = cards.filter((item) => item.role === 'own');
  const foreign = cards.filter((item) => item.role === 'foreign');
  const scored = own.map((item) =>
    scoreDdsCard({
      scenario: item.scenario,
      draft: item.draft,
      facts: item.facts,
      role: item.role,
      decision: item.decision,
      elapsedMs: item.elapsedMs,
      naryad: item.naryad,
      workplaceStatus: item.workplaceStatus,
      callback: item.callback,
      contacts: item.contacts,
      history: item.history,
      openMs: item.openMs,
      firstRecordMs: item.firstRecordMs,
      chiefCalled: item.chiefCalled,
      crewCalled: item.crewCalled,
      reportedTo112: item.reportedTo112,
    }),
  );
  const avg = (values: number[]) => (values.length ? Math.round(values.reduce((sum, item) => sum + item, 0) / values.length) : 0);
  const transfer = foreign.length
    ? Math.round((foreign.filter((item) => item.decision === 'transfer' || item.workplaceStatus === 'Не принято').length / foreign.length) * 100)
    : 100;
  return [
    { label: 'Связь со службой', value: avg(scored.map((item) => item.parts.call)), max: 55, hint: 'Служба: адрес и наряд. Ещё доклад начальнику и связь с бригадой' },
    { label: 'Карточка', value: avg(scored.map((item) => item.parts.card)), max: 22, hint: 'Приём, ФИО, номер наряда, закрытие' },
    { label: 'Факты', value: avg(scored.map((item) => item.parts.facts)), max: 15, hint: 'Пострадавшие и телефон' },
    { label: 'Норматив', value: avg(scored.map((item) => item.parts.timer)), max: 8, hint: '30 с до открытия, 3 мин на первую запись' },
    { label: 'Чужие карточки', value: transfer, max: 100, hint: 'Чужой профиль — «Не принято», без своей бригады' },
  ].filter((row) => row.label !== 'Чужие карточки' || foreign.length > 0);
}

function ddsFieldChecks(cards: DdsFinishCard[]): FieldCheck[] {
  return cards.flatMap((card) => {
    const own = card.role === 'own';
    const scored = scoreDdsCard({
      scenario: card.scenario,
      draft: card.draft,
      facts: card.facts,
      role: card.role,
      decision: card.decision,
      elapsedMs: card.elapsedMs,
      naryad: card.naryad,
      workplaceStatus: card.workplaceStatus,
      callback: card.callback,
      contacts: card.contacts,
      history: card.history,
      openMs: card.openMs,
      firstRecordMs: card.firstRecordMs,
      chiefCalled: card.chiefCalled,
      crewCalled: card.crewCalled,
      reportedTo112: card.reportedTo112,
    });
    const told112 = Boolean(card.crewCalled && card.reportedTo112);
    const injuredOk = card.draft.injured === card.facts.injured || told112;
    const phoneOk = phonesMatch(card.facts.callerPhone, card.draft.callerPhone) || told112;
    const profileOk = own ? card.decision === 'dispatch' : card.decision === 'transfer';
    const cardReady =
      card.workplaceStatus === 'Работы завершены' && Boolean(card.naryad) && card.draft.callerName.trim().length >= 5;
    return [
      {
        id: `${card.id}-profile`,
        label: `${card.scenario.code} · профиль`,
        expected: own ? 'Направить бригаду своей ДДС' : 'Передать в другую ДДС',
        got: card.decision === 'dispatch' ? 'Бригада направлена' : 'Передана',
        state: profileOk ? 'match' : 'miss',
        points: profileOk ? 1 : 0,
        max: 1,
      },
      ...(own
        ? [
            {
              id: `${card.id}-call`,
              label: `${card.scenario.code} · связь`,
              expected: 'Звонок в нужную службу: адрес и просьба направить наряд',
              got: (card.contacts ?? []).map((item) => `${item.service}: ${item.said}`).join(' · ') || 'не звонили',
              state: scored.parts.call >= 55 ? 'match' : scored.parts.call > 0 ? 'partial' : 'miss',
              points: scored.parts.call,
              max: 55,
            } satisfies FieldCheck,
            {
              id: `${card.id}-flow`,
              label: `${card.scenario.code} · карточка`,
              expected: 'ФИО, наряд, Принята и Работы завершены',
              got: `${card.draft.callerName || 'ФИО пусто'} · ${card.workplaceStatus ?? 'нет статуса'}${card.naryad ? ` · наряд ${card.naryad}` : ' · наряд пусто'}`,
              state: cardReady ? 'match' : scored.parts.card > 0 ? 'partial' : 'miss',
              points: scored.parts.card,
              max: 22,
            } satisfies FieldCheck,
            {
              id: `${card.id}-inj`,
              label: `${card.scenario.code} · пострадавшие`,
              expected: card.facts.injured,
              got: card.draft.injured === card.facts.injured ? card.draft.injured : told112 ? 'сообщено в 112' : card.draft.injured,
              state: injuredOk ? 'match' : 'miss',
              points: injuredOk ? 8 : 0,
              max: 8,
            } satisfies FieldCheck,
            {
              id: `${card.id}-phone`,
              label: `${card.scenario.code} · телефон`,
              expected: card.facts.callerPhone || '—',
              got: card.draft.callerPhone || 'пусто',
              state: phoneOk ? 'match' : 'miss',
              points: phoneOk ? 7 : 0,
              max: 7,
            } satisfies FieldCheck,
          ]
        : []),
    ];
  });
}

function DownloadWavButton(props: { lessonId: string; recordingId?: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [hasLocal, setHasLocal] = useState(false);
  const [error, setError] = useState('');
  const lessonId = props.lessonId !== 'pending' ? props.lessonId : '';

  useEffect(() => {
    if (!lessonId) {
      setHasLocal(false);
      return;
    }
    let cancelled = false;
    void loadLocalRecording(lessonId).then((blob) => {
      if (!cancelled) {
        setHasLocal(Boolean(blob?.size));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  if (!props.recordingId && !hasLocal) {
    return null;
  }

  async function download() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const local = lessonId ? await loadLocalRecording(lessonId) : null;
      let blob = local && local.size ? local : null;
      if (!blob && props.recordingId) {
        const response = await fetch(`${recordingUrl(props.recordingId)}?download=1`);
        if (!response.ok) {
          throw new Error('missing');
        }
        blob = await response.blob();
      }
      if (!blob?.size) {
        throw new Error('missing');
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = props.filename.endsWith('.wav') ? props.filename : `${props.filename}.wav`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1500);
    } catch {
      setError('Файл записи недоступен');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="debrief-primary" onClick={() => void download()} disabled={busy}>
      {busy ? 'Готовлю WAV…' : error || 'Скачать WAV'}
    </button>
  );
}
