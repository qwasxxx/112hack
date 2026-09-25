import type {
  CriterionScore,
  DetectedMistake,
  EmotionalState,
  IncidentCardValues,
  InterventionType,
  ScenarioDifficulty,
} from '@sys112/shared-types';

export type SessionStatus = 'live' | 'paused' | 'finishing';
export type TrainingMode = 'training' | 'exam';
export type ScenarioStatus = 'active' | 'draft' | 'archived';

export interface Teacher {
  id: string;
  name: string;
  shift: string;
}

export interface Student {
  id: string;
  name: string;
  groupId: string;
}

export interface TrainingGroup {
  id: string;
  name: string;
  studentCount: number;
}

export interface TranscriptLine {
  id: string;
  role: 'student' | 'caller' | 'system';
  text: string;
  at: string;
  speaker?: string;
}

export interface RequiredAction {
  id: string;
  label: string;
  completed: boolean;
}

export interface RiskSignals {
  missedRequiredQuestions: number;
  longPauses: number;
  emptyRequiredFields: number;
  repeatedQuestions: number;
  emotionalEscalation: number;
  actionOrderViolations: number;
  timeLimitRatio: number;
  hasCriticalError: boolean;
}

export interface ActiveSession {
  callId: string;
  student: Student;
  scenarioId: string;
  scenarioTitle: string;
  category: string;
  difficulty: ScenarioDifficulty;
  mode: TrainingMode;
  startedAt: string;
  durationSec: number;
  status: SessionStatus;
  cardProgress: number;
  foundActions: number;
  missedActions: number;
  emotionalState: EmotionalState;
  riskSignals: RiskSignals;
  riskHistory: number[];
  transcript: TranscriptLine[];
  incidentCard: IncidentCardValues;
  requiredActions: RequiredAction[];
  protocolViolations: string[];
  timeline: TimelineEvent[];
  currentScore: number;
  ddsCards?: Array<{
    id: string;
    number: string;
    title: string;
    status: string;
    naryad: string;
    address: string;
    injured: string;
    caller: string;
    phone: string;
    contacts: string;
    history: string;
    active: boolean;
  }>;
}

export interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  kind: 'system' | 'intervention' | 'warning' | 'comment';
  mock?: boolean;
}

export interface ScenarioDraft {
  id?: string;
  title: string;
  category: string;
  location: string;
  difficulty: ScenarioDifficulty;
  description: string;
  timeLimitSec: number;
  requiredActions: string[];
  allowedErrors: number;
  passThreshold: number;
  materials: string[];
  allowedInterventions: InterventionType[];
  services?: string[];
  callerOpening?: string;
  classifierNumber?: string;
}

export interface Scenario extends Omit<ScenarioDraft, 'id'> {
  id: string;
  version: number;
  status: ScenarioStatus;
  assignments: number;
  updatedAt: string;
    etalon?: {
    what: string;
    address: string;
    phone: string;
    caller: string;
    services: string;
  };
  services?: string[];
  callerOpening?: string;
  classifierNumber?: string;
}

export interface TrainingMaterial {
  id: string;
  title: string;
  fileType: string;
  version: string;
  scenarioId: string;
}

export interface CompletedResult {
  id: string;
  callId: string;
  student: Student;
  scenarioId: string;
  scenarioTitle: string;
  category: string;
  completedAt: string;
  durationSec: number;
  automaticScore: number;
  expertScore: number;
  finalScore: number;
  passed: boolean;
  criteria: CriterionScore[];
  mistakes: DetectedMistake[];
  recommendations: string[];
  transcriptEvidence: TranscriptLine[];
  teacherComment: string;
  cardTimerSeconds?: number | null;
  cardTimerLimitSec?: number;
  cardTimerExceeded?: boolean;
  recordingId?: string;
  confirmed: boolean;
  parts?: Array<{ label: string; score: number; max: number }>;
  reviewFields?: Array<{
    label: string;
    expected: string;
    got: string;
    state: 'match' | 'partial' | 'miss' | 'empty';
    points: number;
    max: number;
  }>;
  transcript?: Array<{ role: 'operator' | 'caller'; text: string; speaker?: string }>;
}

export interface AuditRecord {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityId: string;
  previousValue?: string;
  newValue?: string;
  reason: string;
  mock: true;
}

export interface DashboardSnapshot {
  teacher: Teacher;
  groups: TrainingGroup[];
  students: Student[];
  activeCount: number;
  averageScore: number;
  completionRate: number;
  upcomingLessons: Array<{ id: string; title: string; group: string; startsAt: string }>;
  scoreTrend: number[];
  categoryScores: Array<{ category: string; score: number }>;
  commonErrors: Array<{ label: string; count: number }>;
}

export interface InterventionInput {
  callId: string;
  type: InterventionType;
  note: string;
}
