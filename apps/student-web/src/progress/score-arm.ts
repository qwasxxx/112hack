import type { TrainingScenario } from '../data/scenarios';
import type { IncidentCard } from '../features/arm112-simulator/model/arm112-models';
import type { Arm112PracticalResult } from '../features/arm112-simulator/model/training-result';
import { validateCard } from '../features/arm112-simulator/model/training-result';
import { addressOverlap, cardAddressLine } from './address-match';
import { incidentEssence, namesFromTicket, situationCore } from './ticket-parse';
import { inspectOperatorText } from './text-quality';
import { CARD_TIMER_LIMIT_SEC, PASS_SCORE, type LessonFinding, type LessonRecord } from './types';

const KIND_MARKERS: Record<TrainingScenario['services'][number], string[]> = {
  fire: ['101', 'мчс', 'пожар'],
  ambulance: ['103', 'скор', 'цэмп'],
  police: ['102', 'мвд', 'полиц'],
  gas: ['104', 'газ', 'мосгаз'],
};

function serviceHit(name: string, kind: TrainingScenario['services'][number]): boolean {
  const hay = name.toLowerCase().replace(/ё/g, 'е');
  return KIND_MARKERS[kind].some((mark) => {
    if (/^\d+$/.test(mark)) {
      return new RegExp(`(^|[^0-9])${mark}([^0-9]|$)`).test(hay);
    }
    return hay.includes(mark);
  });
}

function descriptionCore(scenario: TrainingScenario): string {
  const situation = scenario.situation ?? scenario.summary ?? '';
  const people = namesFromTicket(situation);
  return incidentEssence(situationCore(situation, people.callerFio || people.injuredName, ''));
}

export function scoreArmTraining(
  result: Arm112PracticalResult,
  scenario: TrainingScenario,
  operatorLogin: string,
): Omit<LessonRecord, 'id'> {
  const findings: LessonFinding[] = validateCard(result.card).map((item) => ({
    code: item.code,
    field: item.field,
    message: item.message,
    severity: 'error' as const,
  }));

  let classifierPoints = 0;
  const expectedNo = String(result.classifier.expected.number);
  const matchedNos = new Set(result.classifier.matched.map((item) => String(item.number)));
  if (matchedNos.has(expectedNo)) {
    classifierPoints = 30;
  } else if (
    result.classifier.groupCode === result.classifier.expected.groupCode &&
    result.classifier.priznak1 === result.classifier.expected.priznak1 &&
    result.classifier.groupCode
  ) {
    classifierPoints = 16;
    findings.push({
      code: 'classifier-partial',
      field: 'Классификатор',
      message: `Группа совпала, номер эталона ${expectedNo} не выбран`,
      severity: 'warning',
    });
  } else {
    findings.push({
      code: 'classifier-miss',
      field: 'Классификатор',
      message: `Эталон ${expectedNo} ${result.classifier.expected.finalType}. Выбрано иначе.`,
      severity: 'error',
    });
  }

  const names = result.services.map((item) => item.name);
  const serviceHay = [
    names.join(' '),
    ...result.card.classification.selectedTypes,
    ...result.card.classification.classifier.matchedNumbers,
  ].join(' ');
  const missingKinds = scenario.services.filter((kind) => !serviceHit(serviceHay, kind));
  let servicePoints = 20;
  if (missingKinds.length) {
    servicePoints = Math.max(0, 20 - missingKinds.length * 8);
    findings.push({
      code: 'services-missing',
      field: 'Службы',
      message: `Не направлены: ${missingKinds.join(', ')}`,
      severity: 'error',
    });
  }

  const expectedAddress = scenario.address ?? '';
  const gotAddress = cardAddressLine(result.card.address);
  const addr = addressOverlap(expectedAddress, gotAddress);
  let addressPoints = 15;
  if (expectedAddress && addr.ratio < 0.5) {
    addressPoints = Math.round(15 * addr.ratio);
    findings.push({
      code: 'address-miss',
      field: 'Адрес',
      message:
        addr.missing.length > 0
          ? `В карточке нет ориентиров эталона: ${addr.missing.slice(0, 6).join(', ')}`
          : 'Адрес слабо совпал с билетом',
      severity: 'error',
    });
  } else if (expectedAddress && addr.ratio < 0.75) {
    addressPoints = 11;
    findings.push({
      code: 'address-partial',
      field: 'Адрес',
      message: 'Адрес частично совпал с билетом',
      severity: 'warning',
    });
  }

  const desc = result.card.descriptionFromCaller;
  const core = addressOverlap(descriptionCore(scenario), desc);
  let descPoints = 10;
  if (!desc.trim()) {
    descPoints = 0;
  } else if (core.ratio < 0.2) {
    descPoints = 4;
    findings.push({
      code: 'description-weak',
      field: 'Описание со слов заявителя',
      message: 'Описание не отражает суть билета',
      severity: 'warning',
    });
  }
  findings.push(...inspectOperatorText('Описание со слов заявителя', desc, { minChars: 12 }));

  const requiredErrors = findings.filter((item) =>
    ['required-description', 'required-fio', 'required-status', 'required-injured', 'required-type'].includes(item.code),
  ).length;
  const requiredPoints = Math.max(0, 15 - requiredErrors * 4);

  let timerPoints = 5;
  if (result.cardTimerExceeded || result.cardTimerSeconds > CARD_TIMER_LIMIT_SEC) {
    timerPoints = 0;
    findings.push({
      code: 'timer-over',
      field: 'Таймер карточки',
      message: `Норматив ${result.cardTimerLimitSec} с, факт ${result.cardTimerSeconds} с`,
      severity: 'warning',
    });
  }

  let callPoints = 5;
  if (!result.incomingAcceptedAt) {
    callPoints = 0;
    findings.push({
      code: 'call-skipped',
      field: 'Вызов',
      message: 'Карточка без принятого входящего',
      severity: 'warning',
    });
  }

  const score = Math.max(
    0,
    Math.min(100, Math.round(classifierPoints + servicePoints + addressPoints + descPoints + requiredPoints + timerPoints + callPoints)),
  );
  const recs = recommendationsFor(findings, result.card);

  return {
    operatorLogin,
    mode: 'training',
    scenarioId: scenario.id,
    scenarioCode: result.scenarioCode,
    scenarioTitle: result.scenarioTitle,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    elapsedSeconds: result.elapsedSessionSeconds,
    reactionSeconds: result.reactionSeconds,
    cardTimerSeconds: result.cardTimerSeconds,
    cardTimerLimitSec: result.cardTimerLimitSec,
    cardTimerExceeded: result.cardTimerExceeded,
    score,
    passed: score >= PASS_SCORE && requiredErrors === 0 && missingKinds.length === 0,
    findings,
    recommendations: recs,
    summary: `${score} · ${result.classifier.expected.finalType || 'классификатор'} · ${result.cardTimerSeconds} с`,
  };
}

function recommendationsFor(findings: LessonFinding[], card: IncidentCard): string[] {
  const recs: string[] = [];
  const has = (code: string) => findings.some((item) => item.code === code);
  if (has('classifier-miss') || has('classifier-partial')) {
    recs.push('Сначала выберите тип в «Что случилось?», затем признаки — номер классификатора должен совпасть с эталоном билета.');
  }
  if (has('services-missing')) {
    recs.push('Службы должны следовать из классификатора и сути: 101 / 102 / 103 / 104 по факту происшествия.');
  }
  if (has('address-miss') || has('address-partial')) {
    recs.push('Переносите адрес из разговора в поля улица и дом, не оставляйте одну строку поиска.');
  }
  if (has('required-fio') || !card.caller.familyNameAndGivenName.trim()) {
    recs.push('Спросите ФИО и статус заявителя до сохранения.');
  }
  if (has('timer-over')) {
    recs.push('Норматив набора карточки — 30 секунд. Заполняйте обязательное сразу, детали — следом.');
  }
  if (findings.some((item) => item.code.startsWith('text-'))) {
    recs.push('Описание — обычным текстом, по-русски, без капса и без пропущенных пробелов.');
  }
  return recs.slice(0, 4);
}
