import { z } from 'zod';
import { CallStatus } from '../call';
import { emotionalStateSchema, ScenarioOutcome } from '../scenario/primitives';
import { InterventionType } from '../intervention';
import { evaluationResultSchema } from '../evaluation';
import { incidentCardValuesSchema } from '../incident-card';

const envelope = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({
    type: z.literal(type),
    eventId: z.string().uuid(),
    callId: z.string().uuid(),
    occurredAt: z.string().datetime(),
    payload,
  });

export const connectionEstablishedEvent = z.object({
  type: z.literal('ConnectionEstablished'),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  payload: z.object({
    connectionId: z.string(),
    protocolVersion: z.literal('v1'),
  }),
});

export const callStartedEvent = envelope(
  'CallStarted',
  z.object({
    studentId: z.string().uuid(),
    scenarioId: z.string().uuid(),
    scenarioVersion: z.number().int(),
    status: z.literal(CallStatus.enum.live),
  }),
);

export const callEndedEvent = envelope(
  'CallEnded',
  z.object({
    status: z.enum(['completed', 'failed', 'cancelled']),
    outcome: ScenarioOutcome,
  }),
);

export const transcriptUpdatedEvent = envelope(
  'TranscriptUpdated',
  z.object({
    segmentId: z.string().uuid(),
    role: z.enum(['student', 'caller', 'system']),
    text: z.string(),
    isFinal: z.boolean(),
  }),
);

export const aiTurnStartedEvent = envelope(
  'AiTurnStarted',
  z.object({
    turnId: z.string().uuid(),
    reason: z.enum(['student_utterance', 'timeout', 'intervention', 'system']),
  }),
);

export const aiTurnCompletedEvent = envelope(
  'AiTurnCompleted',
  z.object({
    turnId: z.string().uuid(),
    text: z.string(),
    audioAvailable: z.boolean(),
  }),
);

export const aiTurnFailedEvent = envelope(
  'AiTurnFailed',
  z.object({
    turnId: z.string().uuid(),
    code: z.string(),
    retryable: z.boolean(),
  }),
);

export const incidentCardUpdatedEvent = envelope(
  'IncidentCardUpdated',
  z.object({
    values: incidentCardValuesSchema,
    version: z.number().int(),
  }),
);

export const scenarioStateChangedEvent = envelope(
  'ScenarioStateChanged',
  z.object({
    currentStateId: z.string(),
    outcome: ScenarioOutcome,
    emotionalState: emotionalStateSchema,
    stateVersion: z.number().int(),
  }),
);

export const teacherInterventionAppliedEvent = envelope(
  'TeacherInterventionApplied',
  z.object({
    interventionId: z.string().uuid(),
    type: InterventionType,
    teacherId: z.string().uuid(),
  }),
);

export const evaluationQueuedEvent = envelope(
  'EvaluationQueued',
  z.object({
    jobId: z.string().uuid(),
  }),
);

export const evaluationCompletedEvent = envelope(
  'EvaluationCompleted',
  z.object({
    result: evaluationResultSchema,
  }),
);

export const participantPresenceEvent = envelope(
  'ParticipantPresence',
  z.object({
    userId: z.string().uuid(),
    role: z.enum(['STUDENT', 'TEACHER']),
    action: z.enum(['joined', 'left']),
  }),
);

export const realtimeEventSchema = z.discriminatedUnion('type', [
  connectionEstablishedEvent,
  callStartedEvent,
  callEndedEvent,
  transcriptUpdatedEvent,
  aiTurnStartedEvent,
  aiTurnCompletedEvent,
  aiTurnFailedEvent,
  incidentCardUpdatedEvent,
  scenarioStateChangedEvent,
  teacherInterventionAppliedEvent,
  evaluationQueuedEvent,
  evaluationCompletedEvent,
  participantPresenceEvent,
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent['type'];

export const joinCallCommandSchema = z.object({
  type: z.literal('JoinCall'),
  callId: z.string().uuid(),
});

export const leaveCallCommandSchema = z.object({
  type: z.literal('LeaveCall'),
  callId: z.string().uuid(),
});

export const pingCommandSchema = z.object({
  type: z.literal('Ping'),
});

export const realtimeCommandSchema = z.discriminatedUnion('type', [
  joinCallCommandSchema,
  leaveCallCommandSchema,
  pingCommandSchema,
]);

export type RealtimeCommand = z.infer<typeof realtimeCommandSchema>;
