import { z } from 'zod';

export const InterventionType = z.enum([
  'set_emotional_state',
  'add_circumstance',
  'reveal_fact',
  'conceal_fact',
  'force_state',
  'inject_event',
  'adjust_difficulty',
  'end_call',
]);
export type InterventionType = z.infer<typeof InterventionType>;

export const teacherInterventionCommandSchema = z.object({
  callId: z.string().uuid(),
  type: InterventionType,
  params: z.record(z.unknown()).default({}),
  idempotencyKey: z.string().min(8),
});
export type TeacherInterventionCommand = z.infer<typeof teacherInterventionCommandSchema>;

export interface TeacherIntervention {
  id: string;
  callId: string;
  teacherId: string;
  type: InterventionType;
  params: Record<string, unknown>;
  effect: Record<string, unknown>;
  createdAt: string;
}
