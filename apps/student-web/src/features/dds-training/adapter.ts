import { SERVICE_LABEL, type ServiceKind, type TrainingScenario } from '../../data/scenarios';
import type { IncidentCard, ServiceAssignment } from '../arm112-simulator/model/arm112-models';
import { createEmptyIncidentCard } from '../arm112-simulator/model/factories';
import { ddsClassLabel, ddsTags, primaryServiceCode, splitDdsAddress } from './display';
import { incomingFromFacts, factsFromScenario, serviceCaption, type DdsDraft } from './incoming-card';
import type { DdsIncidentCardViewModel, DdsServiceChip, DdsServiceStatus } from './types';

function stampNow(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function clockHm(): string {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function chip(kind: ServiceKind, selected: boolean): DdsServiceChip {
  const status: DdsServiceStatus = selected ? 'Добавлена' : 'Не принято';
  return {
    id: kind,
    label: serviceCaption(kind),
    shortLabel: SERVICE_LABEL[kind],
    status,
    statusTime: selected ? clockHm() : '',
    editable: true,
    history: selected
      ? [
          {
            at: stampNow(),
            status: 'Добавлена',
            comment: 'Передано оператором 112',
            naryad: '',
            operatorLabel: 'оп. 112',
          },
        ]
      : [],
  };
}

function chipsFor(selected: ServiceKind[]): DdsServiceChip[] {
  const kinds: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];
  return kinds.map((kind) => chip(kind, selected.includes(kind)));
}

function chipsToAssignments(chips: DdsServiceChip[]): ServiceAssignment[] {
  return chips
    .filter((item) => item.status !== 'Не принято')
    .map((item) => ({
      name: item.label,
      autoAssigned: true,
      visMark: false,
      isMainForType: item.id === 'fire' || item.id === 'police',
      statusHistory: item.history.map((event) => ({
        status: event.status,
        at: event.at,
        comment: event.comment,
        orderNumber: event.naryad,
      })),
    }));
}

export function cardFromDraft(
  scenario: TrainingScenario,
  draft: DdsDraft,
  number: string,
  createdAt: string,
  cardId = `dds-${scenario.id}`,
): DdsIncidentCardViewModel {
  const services = chipsFor(draft.services);
  const typeCode = primaryServiceCode(draft.services.length ? draft.services : scenario.services);
  const typeTitle = `Происшествие ${typeCode}`;
  const address = splitDdsAddress(draft.address);
  const incident: IncidentCard = createEmptyIncidentCard({
    number,
    createdAt,
    operatorLabel: 'Оператор 112',
    armNumber: '4',
    caller: {
      familyNameAndGivenName: draft.callerName,
      callerStatus: null,
      aon: draft.callerPhone,
      providedNumber: draft.callerPhone,
      phoneOnScene: draft.callerPhone,
      foreignNumber: false,
      communicationChannel: '',
      foreignLanguageCall: false,
      noSimCard: false,
    },
    address: {
      searchLine: draft.address,
      country: 'Россия',
      subject: '',
      settlement: '',
      object: '',
      okrug: address.okrug,
      district: '',
      street: '',
      house: '',
      corpus: '',
      stroenie: '',
      apartment: '',
      entrance: '',
      floor: '',
      code: '',
      descriptiveAddress: draft.address,
      latitude: '',
      longitude: '',
    },
    classification: {
      selectedTypes: [typeTitle],
      searchQuery: '',
      additionalTypeQuery: '',
      answersByType: {},
      refusalOfResponse: false,
      classifier: {
        groupCode: null,
        priznak1: null,
        priznak2: [],
        priznak3: [],
        extraTags: [],
        matchedNumbers: scenario.classifierNumber ? [scenario.classifierNumber] : [],
      },
    },
    injured: { hasInjured: draft.injured !== 'Нет', count: draft.injured === 'Нет' ? 0 : null },
    descriptionFromCaller: draft.description,
    services: chipsToAssignments(services),
  });
  return {
    id: cardId,
    scenarioId: scenario.id,
    number,
    createdAt,
    operatorArm: 'АРМ 4',
    operatorName: 'Оператор 112',
    typeCode,
    typeTitle,
    description: draft.description,
    addressLine: draft.address,
    okrug: address.okrug,
    injured: draft.injured,
    callerName: draft.callerName,
    tags: ddsTags(draft.description, draft.address, draft.injured, draft.services),
    classifierClass: ddsClassLabel(scenario, draft.description, draft.services),
    visClass: '',
    aon: draft.callerPhone,
    providedPhone: draft.callerPhone,
    phoneOnSite: draft.callerPhone,
    services,
    source: [{ kind: 'scenario', ref: scenario.id }],
    incident,
    classifierNumber: scenario.classifierNumber ?? null,
    classifierRow: null,
  };
}

export function incidentFromViewModel(card: DdsIncidentCardViewModel): IncidentCard {
  return {
    ...card.incident,
    services: chipsToAssignments(card.services),
  };
}

export function buildIncoming(scenario: TrainingScenario, cardId?: string): {
  card: DdsIncidentCardViewModel;
  facts: ReturnType<typeof factsFromScenario>;
  draft: DdsDraft;
  defects: ReturnType<typeof incomingFromFacts>['defects'];
} {
  const facts = factsFromScenario(scenario);
  const seed = (scenario.ticketNo ?? 1) * 10 + (scenario.situationNo ?? 1);
  const incoming = incomingFromFacts(facts, scenario.difficulty, seed);
  const number = String(36000000 + seed);
  const createdAt = stampNow();
  return {
    facts,
    draft: incoming.draft,
    defects: incoming.defects,
    card: cardFromDraft(scenario, incoming.draft, number, createdAt, cardId),
  };
}

export function journalTime(card: DdsIncidentCardViewModel): { date: string; time: string } {
  const [date, time] = card.createdAt.split(' ');
  const parts = (date ?? '').split('.');
  const short = parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2].slice(-2)}` : (date ?? '');
  return { date: short, time: time ?? '' };
}
