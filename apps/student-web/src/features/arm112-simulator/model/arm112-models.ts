/** Source labels kept in Russian exactly as they appear in ARM-112. */

export const TELEPHONY_STATUSES = ['доступен', 'недоступен', 'не подключен', 'ошибка'] as const;
export type TelephonyStatus = (typeof TELEPHONY_STATUSES)[number];

export const CALLER_STATUSES = [
  'очевидец',
  'пострадавший',
  'родственник',
  'знакомый',
  'ребенок',
  'участник',
] as const;
export type CallerStatus = (typeof CALLER_STATUSES)[number];

/** Card statuses named in the instruction / journal screenshots. */
export const INCIDENT_CARD_STATUSES = [
  'Зарегистрирована',
  'Завершена',
  'Отработана',
  'Проверена',
  'Не оповещено',
  'Не завершено',
  'Отказ',
  'Постобработка вызова',
] as const;
export type IncidentCardStatus = (typeof INCIDENT_CARD_STATUSES)[number];

export type SubscriberData = {
  receivedAt: string;
  operatorSvyazi: string;
  fioAbonenta: string;
  dateOfBirth: string;
  adresAbonenta: string;
};

export type CallerInfo = {
  familyNameAndGivenName: string;
  callerStatus: CallerStatus | null;
  aon: string;
  providedNumber: string;
  phoneOnScene: string;
  foreignNumber: boolean;
  communicationChannel: string;
  foreignLanguageCall: boolean;
  subscriberData?: SubscriberData;
  noSimCard: boolean;
};

export type IncidentAddress = {
  searchLine: string;
  country: string;
  subject: string;
  settlement: string;
  object: string;
  okrug: string;
  district: string;
  street: string;
  house: string;
  corpus: string;
  stroenie: string;
  apartment: string;
  entrance: string;
  floor: string;
  code: string;
  descriptiveAddress: string;
  latitude: string;
  longitude: string;
};

export type QuestionnaireAnswer = {
  questionLabel: string;
  values: string[];
};

export type ClassifierPath = {
  groupCode: string | null;
  priznak1: string | null;
  priznak2: string[];
  priznak3: string[];
  extraTags: string[];
  matchedNumbers: string[];
};

export type IncidentClassification = {
  selectedTypes: string[];
  searchQuery: string;
  additionalTypeQuery: string;
  answersByType: Record<string, QuestionnaireAnswer[]>;
  refusalOfResponse: boolean;
  classifier: ClassifierPath;
};

export type ServiceStatusEntry = {
  status: string;
  at: string;
  comment: string;
  orderNumber: string;
};

export type ServiceAssignment = {
  name: string;
  autoAssigned: boolean;
  visMark: boolean;
  isMainForType: boolean;
  statusHistory: ServiceStatusEntry[];
};

export type TimerState = {
  elapsedSeconds: number;
  running: boolean;
  exceeded: boolean;
};

export type InjuredState = {
  /** 2026 screenshot uses a single «Пострадавшие» control; 2019 uses Нет/Есть. */
  hasInjured: boolean | null;
  count: number | null;
};

export type CardFlags = {
  notOnSceneOrAmbulanceRefusal: boolean;
  noAccessOrBlocked: boolean;
  noContact: boolean;
  droppedCall: boolean;
  createdManually: boolean;
  importantIncident: boolean;
  foreignSystemName: string;
};

export type OtrabotkaRow = {
  operatorArm: string;
  dateTime: string;
  service: string;
  kudaZvonili: string;
  phone: string;
  whoAccepted: string;
  essence: string;
};

export type CardLink = {
  relatedCardNumber: string;
  role: 'главная' | 'подчиненная';
};

export type IncidentCard = {
  number: string;
  createdAt: string;
  operatorLabel: string;
  armNumber: string;
  status: IncidentCardStatus;
  caller: CallerInfo;
  address: IncidentAddress;
  classification: IncidentClassification;
  injured: InjuredState;
  flags: CardFlags;
  descriptionFromCaller: string;
  descriptionCharLimit: 1999;
  services: ServiceAssignment[];
  otrabotki: OtrabotkaRow[];
  links: CardLink[];
  timer: TimerState;
};

export type CallSession = {
  id: string;
  scenarioId: string;
  telephonyStatus: TelephonyStatus;
  phase:
    | 'ожидание'
    | 'входящий звонок'
    | 'активный вызов'
    | 'заполнение карточки'
    | 'просмотр карточки'
    | 'завершена';
  incomingNumber: string;
  card: IncidentCard;
};

/**
 * Training wrapper used only by the simulator feature.
 * Catalog `TrainingScenario` in `src/data/scenarios.ts` is left unchanged.
 */
export type Arm112TrainingSession = {
  scenarioId: string;
  call: CallSession;
};
