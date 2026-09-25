import { SERVICE_LABEL, type TrainingScenario } from '../data/scenarios';
import type { IncidentCard } from '../features/arm112-simulator/model/arm112-models';
import { cardAddressLine } from './address-match';

export type TicketFacts = {
  address: string;
  situation: string;
  what: string;
  callerFio: string;
  callerRole: string;
  injuredName: string;
  phone: string;
  injuredKnown: boolean;
  hasInjured: boolean | null;
  injuredCount: number | null;
  callerStatus: string;
  house: string;
  street: string;
  corpus: string;
  apartment: string;
  entrance: string;
  floor: string;
  services: TrainingScenario['services'];
};

const FIO =
  /[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}/g;

export function digitsPhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function last10(value: string): string {
  const digits = digitsPhone(value);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function phonesMatch(expected: string, got: string): boolean {
  const want = last10(expected);
  const have = last10(got);
  if (!want) {
    return true;
  }
  if (!have) {
    return false;
  }
  if (want === have) {
    return true;
  }
  if (want.length < 10 || have.length < 10 || want.length !== have.length) {
    return false;
  }
  let slipped = 0;
  for (let i = 0; i < want.length; i += 1) {
    if (want[i] !== have[i]) {
      slipped += 1;
    }
  }
  return slipped <= 1;
}

export function ticketFactsFrom(scenario: TrainingScenario): TicketFacts {
  const situation = (scenario.situation ?? scenario.summary ?? '').replace(/\u00a0/g, ' ');
  const address = scenario.address ?? '';
  const phoneMatch = situation.match(
    /(?:тел\.?\s*)?(?:\+?7|8)?[\s\-()]*9\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|\b9\d{9}\b|\b\d{10,11}\b/,
  );
  const phone = phoneMatch ? digitsPhone(phoneMatch[0]) : '';
  const people = namesFromTicket(situation);
  const injured = parseInjured(situation);
  return {
    address,
    situation,
    what: situationCore(situation, people.injuredName || people.callerFio, phone),
    callerFio: people.callerFio,
    callerRole: people.callerRole,
    injuredName: people.injuredName,
    phone,
    injuredKnown: injured.known,
    hasInjured: injured.hasInjured,
    injuredCount: injured.count,
    callerStatus: callerStatusFrom(situation),
    house: pick(address, /(?:дом\.?|д\.?|№)\s*(\d+[а-яa-z]?)/i),
    street: pick(address, /(?:ул\.|улица)\s+([^,;(]+)/i),
    corpus: pick(address, /(?:корп\.?|корпус)\s*(\d+[а-яa-z]?)/i),
    apartment: pick(address, /(?:кв\.?|квартира)\s*(\d+[а-яa-z]?)/i),
    entrance: pick(address, /(?:под\.?|подъезд)\s*(\d+)/i),
    floor: pick(address, /(?:эт\.?|этаж)\s*(\d+)/i) || pick(situation, /(\d+)[-\s]*м этаж/i),
    services: scenario.services,
  };
}

export function cardPhones(card: IncidentCard): string[] {
  return [card.caller.providedNumber, card.caller.phoneOnScene, card.caller.aon]
    .map(last10)
    .filter((item) => item.length >= 10 && item !== '4995503456');
}

export function serviceLabels(kinds: TrainingScenario['services']): string {
  return kinds.map((item) => SERVICE_LABEL[item]).join(', ');
}

export function filledAddress(card: IncidentCard): boolean {
  const a = card.address;
  return Boolean(
    a.street.trim() ||
      a.house.trim() ||
      a.descriptiveAddress.trim() ||
      a.settlement.trim() ||
      a.district.trim() ||
      (a.searchLine.trim() && a.searchLine.trim() !== 'Москва'),
  );
}

export function cardView(card: IncidentCard) {
  return {
    address: cardAddressLine(card.address),
    house: card.address.house,
    street: card.address.street,
    corpus: card.address.corpus,
    apartment: card.address.apartment,
    entrance: card.address.entrance,
    floor: card.address.floor,
    description: card.descriptionFromCaller,
    fio: card.caller.familyNameAndGivenName,
    phones: cardPhones(card),
    status: card.caller.callerStatus,
    injured: card.injured,
    services: card.services.map((item) => item.name),
  };
}

export function incomingNumberFor(scenario: TrainingScenario): string {
  const ten = last10(ticketFactsFrom(scenario).phone);
  if (ten.length < 10) {
    return '+7 (499) 550-34-56';
  }
  return `+7 (${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6, 8)}-${ten.slice(8)}`;
}

export function incomingChannelFor(
  scenario: TrainingScenario,
  kind: 'training' | 'exam' = 'training',
): 'call' | 'sms' {
  if (kind === 'exam') {
    return 'call';
  }
  return scenario.situationNo === 2 ? 'sms' : 'call';
}

export function smsFromTicket(scenario: TrainingScenario): string {
  const facts = ticketFactsFrom(scenario);
  const body = (facts.situation || facts.what).replace(/\s+/g, ' ').trim();
  const address = facts.address.replace(/\s+/g, ' ').trim();
  const lines = [body || 'Нужна помощь, 112.'];
  if (address && !body.toLowerCase().includes(address.toLowerCase().slice(0, 18))) {
    lines.push(`Адрес: ${address}`);
  }
  return lines.join('\n');
}

function situationCore(situation: string, fio: string, phone: string): string {
  if (/уличн[а-яё]*\s+освещен|горит\s+уличн/i.test(situation)) {
    return 'Горит уличное освещение на МКАД — фонари светят. Это не пожар и не квартира.';
  }
  let text = situation;
  if (fio) {
    text = text.replace(fio, ' ');
  }
  if (phone) {
    text = text.replace(/\d[\d\s\-()]{8,}\d/g, ' ');
  }
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/пострадавших нет|без пострадавших|б\/п|б\/р/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInjured(situation: string): { known: boolean; hasInjured: boolean | null; count: number | null } {
  const t = situation.toLowerCase();
  if (/о пострадавших.{0,24}нет|информации нет/.test(t) && !/\d+\s*пострадав/.test(t)) {
    return { known: false, hasInjured: null, count: null };
  }
  const counted = t.match(/(\d+)\s*пострадав/);
  if (counted) {
    return { known: true, hasInjured: Number(counted[1]) > 0, count: Number(counted[1]) };
  }
  if (/пострадавших нет|без пострадавших|пострадавших людей нет|пострадавших не видят|б\/п/.test(t)) {
    return { known: true, hasInjured: false, count: 0 };
  }
  if (
    /пострадал|ожог|без сознания|травм|кров|задыха|утоп|нож|упал|отек|отёк|перелом|ушибли|велосипед/.test(
      t,
    )
  ) {
    return { known: true, hasInjured: true, count: null };
  }
  return { known: false, hasInjured: null, count: null };
}

export function namesFromTicket(situation: string): { callerFio: string; callerRole: string; injuredName: string } {
  const names = situation.match(FIO) ?? [];
  let callerRole = '';
  if (/вызывает мама|звонит мама/i.test(situation)) {
    callerRole = 'мама';
  } else if (/вызывает отец|звонит отец/i.test(situation)) {
    callerRole = 'отец';
  } else if (/вызывает супруг/i.test(situation)) {
    callerRole = 'супруг';
  } else if (/подруга/i.test(situation)) {
    callerRole = 'подруга';
  } else if (/соседк|сосед/i.test(situation)) {
    callerRole = 'сосед';
  } else if (/бабушка/i.test(situation)) {
    callerRole = 'бабушка';
  }
  const injuredMatch =
    situation.match(/ребенок[^.]{0,48}?([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+)+)/i) ||
    situation.match(/([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+)+)\s+упал/i);
  const injuredName = injuredMatch?.[1]?.trim() ?? '';
  const afterCall = situation.match(
    /вызывает(?:\s+себе)?[,\s]+([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2})/,
  );
  const calledName = afterCall?.[1]?.trim() ?? '';
  const roleWords = new Set(['мама', 'папа', 'отец', 'мать', 'супруг', 'супруга', 'сосед', 'соседка', 'подруга', 'бабушка']);
  let callerFio = '';
  if (/вызывает себе|звонит сама/.test(situation.toLowerCase()) && names.length) {
    callerFio = names[0]?.trim() ?? '';
  } else if (calledName && !roleWords.has(calledName.toLowerCase()) && calledName !== injuredName) {
    callerFio = calledName;
  } else if (!callerRole) {
    callerFio = names.filter((item) => item !== injuredName).at(-1)?.trim() ?? '';
  }
  return { callerFio, callerRole, injuredName };
}

function callerStatusFrom(situation: string): string {
  const t = situation.toLowerCase();
  if (/очевидец|прохожий|работник|посетитель|проезжала мимо/.test(t)) {
    return 'очевидец';
  }
  if (/вызывает мама|вызывает отец|вызывает супруг|дочь,|бабушка/.test(t)) {
    return 'родственник';
  }
  if (/сосед/.test(t)) {
    return 'знакомый';
  }
  if (/подруга/.test(t)) {
    return 'знакомый';
  }
  if (/ребенок 4 года|ребенок \d/.test(t) && /вызывает/.test(t)) {
    return 'родственник';
  }
  if (/вызывает себе|звонит сама/.test(t)) {
    return 'пострадавший';
  }
  return '';
}

function pick(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[1]?.trim() ?? '';
}
