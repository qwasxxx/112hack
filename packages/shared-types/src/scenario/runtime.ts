import { z } from 'zod';
import { emotionalStateSchema, ScenarioOutcome } from './primitives';
import { incidentCardValuesSchema } from '../incident-card';

export const scenarioRuntimeStateSchema = z.object({
  callId: z.string().uuid(),
  scenarioId: z.string().uuid(),
  scenarioVersion: z.number().int().positive(),
  currentStateId: z.string().min(1),
  outcome: ScenarioOutcome,
  emotionalState: emotionalStateSchema,
  factsKnownByCaller: z.array(z.string()),
  factsDiscoveredByStudent: z.array(z.string()),
  factsStillHidden: z.array(z.string()),
  completedActionIds: z.array(z.string()),
  forbiddenActionIds: z.array(z.string()),
  activeModifiers: z.array(
    z.object({
      sourceInterventionId: z.string(),
      kind: z.string(),
      payload: z.record(z.unknown()),
    }),
  ),
  incidentCardValues: incidentCardValuesSchema,
  stateVersion: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type ScenarioRuntimeState = z.infer<typeof scenarioRuntimeStateSchema>;
