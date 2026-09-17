import type { IncidentCard, ServiceAssignment } from './arm112-models';
import type { Arm112PracticalResult, TrainingAction, ValidationFinding } from './training-result';

export type LearningMode = 'training' | 'dds';

export type LearningActionLog = TrainingAction;

export type LearningResult = {
  scenarioId: string;
  mode: LearningMode;
  startedAt: string;
  completedAt: string;
  elapsedSeconds: number;
  actions: LearningActionLog[];
  cardData: IncidentCard | null;
  serviceSelections: ServiceAssignment[];
  validation: ValidationFinding[];
};

export function fromPracticalResult(result: Arm112PracticalResult): LearningResult {
  return {
    scenarioId: result.scenarioId,
    mode: 'training',
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    elapsedSeconds: result.elapsedSessionSeconds,
    actions: result.actions,
    cardData: result.card,
    serviceSelections: result.services,
    validation: result.validation,
  };
}

export function fromDdsExercise(input: {
  scenarioId: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  actions: LearningActionLog[];
  cards: IncidentCard[];
}): LearningResult {
  return {
    scenarioId: input.scenarioId,
    mode: 'dds',
    startedAt: input.startedAt,
    completedAt: input.finishedAt,
    elapsedSeconds: Math.max(0, Math.round(input.elapsedMs / 1000)),
    actions: input.actions,
    cardData: input.cards[0] ?? null,
    serviceSelections: input.cards.flatMap((card) => card.services),
    validation: [],
  };
}
