import type { IncidentCard } from '../arm112-simulator/model/arm112-models';

export const DDS_SERVICE_STATUSES = [
  'Добавлена',
  'Получена службой',
  'Принята',
  'Не принято',
  'Начало реагирования',
  'Прибытие',
  'Проведение работ',
  'Работы завершены',
  'Отказ от выполнения работ',
] as const;

export type DdsServiceStatus = (typeof DDS_SERVICE_STATUSES)[number];

export const DDS_FIRST_RESPONSE_STATUSES: DdsServiceStatus[] = ['Принята', 'Не принято'];

export const DDS_FOLLOWUP_STATUSES: DdsServiceStatus[] = [
  'Начало реагирования',
  'Прибытие',
  'Проведение работ',
  'Работы завершены',
  'Отказ от выполнения работ',
];

export const DDS_TERMINAL_STATUSES: DdsServiceStatus[] = [
  'Работы завершены',
  'Отказ от выполнения работ',
  'Не принято',
];

export function nextDdsStatuses(current: DdsServiceStatus): DdsServiceStatus[] {
  if (current === 'Добавлена' || current === 'Получена службой') {
    return [...DDS_FIRST_RESPONSE_STATUSES];
  }
  if (current === 'Принята') {
    return ['Начало реагирования', 'Отказ от выполнения работ', 'Работы завершены'];
  }
  if (current === 'Начало реагирования') {
    return ['Прибытие', 'Проведение работ', 'Работы завершены', 'Отказ от выполнения работ'];
  }
  if (current === 'Прибытие') {
    return ['Проведение работ', 'Работы завершены'];
  }
  if (current === 'Проведение работ') {
    return ['Работы завершены'];
  }
  return [];
}

export function isDdsTerminal(status: DdsServiceStatus): boolean {
  return (DDS_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export type DdsSourceKind =
  | 'dds-screenshot'
  | 'dds-caption'
  | 'card-screenshot'
  | 'manual'
  | 'scenario'
  | 'case-spec'
  | 'classifier';

export type DdsSourceRef = {
  kind: DdsSourceKind;
  ref: string;
};

export type DdsStatusEvent = {
  at: string;
  status: DdsServiceStatus;
  comment: string;
  naryad: string;
  operatorLabel: string;
};

export type DdsServiceChip = {
  id: string;
  label: string;
  shortLabel: string;
  status: DdsServiceStatus;
  statusTime: string;
  editable: boolean;
  history: DdsStatusEvent[];
};

export type DdsIncidentCardViewModel = {
  id: string;
  scenarioId: string;
  number: string;
  createdAt: string;
  operatorArm: string;
  operatorName: string;
  typeCode: string;
  typeTitle: string;
  description: string;
  addressLine: string;
  okrug: string;
  injured: string;
  callerName: string;
  tags: string;
  classifierClass: string;
  visClass: string;
  aon: string;
  providedPhone: string;
  phoneOnSite: string;
  services: DdsServiceChip[];
  source: DdsSourceRef[];
  incident: IncidentCard;
  classifierNumber: string | null;
  classifierRow: number | null;
};

export type DdsQueueItemState = 'queued' | 'selected' | 'editing' | 'completed' | 'transferred';
export type DdsCardDecision = 'dispatch' | 'transfer';

export type DdsLoggedAction = {
  at: string;
  cardId: string;
  type:
    | 'open_card'
    | 'close_card'
    | 'start_edit'
    | 'cancel_edit'
    | 'status_change'
    | 'comment'
    | 'naryad'
    | 'confirm_status'
    | 'complete_card'
    | 'transfer_card'
    | 'callback'
    | 'close_to_112';
  detail: string;
};

export type DdsCardResult = {
  cardId: string;
  number: string;
  scenarioId: string;
  openedAt: string | null;
  completedAt: string | null;
  elapsedMs: number;
  finalStatus: DdsServiceStatus;
  textEntries: string[];
  statusTransitions: Array<{ from: DdsServiceStatus; to: DdsServiceStatus; at: string }>;
  actions: DdsLoggedAction[];
};

export type DdsExerciseResult = {
  exerciseId: string;
  scenarioId: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  cards: DdsCardResult[];
  actions: DdsLoggedAction[];
};
