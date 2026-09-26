import { callerTruthFrom } from '../data/caller-truth';
import type { FactPriorityBundle } from '../data/fact-priority';
import { SERVICE_LABEL, type TrainingScenario } from '../data/scenarios';
import type { IncidentCard } from '../features/arm112-simulator/model/arm112-models';
import { cardAddressLine } from './address-match';
import {
  addressParts,
  callerStatusFrom,
  extractPhoneDigits,
  namesFromTicket,
  parseInjured,
  situationCore,
} from './ticket-parse';

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
  unknownFields?: string[];
  childInvolved?: boolean;
  facts?: FactPriorityBundle;
};

export { namesFromTicket } from './ticket-parse';
export {
  callerEmotionProfile,
  callerOpeningFrom,
  callerTruthFrom,
  classifyIncident,
  validateCallerTruth,
} from '../data/caller-truth';
export type { CallerEmotionProfile, CallerTruth, IncidentClass, VictimFactModel, LocationFactModel, OpeningFactSet } from '../data/caller-truth';
export type {
  CallerFact,
  FactPriorityBundle,
  FactPriorityLevel,
  FireFactProfile,
  TrafficFactProfile,
  WaterFactProfile,
  MedicalFactProfile,
  GasFactProfile,
  ViolenceFactProfile,
} from '../data/fact-priority';
export { hasCriticalTopic, hasImportantTopic } from '../data/fact-priority';

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
  const phone = extractPhoneDigits(situation);
  const people = namesFromTicket(situation);
  const injured = parseInjured(situation);
  const parts = addressParts(address, situation);
  const truth = callerTruthFrom(scenario);
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
    house: parts.house,
    street: parts.street,
    corpus: parts.corpus,
    apartment: parts.apartment,
    entrance: parts.entrance,
    floor: parts.floor,
    services: scenario.services,
    unknownFields: truth.unknownFields,
    childInvolved: truth.childInvolved,
    facts: truth.facts,
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
