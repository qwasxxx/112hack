import type { TrainingScenario } from '../data/scenarios';
import type { Arm112PracticalResult } from '../features/arm112-simulator/model/training-result';
import { scoreCard50 } from './score-card';
import { applyAiPoliteness, scoreCallRules, type TranscriptTurn } from './score-call';
import { PASS_SCORE, PASS_SCORE_EXAM, type LessonMode, type LessonRecord } from './types';

export type TrainingScoreInput = {
  result: Arm112PracticalResult;
  scenario: TrainingScenario;
  operatorLogin: string;
  transcript: TranscriptTurn[];
  mode?: Extract<LessonMode, 'training' | 'exam'>;
  channel?: 'call' | 'sms';
  ai?: {
    politeness?: number;
    comment?: string;
    recommendations?: string[];
    source?: string;
  };
};

export function scoreTrainingLesson(input: TrainingScoreInput): Omit<LessonRecord, 'id'> {
  const mode = input.mode ?? 'training';
  const card = scoreCard50(input.result, input.scenario);
  let call = scoreCallRules(input.transcript);
  if (input.channel === 'sms') {
    call = {
      ...call,
      interview: card.points >= 35 ? 16 : Math.max(call.interview, 8),
      speed: input.result.cardTimerExceeded ? 9 : 12,
      points: 0,
      findings: call.findings.filter((item) => !item.code.startsWith('ask-') && item.code !== 'speed-unknown'),
    };
    call.points = Math.max(0, Math.min(50, call.speed + call.politeness + call.interview));
  }
  if (input.ai?.politeness != null) {
    call = applyAiPoliteness(call, input.ai.politeness, input.ai.comment);
  }
  const score = Math.max(0, Math.min(100, card.points + call.points));
  const passAt = mode === 'exam' ? PASS_SCORE_EXAM : PASS_SCORE;
  const recs = [
    ...(input.ai?.recommendations ?? []),
    card.points < 35
      ? input.channel === 'sms'
        ? 'Из SMS в карточку переносятся адрес, ФИО, телефон и суть — всё, что есть в тексте.'
        : 'Сверяйте каждое поле карточки с тем, что сказал заявитель по билету.'
      : '',
    input.channel !== 'sms' && call.interview < 14 ? 'На линии нужны четыре опоры: где, что случилось, пострадавшие, телефон.' : '',
    input.channel !== 'sms' && call.speed < 10 ? 'После ответа заявителя сразу следующий короткий вопрос.' : '',
  ].filter(Boolean);
  const unique = [...new Set(recs)].slice(0, 5);
  return {
    operatorLogin: input.operatorLogin,
    mode,
    scenarioId: input.scenario.id,
    scenarioCode: input.result.scenarioCode,
    scenarioTitle: input.result.scenarioTitle,
    startedAt: input.result.startedAt,
    completedAt: input.result.completedAt,
    elapsedSeconds: input.result.elapsedSessionSeconds,
    reactionSeconds: input.result.reactionSeconds,
    cardTimerSeconds: input.result.cardTimerSeconds,
    cardTimerLimitSec: input.result.cardTimerLimitSec,
    cardTimerExceeded: input.result.cardTimerExceeded,
    score,
    passed: score >= passAt && card.missingServices.length === 0,
    findings: [...card.findings, ...call.findings],
    recommendations: unique,
    summary: `${score} · карточка ${card.points}/50 · ${input.channel === 'sms' ? 'SMS' : 'разговор'} ${call.points}/50`,
    cardScore: card.points,
    callScore: call.points,
    speedScore: call.speed,
    politenessScore: call.politeness,
    interviewScore: call.interview,
    comment: input.ai?.comment ?? '',
    judgeSource: input.ai?.source,
  };
}
