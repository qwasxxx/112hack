import { getScenario, type TrainingScenario } from '../../data/scenarios';
import { assignedServices, matchRecords } from '../arm112-simulator/data/classifier-runtime';
import { trainingBindingFor } from '../arm112-simulator/data/training-bindings';
import type { IncidentCard, ServiceAssignment } from '../arm112-simulator/model/arm112-models';
import { createEmptyIncidentCard } from '../arm112-simulator/model/factories';
import type { DdsIncidentCardViewModel, DdsServiceChip, DdsServiceStatus } from './types';

type ScreenCard = Omit<DdsIncidentCardViewModel, 'incident' | 'classifierNumber' | 'classifierRow'>;

function chip(
  id: string,
  label: string,
  shortLabel: string,
  editable: boolean,
  status: DdsServiceStatus = 'Добавлена',
  statusTime = '11:14',
): DdsServiceChip {
  return {
    id,
    label,
    shortLabel,
    status,
    statusTime,
    editable,
    history: [
      {
        at: '17.09.2026 11:14:04',
        status: 'Добавлена',
        comment: '',
        naryad: '',
        operatorLabel: 'оп. 0',
      },
    ],
  };
}

function defaultServices(editableId: string): DdsServiceChip[] {
  return [
    chip('oati', 'ОАТИ', 'ОАТИ', false),
    chip('tin', 'Поселение ТиНАО', 'Поселение Ти…', false),
    chip(editableId, 'Поселение Вороновское', 'Поселение Во…', true),
    chip('s101', 'Служба 101', 'Служба 101', false),
    chip('s104', 'Служба 104', 'Служба 104', false),
    chip('s102', 'Служба 102', 'Служба 102', false),
    chip('gkh', 'Деп. ЖКХ', 'Деп. ЖКХ', false),
    chip('cemp', 'ЦЭМП', 'ЦЭМП', false),
    chip('codd', 'ЦОДД', 'ЦОДД', false),
    chip('mosbez', 'Мос.Без.', 'Мос.Без.', false),
    chip('moslift', 'Мослифт', 'Мослифт', false),
  ];
}

const SCREEN_CARDS: ScreenCard[] = [
  {
    id: 'dds-36814845',
    scenarioId: 'apartment-fire',
    number: '36814845',
    createdAt: '17.09.2026 11:12:43',
    operatorArm: 'АРМ 4',
    operatorName: 'УМЦ О n',
    typeCode: '101',
    typeTitle: 'Пожар в квартире',
    description: 'Пожар в квартире',
    addressLine: 'Россия, Москва, (ТАО, Вороновское)',
    okrug: 'Троицкий административный округ',
    injured: 'Нет',
    callerName: '',
    tags: 'Дом . Открытое пламя / Дым (дом), Запах гари (дом) . Дом многоквартирный . квартира . Есть угроза людям . Есть газификация .',
    classifierClass: 'пожар: квартира ;',
    visClass: '',
    aon: '',
    providedPhone: '',
    phoneOnSite: '',
    services: defaultServices('voronovskoe'),
    source: [
      { kind: 'dds-screenshot', ref: 'СКРИНШОТ ДДСГСИ image4–7 карточка 36814845' },
      { kind: 'scenario', ref: 'apartment-fire' },
      { kind: 'classifier', ref: 'Лист1 1050101 пожар квартира MCHS' },
    ],
  },
  {
    id: 'dds-36814848',
    scenarioId: 'road-accident',
    number: '36814848',
    createdAt: '17.09.2026 11:16:53',
    operatorArm: 'АРМ 4',
    operatorName: 'УМЦ О n',
    typeCode: 'ДТП',
    typeTitle: 'ДТП',
    description: 'ДТП, столкнулись 2 автомобиля гс номера 223 АНО, разлитиe топлива, есть пострадавшие',
    addressLine: 'Москва, (ТАО, Вороновское), Троицкий административный округ',
    okrug: 'Троицкий административный округ',
    injured: 'Нет',
    callerName: '',
    tags: 'ДТП . столкновение . есть пострадавшие .',
    classifierClass: 'ДТП;',
    visClass: '',
    aon: '',
    providedPhone: '',
    phoneOnSite: '',
    services: defaultServices('voronovskoe-dtp'),
    source: [
      { kind: 'dds-screenshot', ref: 'СКРИНШОТ ДДСГСИ image5 строка 36814848' },
      { kind: 'scenario', ref: 'road-accident' },
      { kind: 'classifier', ref: 'Лист1 2020000 ДТП Police' },
    ],
  },
  {
    id: 'dds-36814844',
    scenarioId: 'lost-child',
    number: '36814844',
    createdAt: '17.09.2026 11:11:01',
    operatorArm: 'АРМ 4',
    operatorName: 'УМЦ О n',
    typeCode: '',
    typeTitle: 'ТЕСТ 1',
    description: 'ТЕСТ 1',
    addressLine: '',
    okrug: '',
    injured: 'Нет',
    callerName: '',
    tags: '',
    classifierClass: '',
    visClass: '',
    aon: '',
    providedPhone: '',
    phoneOnSite: '',
    services: defaultServices('voronovskoe-test'),
    source: [
      { kind: 'dds-screenshot', ref: 'СКРИНШОТ ДДСГСИ image3/4 строка 36814844 ТЕСТ 1' },
      { kind: 'scenario', ref: 'lost-child — очередь сценария, карточка из журнала ДДС, не классификатор 18070000' },
    ],
  },
];

function chipsToAssignments(chips: DdsServiceChip[]): ServiceAssignment[] {
  return chips.map((item) => ({
    name: item.label,
    autoAssigned: true,
    visMark: false,
    isMainForType: item.label === 'Служба 101' || item.label === 'Служба 102',
    statusHistory: item.history.map((event) => ({
      status: event.status,
      at: event.at,
      comment: event.comment,
      orderNumber: event.naryad,
    })),
  }));
}

function hydrate(card: ScreenCard): DdsIncidentCardViewModel {
  const scenario = getScenario(card.scenarioId);
  const useBinding = Boolean(scenario) && card.number !== '36814844';
  const binding = scenario && useBinding ? trainingBindingFor(scenario) : null;
  const matched = binding
    ? matchRecords({
        groupCode: binding.classifier.groupCode,
        priznak1: binding.classifier.priznak1,
        priznak2: binding.classifier.priznak2,
        priznak3: binding.classifier.priznak3,
        finalType: binding.classifier.finalType,
      })
    : [];
  const auto = matched.length
    ? assignedServices(matched, {
        noAccess: false,
        threatToPeople: card.tags.includes('угроза людям'),
        victims: card.tags.includes('пострадавшие') || card.injured !== 'Нет',
        notOnScene: false,
        offense: false,
        gasification: card.tags.includes('газификация'),
        roadBlocked: false,
      })
    : [];
  const screenshotServices = chipsToAssignments(card.services);
  const extraAuto = auto
    .filter((item) => !screenshotServices.some((row) => row.name === item.name))
    .map((item) => ({
      name: item.name,
      autoAssigned: true,
      visMark: false as const,
      isMainForType: item.isMainForType,
      statusHistory: [] as ServiceAssignment['statusHistory'],
    }));
  const incident: IncidentCard = createEmptyIncidentCard({
    number: card.number,
    createdAt: card.createdAt,
    operatorLabel: card.operatorName,
    armNumber: '4',
    caller: {
      familyNameAndGivenName: card.callerName,
      callerStatus: null,
      aon: card.aon,
      providedNumber: card.providedPhone,
      phoneOnScene: card.phoneOnSite,
      foreignNumber: false,
      communicationChannel: '',
      foreignLanguageCall: false,
      noSimCard: false,
    },
    address: {
      searchLine: card.addressLine,
      country: 'Россия',
      subject: 'Москва',
      settlement: '',
      object: '',
      okrug: card.okrug,
      district: '',
      street: '',
      house: '',
      corpus: '',
      stroenie: '',
      apartment: '',
      entrance: '',
      floor: '',
      code: '',
      descriptiveAddress: card.addressLine,
      latitude: '',
      longitude: '',
    },
    classification: {
      selectedTypes: card.typeTitle ? [card.typeTitle] : [],
      searchQuery: '',
      additionalTypeQuery: '',
      answersByType: {},
      refusalOfResponse: false,
      classifier: {
        groupCode: binding?.classifier.groupCode ?? null,
        priznak1: binding?.classifier.priznak1 ?? null,
        priznak2: binding?.classifier.priznak2 ?? [],
        priznak3: binding?.classifier.priznak3 ?? [],
        extraTags: [],
        matchedNumbers: binding ? [binding.classifier.number] : [],
      },
    },
    injured: { hasInjured: card.injured !== 'Нет', count: card.injured === 'Нет' ? 0 : null },
    descriptionFromCaller: card.description,
    services: [...screenshotServices, ...extraAuto],
  });
  return {
    ...card,
    incident,
    classifierNumber: binding?.classifier.number ?? null,
    classifierRow: binding?.classifier.row ?? null,
  };
}

export function incidentFromViewModel(card: DdsIncidentCardViewModel): IncidentCard {
  return {
    ...card.incident,
    services: chipsToAssignments(card.services),
  };
}

export function buildDdsQueue(scenario: TrainingScenario): DdsIncidentCardViewModel[] {
  const preferred = SCREEN_CARDS.filter((item) => item.scenarioId === scenario.id);
  const rest = SCREEN_CARDS.filter((item) => item.scenarioId !== scenario.id);
  return [...preferred, ...rest].map((item) => hydrate(structuredClone(item)));
}

export function journalTime(card: DdsIncidentCardViewModel): { date: string; time: string } {
  const [date, time] = card.createdAt.split(' ');
  const parts = (date ?? '').split('.');
  const short = parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2].slice(-2)}` : (date ?? '');
  return { date: short, time: time ?? '' };
}
