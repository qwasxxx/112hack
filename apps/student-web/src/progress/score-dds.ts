import { SERVICE_LABEL, type TrainingScenario } from '../data/scenarios';
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
      message: `Карточка «${input.scenario.code}» вашего профиля: бригаду надо направить, а не передавать дальше`,
      severity: 'error',
    });
  }

  let servicePoints = 40;
  if (!check.servicesOk) {
    servicePoints = Math.max(0, 40 - (check.missing.length + check.extra.length) * 12);
    if (check.missing.length) {
      findings.push({
        code: 'dds-services-missing',
        field: 'Службы',
        message: `Не направлены: ${check.missing.map((item) => SERVICE_LABEL[item]).join(', ')}`,
        severity: 'error',
      });
    }
    if (check.extra.length) {
      findings.push({
        code: 'dds-services-extra',
        field: 'Службы',
        message: `Лишние: ${check.extra.map((item) => SERVICE_LABEL[item]).join(', ')}`,
        severity: 'error',
      });
    }
  }

  let injuredPoints = 25;
  if (!check.injuredOk) {
    injuredPoints = 0;
    findings.push({
      code: 'dds-injured',
      field: 'Пострадавшие',
      message: `Эталон: ${input.facts.injured}. В карточке: ${input.draft.injured || 'пусто'}`,
      severity: 'error',
    });
  }

  let phonePoints = 15;
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

  let processPoints = 10;
  if (!acceptedStatus(status)) {
    processPoints -= 4;
    findings.push({
      code: 'dds-accept',
      field: 'Приём карточки',
      message: 'Нет статуса «Принята»: карточка не подтверждена как зона ответственности',
      severity: 'error',
    });
  }
  if (!(input.naryad ?? '').trim()) {
    processPoints -= 3;
    findings.push({
      code: 'dds-naryad',
      field: 'Наряд',
      message: 'Не указан номер наряда / распоряжение на выезд',
      severity: 'error',
    });
  }
  if (status !== 'Работы завершены') {
    processPoints -= 3;
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
    ? Math.max(0, Math.min(100, Math.round(servicePoints + injuredPoints + phonePoints + processPoints + timerPoints)))
    : Math.min(40, Math.round(servicePoints + injuredPoints + phonePoints + processPoints + timerPoints) / 2);
  const ok =
    decisionOk &&
    check.servicesOk &&
    check.injuredOk &&
    check.phoneOk &&
    acceptedStatus(status) &&
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
  if (scored.some((item) => item.role === 'own' && !item.servicesOk)) {
    recs.push('Сверяйте службы с текстом карточки, а не с тем, что проставил оператор 112.');
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

  const serviceVeto = scored.some((item) => item.role === 'own' && item.missing.length > 0);
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
  };
}
