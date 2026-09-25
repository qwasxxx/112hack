export type LessonMode = 'training' | 'exam' | 'dds';

export type FindingSeverity = 'error' | 'warning';

export type LessonFinding = {
  code: string;
  field: string;
  message: string;
  severity: FindingSeverity;
};

export type LessonRecord = {
  id: string;
  operatorLogin: string;
  mode: LessonMode;
  scenarioId: string;
  scenarioCode: string;
  scenarioTitle: string;
  startedAt: string;
  completedAt: string;
  elapsedSeconds: number;
  reactionSeconds: number | null;
  cardTimerSeconds: number | null;
  cardTimerLimitSec: number;
  cardTimerExceeded: boolean;
  score: number;
  passed: boolean;
  findings: LessonFinding[];
  recommendations: string[];
  summary: string;
  recordingId?: string;
  cardScore?: number;
  callScore?: number;
  speedScore?: number;
  politenessScore?: number;
  interviewScore?: number;
  comment?: string;
  judgeSource?: string;
  reviewFields?: LessonReviewField[];
  transcript?: LessonReviewLine[];
}

export type LessonReviewField = {
  label: string;
  expected: string;
  got: string;
  state: 'match' | 'partial' | 'miss' | 'empty';
  points: number;
  max: number;
};

export type LessonReviewLine = {
  role: 'operator' | 'caller';
  text: string;
  speaker?: string;
}

export const PASS_SCORE = 70;
export const PASS_SCORE_EXAM = 80;
export const CARD_TIMER_LIMIT_SEC = 30;
