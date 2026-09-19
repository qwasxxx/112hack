import type { ActiveSession, RiskSignals } from '../../domain/entities';

export interface RiskAssessment {
  score: number;
  level: 'low' | 'medium' | 'high';
  reasons: string[];
  recommendation: string;
}

export function calculateRisk(signals: RiskSignals): RiskAssessment {
  const factors = [
    [signals.missedRequiredQuestions * 12, 'Пропущены обязательные вопросы'],
    [signals.longPauses * 7, 'Длительные паузы в диалоге'],
    [signals.emptyRequiredFields * 6, 'Не заполнены обязательные поля'],
    [signals.repeatedQuestions * 5, 'Повторяются вопросы'],
    [signals.emotionalEscalation * 12, 'Растёт эмоциональное напряжение'],
    [signals.actionOrderViolations * 10, 'Нарушен порядок действий'],
    [signals.timeLimitRatio >= 0.8 ? 12 : 0, 'Приближается лимит времени'],
    [signals.hasCriticalError ? 30 : 0, 'Обнаружена критическая ошибка'],
  ] as const;
  const score = Math.min(
    100,
    factors.reduce((sum, [value]) => sum + value, 0),
  );
  const reasons = factors.filter(([value]) => value > 0).map(([, reason]) => reason);
  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  const recommendation =
    level === 'high'
      ? 'Откройте сессию и проверьте критические действия.'
      : level === 'medium'
        ? 'Наблюдайте за следующими двумя репликами.'
        : 'Вмешательство не требуется.';
  return { score, level, reasons, recommendation };
}

export const rankSessionsByRisk = (sessions: ActiveSession[]) =>
  [...sessions]
    .map((session) => ({ session, assessment: calculateRisk(session.riskSignals) }))
    .sort((a, b) => b.assessment.score - a.assessment.score);
