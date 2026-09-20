import { SERVICE_LABEL, type TrainingScenario } from '../data/scenarios';
import { scoreDds, type DdsDraft, type TicketFacts } from '../features/dds-training/incoming-card';
import { inspectOperatorText } from './text-quality';
import { CARD_TIMER_LIMIT_SEC, PASS_SCORE, type LessonFinding, type LessonRecord } from './types';

export function scoreDdsLesson(input: {
  scenario: TrainingScenario;
  operatorLogin: string;
  draft: DdsDraft;
  facts: TicketFacts;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
}): Omit<LessonRecord, 'id'> {
  const check = scoreDds(input.draft, input.facts);
  const findings: LessonFinding[] = [];
  const elapsedSeconds = Math.max(0, Math.round(input.elapsedMs / 1000));

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

  let phonePoints = 20;
  if (!check.phoneOk) {
    phonePoints = 0;
    findings.push({
      code: 'dds-phone',
      field: 'Телефон',
      message: 'Номер для связи не восстановлен',
      severity: 'error',
    });
  }

  let timerPoints = 15;
  if (elapsedSeconds > CARD_TIMER_LIMIT_SEC) {
    timerPoints = elapsedSeconds > 60 ? 0 : 6;
    findings.push({
      code: 'timer-over',
      field: 'Время обработки',
      message: `Норматив ${CARD_TIMER_LIMIT_SEC} с, факт ${elapsedSeconds} с`,
      severity: 'warning',
    });
  }

  findings.push(...inspectOperatorText('Описание', input.draft.description, { minChars: 8 }));

  const score = Math.max(0, Math.min(100, Math.round(servicePoints + injuredPoints + phonePoints + timerPoints)));
  const recs: string[] = [];
  if (!check.servicesOk) {
    recs.push('Сверяйте службы с текстом карточки, а не с тем, что проставил оператор 112.');
  }
  if (!check.injuredOk) {
    recs.push('Если в описании есть пострадавший, признак «пострадавшие» не может быть «нет».');
  }
  if (!check.phoneOk) {
    recs.push('Телефон для связи обязателен. Если 112 его стёр — верните из текста карточки.');
  }
  if (elapsedSeconds > CARD_TIMER_LIMIT_SEC) {
    recs.push('Обработка карточки ДДС тоже в нормативе 30 секунд.');
  }

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
    cardTimerExceeded: elapsedSeconds > CARD_TIMER_LIMIT_SEC,
    score,
    passed: score >= PASS_SCORE && check.servicesOk && check.injuredOk && check.phoneOk,
    findings,
    recommendations: recs.slice(0, 4),
    summary: `${score} · службы ${check.servicesOk ? 'верно' : 'ошибка'} · ${elapsedSeconds} с`,
  };
}
