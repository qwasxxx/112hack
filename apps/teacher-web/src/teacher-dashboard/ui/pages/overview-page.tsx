import { useState } from 'react';
import { calculateRisk, rankSessionsByRisk } from '../../application/services/risk-radar';
import type { ActiveSession, CompletedResult, DashboardSnapshot } from '../../domain/entities';
import { TeacherAnalyticsPanels } from '../components/teacher-analytics-panels';
import { MetricCard, Sparkline, StatusBadge } from '../components/common';
import { CLASS_CATEGORY_OPTIONS } from '../../../../../student-web/src/progress/class-session';

export function OverviewPage({
  snapshot,
  sessions,
  results,
  onObserve,
  classActive,
  onToggleClass,
}: {
  snapshot: DashboardSnapshot;
  sessions: ActiveSession[];
  results: CompletedResult[];
  onObserve: (id: string) => void;
  classActive?: boolean;
  onToggleClass?: (input?: { categories?: string[] }) => void;
}) {
  const ranked = rankSessionsByRisk(sessions);
  const attention = ranked.filter(({ assessment }) => assessment.level !== 'low').length;
  const [setup, setSetup] = useState(false);
  const [categories, setCategories] = useState<string[]>(CLASS_CATEGORY_OPTIONS.map((item) => item.id));

  function toggleCategory(id: string) {
    setCategories((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="td-page">
      <header className="td-page-head">
        <div>
          <p className="td-kicker">Оперативная сводка</p>
          <h2>Обзор учебной смены</h2>
        </div>
        {onToggleClass ? (
          <button
            className="td-btn td-btn--primary"
            type="button"
            onClick={() => {
              if (classActive) {
                onToggleClass();
                setSetup(false);
                return;
              }
              setSetup((open) => !open);
            }}
          >
            {classActive ? 'Завершить занятие' : setup ? 'Скрыть настройки' : 'Начать занятие'}
          </button>
        ) : (
          <StatusBadge tone="accent">{snapshot.teacher.shift}</StatusBadge>
        )}
      </header>
      {setup && onToggleClass && !classActive ? (
        <section className="td-panel td-class-setup">
          <div className="td-section-title">
            <div>
              <p className="td-kicker">Старт занятия</p>
              <h3>Категории происшествий</h3>
            </div>
          </div>
          <p className="td-muted">
            В ленте обучающихся останутся только выбранные типы. Пустой выбор = все билеты.
          </p>
          <div className="td-class-cats">
            {CLASS_CATEGORY_OPTIONS.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={categories.includes(item.id)}
                  onChange={() => toggleCategory(item.id)}
                />
                {item.label}
              </label>
            ))}
          </div>
          <div className="td-form-actions">
            <button className="td-btn td-btn--ghost" type="button" onClick={() => setSetup(false)}>
              Отмена
            </button>
            <button
              className="td-btn td-btn--primary"
              type="button"
              onClick={() => {
                onToggleClass({ categories });
                setSetup(false);
              }}
            >
              Начать занятие
            </button>
          </div>
        </section>
      ) : null}
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

      <TeacherAnalyticsPanels snapshot={snapshot} results={results} />
    </div>
  );
}
