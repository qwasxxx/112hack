import type { TrainingScenario } from '../data/scenarios';
import type { Arm112PracticalResult } from '../features/arm112-simulator/model/training-result';
import { addressOverlap, cardAddressLine } from './address-match';
import {
  cardPhones,
  filledAddress,
  last10,
  serviceLabels,
  ticketFactsFrom,
  type TicketFacts,
} from './ticket-facts';
import type { LessonFinding } from './types';

const KIND_MARKERS: Record<TrainingScenario['services'][number], string[]> = {
  fire: ['101', 'мчс', 'пожар'],
  ambulance: ['103', 'скор', 'цэмп'],
  police: ['102', 'мвд', 'полиц'],
  gas: ['104', 'газ', 'мосгаз'],
};

export type FieldCheck = {
  id: string;
  label: string;
  expected: string;
  got: string;
  state: 'match' | 'partial' | 'miss' | 'empty';
  points: number;
  max: number;
};

export type CardPart = {
  points: number;
  max: 50;
  findings: LessonFinding[];
  missingServices: TrainingScenario['services'];
  checks: FieldCheck[];
};

function serviceHit(name: string, kind: TrainingScenario['services'][number]): boolean {
  const hay = name.toLowerCase();
  return KIND_MARKERS[kind].some((mark) => hay.includes(mark));
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-я0-9]+/gi, ' ')
    .split(' ')
    .filter((item) => item.length >= 2);
}

function overlapRatio(expected: string, got: string): number {
  return addressOverlap(expected, got).ratio;
}

function checkState(points: number, max: number, got: string): FieldCheck['state'] {
  if (!got.trim()) {
    return 'empty';
  }
  if (points >= max) {
    return 'match';
  }
  if (points > 0) {
    return 'partial';
  }
  return 'miss';
}

function selectedHay(selected: string[]): string {
  return selected.join(' ').toLowerCase();
}

function note(
  findings: LessonFinding[],
  code: string,
  field: string,
  message: string,
  severity: LessonFinding['severity'],
) {
  findings.push({ code, field, message, severity });
}

export function scoreCard50(result: Arm112PracticalResult, scenario: TrainingScenario): CardPart {
  const facts = ticketFactsFrom(scenario);
  const card = result.card;
  const findings: LessonFinding[] = [];
  const checks: FieldCheck[] = [];

  const address = scoreAddress(facts, result, findings, checks);
  const description = scoreDescription(facts, card.descriptionFromCaller, findings, checks);
  const fio = scoreFio(facts, card.caller.familyNameAndGivenName, findings, checks);
  const phone = scorePhone(facts.phone, cardPhones(card), findings, checks);
  const injured = scoreInjured(facts, card.injured, findings, checks);
  const classifier = scoreClassifier(result, findings, checks);
  const services = scoreServices(facts, result, findings, checks);

  const points = Math.max(
    0,
    Math.min(50, address + description + fio + phone + injured + classifier.points + services.points),
  );
  return { points, max: 50, findings, missingServices: services.missing, checks };
}

function scoreAddress(
  facts: TicketFacts,
  result: Arm112PracticalResult,
  findings: LessonFinding[],
  checks: FieldCheck[],
): number {
  const max = 12;
  const gotLine = cardAddressLine(result.card.address);
  if (!filledAddress(result.card)) {
    note(findings, 'address-empty', 'Адрес', 'Адрес не заполнен — сверка с билетом невозможна', 'error');
    checks.push({ id: 'address', label: 'Адрес', expected: facts.address, got: '—', state: 'empty', points: 0, max });
    return 0;
  }
  const ratio = overlapRatio(facts.address, gotLine);
  let points = Math.round(10 * ratio);
  const houseGot = result.card.address.house.trim();
  if (facts.house && houseGot && facts.house.toLowerCase() === houseGot.toLowerCase()) {
    points += 2;
  } else if (facts.house && gotLine.toLowerCase().includes(facts.house.toLowerCase())) {
    points += 1;
  }
  points = Math.max(0, Math.min(max, points));
  if (points < 6) {
    const missing = addressOverlap(facts.address, gotLine).missing.slice(0, 6);
    note(
      findings,
      'address-miss',
      'Адрес',
      missing.length ? `Не совпало с билетом: ${missing.join(', ')}` : 'Адрес не совпал с эталоном билета',
      'error',
    );
  } else if (points < max) {
    note(findings, 'address-partial', 'Адрес', 'Адрес частично совпал с билетом', 'warning');
  }
  checks.push({
    id: 'address',
    label: 'Адрес',
    expected: facts.address,
    got: gotLine,
    state: checkState(points, max, gotLine),
    points,
    max,
  });
  return points;
}

function scoreDescription(
  facts: TicketFacts,
  got: string,
  findings: LessonFinding[],
  checks: FieldCheck[],
): number {
  const max = 8;
  if (!got.trim()) {
    note(findings, 'required-description', 'Описание со слов заявителя', 'Пусто — нет сверки с тем, что случилось', 'error');
    checks.push({ id: 'what', label: 'Что случилось', expected: facts.what, got: '—', state: 'empty', points: 0, max });
    return 0;
  }
  const ratio = overlapRatio(facts.what, got);
  const points = Math.max(0, Math.min(max, Math.round(max * ratio)));
  if (points < 3) {
    note(findings, 'description-miss', 'Описание со слов заявителя', 'Текст не отражает суть билета', 'error');
  } else if (points < max) {
    note(findings, 'description-partial', 'Описание со слов заявителя', 'Суть билета отражена частично', 'warning');
  }
  const grammar = grammarNote(got);
  if (grammar) {
    note(findings, 'grammar', 'Описание со слов заявителя', grammar, 'warning');
  }
  checks.push({
    id: 'what',
    label: 'Что случилось',
    expected: facts.what,
    got,
    state: checkState(points, max, got),
    points,
    max,
  });
  return points;
}

function scoreFio(
  facts: TicketFacts,
  got: string,
  findings: LessonFinding[],
  checks: FieldCheck[],
): number {
  const max = 6;
  const expected = facts.callerFio;
  const expectedLabel = expected
    ? expected
    : facts.callerRole
      ? `${facts.callerRole} (ФИО заявителя в билете нет)`
      : 'как назвал заявитель';
  if (!got.trim()) {
    note(findings, 'required-fio', 'ФИО заявителя', 'Не заполнено', 'error');
    checks.push({ id: 'fio', label: 'ФИО заявителя', expected: expectedLabel, got: '—', state: 'empty', points: 0, max });
    return 0;
  }
  if (!expected) {
    const wroteInjured =
      facts.injuredName &&
      nameOverlap(facts.injuredName, got) >= 0.5 &&
      nameOverlap(facts.injuredName, got) > nameOverlap(facts.callerRole, got);
    const points = wroteInjured ? 4 : max;
    if (wroteInjured) {
      note(
        findings,
        'fio-role',
        'ФИО заявителя',
        `В поле заявителя попало ФИО пострадавшего (${facts.injuredName}). Заявитель — ${facts.callerRole || 'кто звонит'}`,
        'warning',
      );
    }
    checks.push({
      id: 'fio',
      label: 'ФИО заявителя',
      expected: expectedLabel,
      got,
      state: checkState(points, max, got),
      points,
      max,
    });
    return points;
  }
  const ratio = nameOverlap(expected, got);
  const points = ratio >= 0.5 ? max : ratio > 0 ? 5 : 0;
  if (points < max && points > 0) {
    note(findings, 'fio-partial', 'ФИО заявителя', `Эталон: ${expected}`, 'warning');
  } else if (points === 0) {
    note(findings, 'fio-miss', 'ФИО заявителя', `Эталон: ${expected}`, 'error');
  }
  checks.push({
    id: 'fio',
    label: 'ФИО заявителя',
    expected,
    got,
    state: checkState(points, max, got),
    points,
    max,
  });
  return points;
}

const NAME_NICK: Record<string, string[]> = {
  александр: ['саша', 'шура'],
  александра: ['саша', 'шура'],
  светлана: ['света', 'светка'],
  екатерина: ['катя', 'катерина'],
  мария: ['маша', 'маруся'],
  анастасия: ['настя'],
  дмитрий: ['дима', 'митя'],
  михаил: ['миша'],
  николай: ['коля'],
  иван: ['ваня'],
  илья: ['илюша', 'илюха'],
  алексей: ['леша', 'лёша', 'леха', 'лёха'],
  елена: ['лена'],
  татьяна: ['таня'],
  наталья: ['наташа'],
  ольга: ['оля'],
  юлия: ['юля'],
  анна: ['аня'],
  евгений: ['женя'],
  сергей: ['сережа', 'серёжа'],
  владимир: ['вова'],
  павел: ['паша'],
  максим: ['макс'],
  дарья: ['даша'],
  ирина: ['ира'],
};

function nameKeys(word: string): Set<string> {
  const w = word.replace(/ё/g, 'е');
  const keys = new Set([w]);
  for (const [full, nicks] of Object.entries(NAME_NICK)) {
    if (w === full || nicks.includes(w) || (w.length >= 4 && (full.startsWith(w) || w.startsWith(full.slice(0, 4))))) {
      keys.add(full);
      nicks.forEach((nick) => keys.add(nick.replace(/ё/g, 'е')));
    }
  }
  return keys;
}

function nameOverlap(expected: string, got: string): number {
  const need = tokens(expected);
  const have = tokens(got);
  if (!need.length) {
    return have.length ? 1 : 0;
  }
  if (!have.length) {
    return 0;
  }
  let hit = 0;
  for (const item of need) {
    const keys = nameKeys(item);
    if (have.some((word) => keys.has(word) || nameKeys(word).has(item))) {
      hit += 1;
    }
  }
  return hit / need.length;
}

function scorePhone(expected: string, got: string[], findings: LessonFinding[], checks: FieldCheck[]): number {
  const max = 6;
  const shown = got[0] ? got.join(', ') : '—';
  if (!got.length) {
    note(findings, 'phone-empty', 'Телефон', 'Номер заявителя не внесён', 'error');
    checks.push({
      id: 'phone',
      label: 'Телефон',
      expected: expected ? last10(expected) : 'из разговора',
      got: '—',
      state: 'empty',
      points: 0,
      max,
    });
    return 0;
  }
  if (!expected) {
    checks.push({ id: 'phone', label: 'Телефон', expected: 'из разговора', got: shown, state: 'match', points: max, max });
    return max;
  }
  const want = last10(expected);
  const hit = got.some((item) => item === want);
  const points = hit ? max : 0;
  if (!hit) {
    note(findings, 'phone-miss', 'Телефон', `Эталон ${want}, в карточке ${shown}`, 'error');
  }
  checks.push({
    id: 'phone',
    label: 'Телефон',
    expected: want,
    got: shown,
    state: hit ? 'match' : 'miss',
    points,
    max,
  });
  return points;
}

function scoreInjured(
  facts: TicketFacts,
  got: { hasInjured: boolean | null; count: number | null },
  findings: LessonFinding[],
  checks: FieldCheck[],
): number {
  const max = 6;
  const expected =
    !facts.injuredKnown
      ? 'точно неизвестно'
      : facts.hasInjured
        ? facts.injuredCount != null
          ? `есть, ${facts.injuredCount}`
          : 'есть'
        : 'нет';
  const gotText =
    got.hasInjured == null ? '—' : got.hasInjured ? `есть${got.count != null ? `, ${got.count}` : ''}` : 'нет';
  if (got.hasInjured == null) {
    note(findings, 'required-injured', 'Пострадавшие', 'Группа не заполнена', 'error');
    checks.push({ id: 'injured', label: 'Пострадавшие', expected, got: '—', state: 'empty', points: 0, max });
    return 0;
  }
  if (!facts.injuredKnown) {
    checks.push({ id: 'injured', label: 'Пострадавшие', expected, got: gotText, state: 'match', points: max, max });
    return max;
  }
  let points = 0;
  if (Boolean(got.hasInjured) === Boolean(facts.hasInjured)) {
    points = 4;
    if (facts.injuredCount == null || got.count === facts.injuredCount || (!facts.hasInjured && (got.count === 0 || got.count == null))) {
      points = max;
    }
  }
  if (points < max) {
    note(findings, 'injured-miss', 'Пострадавшие', `По билету: ${expected}`, points === 0 ? 'error' : 'warning');
  }
  checks.push({
    id: 'injured',
    label: 'Пострадавшие',
    expected,
    got: gotText,
    state: checkState(points, max, gotText),
    points,
    max,
  });
  return points;
}

function scoreClassifier(
  result: Arm112PracticalResult,
  findings: LessonFinding[],
  checks: FieldCheck[],
): { points: number } {
  const max = 6;
  const expectedNo = String(result.classifier.expected.number);
  const expectedLabel = `${expectedNo} ${result.classifier.expected.finalType}`.trim();
  const selected = result.card.classification.selectedTypes.map((item) => item.trim()).filter(Boolean);
  const numbers = result.card.classification.classifier.matchedNumbers.map(String);
  const chosen =
    selected.length > 0 ||
    numbers.length > 0 ||
    Boolean(result.classifier.groupCode && result.classifier.priznak1);
  if (!chosen) {
    note(findings, 'classifier-empty', 'Классификатор', 'Тип происшествия не выбран', 'error');
    checks.push({
      id: 'classifier',
      label: 'Классификатор',
      expected: expectedLabel,
      got: '—',
      state: 'empty',
      points: 0,
      max,
    });
    return { points: 0 };
  }
  const gotLabel = [...new Set([...selected, ...numbers])].slice(0, 4).join(', ') || '—';
  const expectedP1 = (result.classifier.expected.priznak1 || '').trim().toLowerCase();
  const gotP1 = (result.classifier.priznak1 || '').trim().toLowerCase();
  const hay = `${selectedHay(selected)} ${gotP1} ${numbers.join(' ')}`.toLowerCase();
  let points = 0;
  if (numbers.includes(expectedNo) || selected.some((item) => item.includes(expectedNo))) {
    points = max;
  } else if (expectedP1 && (gotP1 === expectedP1 || hay.includes(expectedP1))) {
    points = max;
  } else if (medicalClose(expectedNo, hay, selected, numbers)) {
    points = 5;
    note(findings, 'classifier-partial', 'Классификатор', `Тип близкий, эталон ${expectedNo}`, 'warning');
  } else if (
    result.classifier.groupCode &&
    result.classifier.groupCode === result.classifier.expected.groupCode &&
    result.classifier.priznak1
  ) {
    points = 4;
    note(findings, 'classifier-partial', 'Классификатор', `Группа совпала, эталон ${expectedNo} не выбран`, 'warning');
  } else {
    note(findings, 'classifier-miss', 'Классификатор', `Эталон ${expectedLabel}`, 'error');
  }
  checks.push({
    id: 'classifier',
    label: 'Классификатор',
    expected: expectedLabel,
    got: gotLabel,
    state: checkState(points, max, gotLabel === '—' ? '' : gotLabel),
    points,
    max,
  });
  return { points };
}

function medicalClose(expectedNo: string, hay: string, selected: string[], numbers: string[]): boolean {
  if (!expectedNo.startsWith('22') && expectedNo !== '17040100' && expectedNo !== '17040200') {
    return false;
  }
  const blob = `${hay} ${selected.join(' ')} ${numbers.join(' ')}`;
  return /103|скор|цэмп|травм|паден|медицин|2253|2211|2209|17040/.test(blob);
}

function scoreServices(
  facts: TicketFacts,
  result: Arm112PracticalResult,
  findings: LessonFinding[],
  checks: FieldCheck[],
): { points: number; missing: TrainingScenario['services'] } {
  const max = 6;
  const names = result.services.map((item) => item.name);
  const missing = facts.services.filter((kind) => !names.some((name) => serviceHit(name, kind)));
  const expected = serviceLabels(facts.services) || '—';
  const got = names.join(', ') || '—';
  if (!facts.services.length) {
    checks.push({ id: 'services', label: 'Службы', expected, got, state: names.length ? 'match' : 'empty', points: names.length ? max : 0, max });
    return { points: names.length ? max : 0, missing };
  }
  const hits = facts.services.length - missing.length;
  const points = Math.round((max * hits) / facts.services.length);
  if (missing.length) {
    note(findings, 'services-missing', 'Службы', `Не направлены: ${serviceLabels(missing)}`, 'error');
  }
  checks.push({
    id: 'services',
    label: 'Службы',
    expected,
    got,
    state: checkState(points, max, names.join('')),
    points,
    max,
  });
  return { points, missing };
}

function grammarNote(text: string): string | null {
  const t = text.trim();
  if (!t) {
    return null;
  }
  if (t.length > 18 && t === t.toUpperCase() && /[А-ЯA-Z]/.test(t)) {
    return 'Описание набрано капсом — в карточке пишут обычным регистром.';
  }
  if (/\s{3,}/.test(t)) {
    return 'В описании сбиты пробелы.';
  }
  if (t.length > 40 && t.split(/\s+/).length > 8 && !/[.!?…,;:]/.test(t)) {
    return 'В описании нет знаков препинания — проверьте формулировку.';
  }
  if (/(.)\1{4,}/.test(t)) {
    return 'В описании повтор одних и тех же букв — проверьте опечатки.';
  }
  if (/[а-яё]{3,}\s+[а-яё]{3,}/.test(t) && t[0] === t[0].toLowerCase() && /[а-яё]/.test(t[0])) {
    return 'Описание начинается со строчной — в карточке первую букву пишут заглавной.';
  }
  return null;
}
