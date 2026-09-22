import type { ReactNode } from 'react';
import type { CompletedResult, DashboardSnapshot } from '../../domain/entities';
import { formatDateTime } from '../../domain/value-objects';
import { Sparkline, StatusBadge } from './common';

export function TeacherAnalyticsPanels({
  snapshot,
  results,
}: {
  snapshot: DashboardSnapshot;
  results: CompletedResult[];
}) {
  return (
    <>
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
                <StatusBadge tone={result.confirmed ? (result.passed ? 'good' : 'danger') : 'warning'}>
                  {result.confirmed ? `${result.finalScore}%` : 'Ждёт'}
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
    </>
  );
}

export function TeacherSystemStatuses({ children }: { children: ReactNode }) {
  return (
    <section className="td-panel td-legacy-status">
      <div>
        <h3>Системные статусы</h3>
        <span className="td-help">Исходные индикаторы teacher-приложения</span>
      </div>
      {children}
    </section>
  );
}
