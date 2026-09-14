import { z } from 'zod';

export const EvaluationEvidenceSource = z.enum([
  'transcript',
  'incident_card',
  'action',
  'timing',
  'scenario_state',
]);

export const evaluationEvidenceSchema = z.object({
  source: EvaluationEvidenceSource,
  ref: z.string(),
  quote: z.string().optional(),
});
export type EvaluationEvidence = z.infer<typeof evaluationEvidenceSchema>;

export const detectedMistakeSchema = z.object({
  code: z.string(),
  severity: z.enum(['minor', 'major', 'critical']),
  description: z.string(),
  evidence: z.array(evaluationEvidenceSchema).default([]),
});
export type DetectedMistake = z.infer<typeof detectedMistakeSchema>;

export const criterionScoreSchema = z.object({
  criterionId: z.string(),
  label: z.string(),
  score: z.number(),
  maxScore: z.number(),
  passed: z.boolean(),
  deductions: z.number().default(0),
  evidence: z.array(evaluationEvidenceSchema).default([]),
  comment: z.string().optional(),
});
export type CriterionScore = z.infer<typeof criterionScoreSchema>;

export const evaluationCriterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum([
    'required_questions',
    'information_accuracy',
    'action_sequence',
    'communication',
    'incident_card',
    'protocol',
  ]),
  maxScore: z.number().positive(),
  weight: z.number().positive().default(1),
});
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;

export const evaluationResultSchema = z.object({
  callId: z.string().uuid(),
  scenarioId: z.string().uuid(),
  scenarioVersion: z.number().int(),
  rulesVersion: z.string(),
  model: z.object({
    provider: z.string(),
    name: z.string(),
    promptVersion: z.string(),
  }),
  overallScore: z.number(),
  overallMax: z.number(),
  passed: z.boolean(),
  criteria: z.array(criterionScoreSchema),
  mistakes: z.array(detectedMistakeSchema),
  recommendations: z.array(z.string()),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
