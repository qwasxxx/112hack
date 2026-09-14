import { z } from 'zod';
import { evaluationCriterionSchema } from '../evaluation';
import { incidentCardSchemaSchema } from '../incident-card';
import { InterventionType } from '../intervention';
import {
  callerPersonaSchema,
  completionConditionSchema,
  emotionalStateSchema,
  expectedActionSchema,
  forbiddenActionSchema,
  ragPolicySchema,
  scenarioFactSchema,
  ScenarioDifficulty,
  scenarioStateNodeSchema,
  scenarioTransitionSchema,
  turnPolicySchema,
} from './primitives';

export const scenarioDefinitionSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  version: z.number().int().positive(),
  difficulty: ScenarioDifficulty,
  locale: z.string().min(2).default('ru'),
  services: z.array(z.enum(['police', 'fire', 'ambulance', 'gas', 'other'])).min(1),
  caller: callerPersonaSchema,
  systemInstructions: z.string().min(1),
  initialEmotionalState: emotionalStateSchema,
  initialStateId: z.string().min(1),
  facts: z.array(scenarioFactSchema),
  states: z.array(scenarioStateNodeSchema).min(1),
  transitions: z.array(scenarioTransitionSchema),
  expectedActions: z.array(expectedActionSchema),
  forbiddenActions: z.array(forbiddenActionSchema),
  evaluationCriteria: z.array(evaluationCriterionSchema),
  evaluationRulesVersion: z.string().min(1),
  incidentCardSchema: incidentCardSchemaSchema,
  allowedInterventions: z.array(InterventionType),
  completion: completionConditionSchema,
  turnPolicy: turnPolicySchema,
  ragPolicy: ragPolicySchema,
  safetyNotes: z.string().default(''),
});

export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;
