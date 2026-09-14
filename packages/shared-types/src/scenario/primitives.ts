import { z } from 'zod';

export const ScenarioDifficulty = z.enum(['intro', 'standard', 'advanced', 'stress']);
export type ScenarioDifficulty = z.infer<typeof ScenarioDifficulty>;

export const EmotionalPrimary = z.enum([
  'calm',
  'anxious',
  'panicked',
  'angry',
  'confused',
  'in_pain',
  'withdrawn',
]);
export type EmotionalPrimary = z.infer<typeof EmotionalPrimary>;

export const emotionalStateSchema = z.object({
  primary: EmotionalPrimary,
  intensity: z.number().min(0).max(1),
  stability: z.number().min(0).max(1),
});
export type EmotionalState = z.infer<typeof emotionalStateSchema>;

export const FactCategory = z.enum([
  'location',
  'people',
  'incident',
  'medical',
  'time',
  'service',
  'identity',
  'other',
]);

export const FactVisibility = z.enum(['hidden', 'caller_knows', 'discoverable', 'public']);

export const scenarioFactSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  category: FactCategory,
  visibility: FactVisibility,
  revealOn: z.array(z.string()).default([]),
  neverVolunteer: z.boolean().default(false),
});
export type ScenarioFact = z.infer<typeof scenarioFactSchema>;

export const TransitionTrigger = z.enum([
  'fact_revealed',
  'student_action',
  'timeout',
  'teacher_intervention',
  'emotion_threshold',
  'incident_card_field',
  'manual',
]);

export const scenarioTransitionSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  trigger: TransitionTrigger,
  predicate: z.record(z.unknown()).optional(),
});
export type ScenarioTransition = z.infer<typeof scenarioTransitionSchema>;

export const ScenarioOutcome = z.enum(['in_progress', 'success', 'partial', 'failure']);

export const scenarioStateNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  callerBehavior: z.string().min(1),
  availableFactIds: z.array(z.string()).default([]),
  terminal: z.boolean().default(false),
  outcome: ScenarioOutcome.optional(),
});
export type ScenarioStateNode = z.infer<typeof scenarioStateNodeSchema>;

export const expectedActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(true),
  orderGroup: z.number().int().optional(),
  weight: z.number().default(1),
});
export type ExpectedAction = z.infer<typeof expectedActionSchema>;

export const forbiddenActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  severity: z.enum(['warning', 'major', 'critical']),
});
export type ForbiddenAction = z.infer<typeof forbiddenActionSchema>;

export const completionConditionSchema = z.object({
  success: z.array(z.string()).default([]),
  failure: z.array(z.string()).default([]),
  maxDurationSec: z.number().int().positive().optional(),
});

export const callerPersonaSchema = z.object({
  displayName: z.string().min(1),
  age: z.number().int().optional(),
  voiceProfileId: z.string().min(1),
  speakingStyle: z.string().min(1),
  language: z.string().min(2).default('ru'),
});

export const ragPolicySchema = z.object({
  enabled: z.boolean().default(false),
  documentIds: z.array(z.string()).default([]),
  maxChunks: z.number().int().positive().default(6),
});

export const turnPolicySchema = z.object({
  allowBargeIn: z.boolean().default(true),
  maxSilenceSec: z.number().positive().default(8),
  maxCallerTurnLength: z.number().int().positive().default(80),
});
