import { type TrainingScenario } from '../data/scenarios';
import { scoreDds, type DdsDraft, type TicketFacts } from '../features/dds-training/incoming-card';
import type { DdsCardDecision, DdsServiceStatus } from '../features/dds-training/types';
import { inspectOperatorText } from './text-quality';
import { CARD_TIMER_LIMIT_SEC, PASS_SCORE, type LessonFinding, type LessonRecord } from './types';

export type DdsShiftCardInput = {
  scenario: TrainingScenario;
  draft: DdsDraft;
  facts: TicketFacts;
  role: 'own' | 'foreign';
  decision: DdsCardDecision;
  elapsedMs: number;
  naryad?: string;
  workplaceStatus?: string;
  callback?: boolean;
};

type ScoredCard = {
  id: string;
  role: 'own' | 'foreign';
  decision: DdsCardDecision;
  servicesOk: boolean;
  injuredOk: boolean;
  phoneOk: boolean;
  extra: TrainingScenario['services'];
  missing: TrainingScenario['services'];
  elapsedMs: number;
  ok: boolean;
  findings: LessonFinding[];
  points: number;
};

const ACCEPTED: DdsServiceStatus[] = [
  'Принята',
  'Начало реагирования',
  'Прибытие',
  'Проведение работ',
  'Работы завершены',
];

function acceptedStatus(status?: string): boolean {
  return Boolean(status && (ACCEPTED as string[]).includes(status));
}

export function scoreDdsCard(input: DdsShiftCardInput): ScoredCard {
  const check = scoreDds(input.draft, input.facts);
  const findings: LessonFinding[] = [];
  const elapsedSeconds = Math.max(0, Math.round(input.elapsedMs / 1000));
  const status = input.workplaceStatus ?? '';

  if (input.role === 'foreign') {
    const ok = input.decision === 'transfer' || status === 'Не принято';
    if (!ok) {
      findings.push({
        code: 'dds-transfer',
        field: 'Профиль ДДС',
        message: `Карточка «${input.scenario.code}» не вашего профиля — её надо было передать или поставить «Не принято», а не направлять свою бригаду`,
        severity: 'error',
      });
    }
    return {
      id: input.scenario.id,
      role: input.role,
      decision: input.decision,
      ...check,
      elapsedMs: input.elapsedMs,
      ok,
      findings,
      points: ok ? 100 : 20,
    };
  }

  if (input.decision !== 'dispatch') {
    findings.push({
      code: 'dds-own-transfer',
      field: 'Профиль ДДС',
      message: `Карточка «${input.scenario.code}» вашего профиля: её надо принять, а не передавать дальше`,
      severity: 'error',
    });
  }

  let processPoints = 70;
  if (!acceptedStatus(status)) {
    processPoints -= 30;
    findings.push({
      code: 'dds-accept',
      field: 'Приём карточки',
      message: 'Нет статуса «Принята»: карточка не подтверждена как зона ответственности',
      severity: 'error',
    });
  }
  if (!(input.naryad ?? '').trim()) {
    processPoints -= 15;
    findings.push({
      code: 'dds-naryad',
      field: 'Наряд',
      message: 'Не указан номер наряда / распоряжение на выезд',
      severity: 'error',
    });
  }
  if (status !== 'Работы завершены') {
    processPoints -= 25;
    findings.push({
      code: 'dds-close',
      field: 'Закрытие',
      message: status === 'Отказ от выполнения работ'
        ? 'Отказ от работ по своей карточке'
        : 'Нет отметки «Работы завершены» и возврата карточки в 112',
      severity: 'error',
    });
  }
  processPoints = Math.max(0, processPoints);

  let injuredPoints = 10;
  if (!check.injuredOk) {
    injuredPoints = 0;
    findings.push({
      code: 'dds-injured',
      field: 'Пострадавшие',
      message: `Эталон: ${input.facts.injured}. В карточке: ${input.draft.injured || 'пусто'}`,
      severity: 'error',
    });
  }

  let phonePoints = 10;
  if (!check.phoneOk) {
    phonePoints = 0;
    findings.push({
      code: 'dds-phone',
      field: 'Телефон',
      message: 'Номер для связи не восстановлен',
      severity: 'error',
    });
    if (!input.callback) {
      findings.push({
        code: 'dds-callback',
        field: 'Обратный звонок',
        message: 'Телефон стёрт — нужно было перезвонить заявителю и уточнить номер',
        severity: 'warning',
      });
    }
  }

  let timerPoints = 10;
  if (elapsedSeconds > CARD_TIMER_LIMIT_SEC) {
    timerPoints = elapsedSeconds > 60 ? 0 : 4;
    findings.push({
      code: 'timer-over',
      field: 'Время обработки',
      message: `Норматив ${CARD_TIMER_LIMIT_SEC} с, факт ${elapsedSeconds} с`,
      severity: 'warning',
    });
  }

  findings.push(...inspectOperatorText('Описание', input.draft.description, { minChars: 8 }));
  const decisionOk = input.decision === 'dispatch';
  const points = decisionOk
    ? Math.max(0, Math.min(100, Math.round(processPoints + injuredPoints + phonePoints + timerPoints)))
    : Math.min(40, Math.round(processPoints + injuredPoints + phonePoints + timerPoints) / 2);
  const ok =
    decisionOk &&
    check.injuredOk &&
    check.phoneOk &&
    acceptedStatus(status) &&
    Boolean((input.naryad ?? '').trim()) &&
    status === 'Работы завершены';

  return {
    id: input.scenario.id,
    role: input.role,
    decision: input.decision,
    ...check,
    elapsedMs: input.elapsedMs,
    ok,
    findings,
    points,
  };
}

export function scoreDdsLesson(input: {
  scenario: TrainingScenario;
  operatorLogin: string;
  draft: DdsDraft;
  facts: TicketFacts;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  cards?: DdsShiftCardInput[];
}): Omit<LessonRecord, 'id'> {
  const cards = input.cards ?? [
    {
      scenario: input.scenario,
      draft: input.draft,
      facts: input.facts,
      role: 'own' as const,
      decision: 'dispatch' as const,
      elapsedMs: input.elapsedMs,
    },
  ];
  const scored = cards.map(scoreDdsCard);
  const findings = scored.flatMap((item) => item.findings);
  const elapsedSeconds = Math.max(
    0,
    Math.round(scored.reduce((sum, item) => sum + item.elapsedMs, 0) / 1000),
  );
  const score = Math.round(scored.reduce((sum, item) => sum + item.points, 0) / scored.length);
  const recs: string[] = [];
  if (scored.some((item) => item.role === 'foreign' && !item.ok)) {
    recs.push('Чужой профиль не обрабатывают своей бригадой — карточку передают в нужную ДДС.');
  }
  if (scored.some((item) => item.role === 'own' && item.decision !== 'dispatch')) {
    recs.push('Карточку своего профиля нужно принять и направить, а не отдавать соседям.');
  }
  if (scored.some((item) => item.role === 'own' && !item.injuredOk)) {
    recs.push('Если в описании есть пострадавший, признак «пострадавшие» не может быть «нет».');
  }
  if (scored.some((item) => item.role === 'own' && !item.phoneOk)) {
    recs.push('Телефон для связи обязателен. Если 112 его стёр — перезвоните заявителю.');
  }
  if (findings.some((item) => item.code === 'dds-accept' || item.code === 'dds-close')) {
    recs.push('Сначала «Принята», затем наряд и статусы реагирования, в конце «Работы завершены».');
  }
  if (elapsedSeconds > CARD_TIMER_LIMIT_SEC * scored.length) {
    recs.push('Обработка карточки ДДС тоже в нормативе 30 секунд на карточку.');
  }

  const serviceVeto = false;
  const foreignVeto = scored.some((item) => item.role === 'foreign' && !item.ok);

  return {
    operatorLogin: input.operatorLogin,
    mode: 'dds',
    scenarioId: input.scenario.id,
    scenarioCode: input.scenario.code,
    scenarioTitle: input.scenario.title,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    elapsedSeconds,
    reactionSeconds: null,
    cardTimerSeconds: elapsedSeconds,
    cardTimerLimitSec: CARD_TIMER_LIMIT_SEC,
    cardTimerExceeded: scored.some((item) => item.elapsedMs > CARD_TIMER_LIMIT_SEC * 1000),
    score,
    passed: score >= PASS_SCORE && !serviceVeto && !foreignVeto,
    findings,
    recommendations: recs.slice(0, 4),
    summary: `${score} · ${scored.filter((item) => item.ok).length}/${scored.length} карточек · ${elapsedSeconds} с`,
    reviewFields: cards.flatMap((item, index) => {
      const who = item.role === 'foreign' ? 'Чужая' : 'Своя';
      const prefix = `${index + 1}. ${who}`;
      const statusExpected = item.role === 'foreign' ? 'Не принято' : 'Работы завершены';
      const statusGot = item.workplaceStatus ?? '';
      return [
        {
          label: `${prefix} · адрес`,
          expected: item.facts.address,
          got: item.draft.address,
          state: item.draft.address.trim() ? 'partial' : 'empty',
          points: 0,
          max: 0,
        },
        {
          label: `${prefix} · телефон`,
          expected: item.facts.callerPhone,
          got: item.draft.callerPhone,
          state: item.draft.callerPhone.trim() ? 'partial' : 'empty',
          points: 0,
          max: 0,
        },
        {
          label: `${prefix} · пострадавшие`,
          expected: item.facts.injured,
          got: item.draft.injured,
          state: item.draft.injured.trim() === item.facts.injured.trim() ? 'match' : 'miss',
          points: 0,
          max: 0,
        },
        {
          label: `${prefix} · статус`,
          expected: statusExpected,
          got: statusGot,
          state: statusGot === statusExpected ? 'match' : 'miss',
          points: 0,
          max: 0,
        },
        {
          label: `${prefix} · наряд`,
          expected: item.role === 'foreign' ? 'не нужен' : 'номер бригады',
          got: item.naryad ?? '',
          state: item.role === 'foreign' || Boolean(item.naryad?.trim()) ? 'match' : 'empty',
          points: 0,
          max: 0,
        },
      ] ;
    }),
  };
}
