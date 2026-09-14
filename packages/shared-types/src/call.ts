import { z } from 'zod';

export const CallStatus = z.enum([
  'pending',
  'live',
  'ending',
  'completed',
  'failed',
  'cancelled',
]);
export type CallStatus = z.infer<typeof CallStatus>;

export const TranscriptRole = z.enum(['student', 'caller', 'system']);
export type TranscriptRole = z.infer<typeof TranscriptRole>;

export const transcriptSegmentSchema = z.object({
  id: z.string().uuid(),
  callId: z.string().uuid(),
  role: TranscriptRole,
  text: z.string(),
  isFinal: z.boolean(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export interface CallSummary {
  id: string;
  studentId: string;
  scenarioId: string;
  scenarioVersion: number;
  status: CallStatus;
  startedAt: string;
  endedAt?: string;
}
