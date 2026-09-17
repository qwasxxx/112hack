import type {
  CallSession,
  IncidentAddress,
  IncidentCard,
  CallerInfo,
} from './arm112-models';

function emptyCaller(): CallerInfo {
  return {
    familyNameAndGivenName: '',
    callerStatus: null,
    aon: '',
    providedNumber: '',
    phoneOnScene: '',
    foreignNumber: false,
    communicationChannel: '',
    foreignLanguageCall: false,
    noSimCard: false,
  };
}

function emptyAddress(): IncidentAddress {
  return {
    searchLine: 'Москва',
    country: 'Москва',
    subject: 'Москва',
    settlement: '',
    object: '',
    okrug: '',
    district: '',
    street: '',
    house: '',
    corpus: '',
    stroenie: '',
    apartment: '',
    entrance: '',
    floor: '',
    code: '',
    descriptiveAddress: '',
    latitude: '',
    longitude: '',
  };
}

export function createEmptyIncidentCard(partial?: Partial<IncidentCard>): IncidentCard {
  return {
    number: '',
    createdAt: '',
    operatorLabel: '',
    armNumber: '',
    status: 'Зарегистрирована',
    caller: emptyCaller(),
    address: emptyAddress(),
    classification: {
      selectedTypes: [],
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
        matchedNumbers: [],
      },
    },
    injured: { hasInjured: null, count: null },
    flags: {
      notOnSceneOrAmbulanceRefusal: false,
      noAccessOrBlocked: false,
      noContact: false,
      droppedCall: false,
      createdManually: false,
      importantIncident: false,
      foreignSystemName: '',
    },
    descriptionFromCaller: '',
    descriptionCharLimit: 1999,
    services: [],
    otrabotki: [],
    links: [],
    timer: { elapsedSeconds: 0, running: false, exceeded: false },
    ...partial,
  };
}

export function createIdleCallSession(scenarioId: string): CallSession {
  return {
    id: '',
    scenarioId,
    telephonyStatus: 'доступен',
    phase: 'ожидание',
    incomingNumber: '',
    card: createEmptyIncidentCard(),
  };
}
