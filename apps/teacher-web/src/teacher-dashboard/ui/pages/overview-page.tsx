import { calculateRisk, rankSessionsByRisk } from '../../application/services/risk-radar';
import type { ActiveSession, CompletedResult, DashboardSnapshot } from '../../domain/entities';
import { formatDateTime } from '../../domain/value-objects';
import { MetricCard, Sparkline, StatusBadge } from '../components/common';

export function OverviewPage({
  snapshot,
  sessions,
  results,
  onObserve,
}: {
  snapshot: DashboardSnapshot;
  sessions: ActiveSession[];
  results: CompletedResult[];
  onObserve: (id: string) => void;
}) {
  const ranked = rankSessionsByRisk(sessions);
  const attention = ranked.filter(({ assessment }) => assessment.level !== 'low').length;
  return (
    <div className="td-page">
      <header className="td-page-head">
        <div>
          <p className="td-kicker">Оперативная сводка</p>
          <h2>Обзор учебной смены</h2>
        </div>
        <StatusBadge tone="accent">Демонстрационные данные</StatusBadge>
      </header>
      <section className="td-metrics" aria-label="Основные показатели">
        <MetricCard
          label="Активные занятия"
          value={snapshot.activeCount}
          hint="Сейчас в работе"
          tone="accent"
        />
        <MetricCard
          label="Обучающиеся"
          value={snapshot.students.length}
          hint={`В ${snapshot.groups.length} группах`}
        />
        <MetricCard
          label="Средний балл"
          value={`${snapshot.averageScore}%`}
          hint="За последние 7 дней"
        />
        <MetricCard
          label="Завершение"
          value={`${snapshot.completionRate}%`}
          hint="Назначенных занятий"
        />
        <MetricCard
          label="Требуют внимания"
          value={attention}
          hint="По Risk Radar"
          tone={attention ? 'danger' : undefined}
        />
      </section>

      <section className="td-panel td-risk-panel">
        <div className="td-section-title">
          <div>
            <p className="td-kicker">Центр внимания · Risk Radar</p>
            <h3>Приоритет наблюдения</h3>
          </div>
          <span className="td-help">Демонстрационный аналитический показатель</span>
        </div>
        <div className="td-risk-list">
          {ranked.map(({ session, assessment }) => (
            <article className="td-risk-row" key={session.callId}>
              <div className={`td-risk-score td-risk-score--${assessment.level}`}>
                <strong>{assessment.score}</strong>
                <span>/ 100</span>
              </div>
              <div className="td-risk-main">
                <strong>{session.student.name}</strong>
                <span>{session.scenarioTitle}</span>
                <small>
                  {assessment.reasons.slice(0, 2).join(' · ') || 'Значимых факторов не выявлено'}
                </small>
              </div>
              <Sparkline
                values={session.riskHistory}
                label={`Изменение риска: ${session.student.name}`}
              />
              <div className="td-risk-action">
                <small>{assessment.recommendation}</small>
                <button
                  className="td-btn td-btn--secondary"
                  onClick={() => onObserve(session.callId)}
                >
                  Наблюдать
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="td-grid td-grid--two">
        <section className="td-panel">
          <div className="td-section-title">
            <h3>Динамика среднего балла</h3>
            <strong>{snapshot.averageScore}%</strong>
          </div>
          <Sparkline values={snapshot.scoreTrend} label="Динамика среднего балла за неделю" />
          <div className="td-axis">
            <span>10 сен</span>
            <span>Сегодня</span>
          </div>
        </section>
        <section className="td-panel">
          <h3>Результаты по категориям</h3>
          <div className="td-bars">
            {snapshot.categoryScores.map((item) => (
              <div key={item.category}>
                <span>{item.category}</span>
                <div>
                  <i style={{ width: `${item.score}%` }} />
                </div>
                <strong>{item.score}%</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="td-panel">
          <h3>Ближайшие занятия</h3>
          <div className="td-stack">
            {snapshot.upcomingLessons.map((lesson) => (
              <article className="td-list-item" key={lesson.id}>
                <div>
                  <strong>{lesson.title}</strong>
                  <span>{lesson.group}</span>
                </div>
                <time>{formatDateTime(lesson.startsAt)}</time>
              </article>
            ))}
          </div>
        </section>
        <section className="td-panel">
          <h3>Последние результаты</h3>
          <div className="td-stack">
            {results.slice(0, 3).map((result) => (
              <article className="td-list-item" key={result.id}>
                <div>
                  <strong>{result.student.name}</strong>
                  <span>{result.scenarioTitle}</span>
                </div>
                <StatusBadge tone={result.passed ? 'good' : 'danger'}>
                  {result.finalScore}%
                </StatusBadge>
              </article>
            ))}
          </div>
        </section>
      </div>
      <section className="td-panel">
        <h3>Heatmap типовых ошибок группы</h3>
        <div className="td-heatmap">
          {snapshot.commonErrors.map((item, index) => (
            <div
              key={item.label}
              style={{ '--heat': `${0.22 + index * 0.14}` } as React.CSSProperties}
            >
              <strong>{item.count}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
