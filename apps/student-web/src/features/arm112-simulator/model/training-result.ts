import type { TrainingScenario } from '../../../data/scenarios';
import type { IncidentCard } from '../model/arm112-models';
import type { ClassifierRuntimeRecord } from '../data/classifier-runtime';
import type { TrainingBinding } from '../data/training-bindings';

export type TrainingAction = {
  at: string;
  type: string;
  detail: string;
};

export type ValidationFinding = {
  code: string;
  field: string;
  message: string;
  source: string;
};

export type Arm112PracticalResult = {
  scenarioId: string;
  scenarioCode: string;
  scenarioTitle: string;
  startedAt: string;
  completedAt: string;
  incomingAcceptedAt: string | null;
  reactionSeconds: number | null;
  elapsedSessionSeconds: number;
  cardTimerSeconds: number;
  cardTimerExceeded: boolean;
  normativeDurationMin: number;
  cardTimerLimitSec: number;
  callerOpening: string;
  card: IncidentCard;
  classifier: {
    selectedTypes: string[];
    groupCode: string | null;
    priznak1: string | null;
    priznak2: string[];
    priznak3: string[];
    extraTags: string[];
    matched: Array<{ row: number; number: string; finalType: string | null; mainService: string | null }>;
    expected: TrainingBinding['classifier'];
  };
  services: IncidentCard['services'];
  actions: TrainingAction[];
  validation: ValidationFinding[];
};

export function validateCard(card: IncidentCard): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!card.descriptionFromCaller.trim()) {
    findings.push({
      code: 'required-description',
      field: 'Описание со слов заявителя',
      message: 'Пустое обязательное поле',
      source: 'card-manual §5 обязательные поля',
    });
  }
  if (!card.caller.familyNameAndGivenName.trim()) {
    findings.push({
      code: 'required-fio',
      field: 'ФИО заявителя',
      message: 'Пустое обязательное поле',
      source: 'card-manual §5 обязательные поля',
    });
  }
  if (!card.caller.callerStatus) {
    findings.push({
      code: 'required-status',
      field: 'Статус заявителя',
      message: 'Статус не выбран',
      source: 'card-manual §5 обязательные поля',
    });
  }
  if (card.injured.hasInjured == null) {
    findings.push({
      code: 'required-injured',
      field: 'Пострадавшие',
      message: 'Группа «Пострадавшие» не заполнена',
      source: 'card-manual §5 обязательные поля',
    });
  }
  if (card.classification.selectedTypes.length === 0) {
    findings.push({
      code: 'required-type',
      field: 'ЧТО СЛУЧИЛОСЬ?',
      message: 'Тип происшествия не выбран',
      source: 'card-manual §4 блок «что случилось»',
    });
  }
  return findings;
}

export function buildPracticalResult(input: {
  scenario: TrainingScenario;
  binding: TrainingBinding;
  card: IncidentCard;
  startedAt: string;
  completedAt: string;
  incomingAcceptedAt: string | null;
  actions: TrainingAction[];
  matched: ClassifierRuntimeRecord[];
}): Arm112PracticalResult {
  const started = Date.parse(input.startedAt);
  const completed = Date.parse(input.completedAt);
  const accepted = input.incomingAcceptedAt ? Date.parse(input.incomingAcceptedAt) : null;
  return {
    scenarioId: input.scenario.id,
    scenarioCode: input.scenario.code,
    scenarioTitle: input.scenario.title,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    incomingAcceptedAt: input.incomingAcceptedAt,
    reactionSeconds: accepted != null && Number.isFinite(started) ? Math.max(0, Math.round((accepted - started) / 1000)) : null,
    elapsedSessionSeconds:
      Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, Math.round((completed - started) / 1000)) : input.card.timer.elapsedSeconds,
    cardTimerSeconds: input.card.timer.elapsedSeconds,
    cardTimerExceeded: input.card.timer.exceeded,
    normativeDurationMin: input.binding.normativeDurationMin,
    cardTimerLimitSec: input.binding.cardTimerLimitSec,
    callerOpening: input.binding.callerOpening,
    card: input.card,
    classifier: {
      selectedTypes: input.card.classification.selectedTypes,
      groupCode: input.card.classification.classifier.groupCode,
      priznak1: input.card.classification.classifier.priznak1,
      priznak2: input.card.classification.classifier.priznak2,
      priznak3: input.card.classification.classifier.priznak3,
      extraTags: input.card.classification.classifier.extraTags,
      matched: input.matched.map((item) => ({
        row: item.row,
        number: String(item.n),
        finalType: item.t,
        mainService: item.m,
      })),
      expected: input.binding.classifier,
    },
    services: input.card.services,
    actions: input.actions,
    validation: validateCard(input.card),
  };
}
