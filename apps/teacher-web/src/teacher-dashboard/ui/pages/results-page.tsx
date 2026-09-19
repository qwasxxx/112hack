import { useMemo, useState } from 'react';
import type { AuditRecord, CompletedResult, TrainingGroup } from '../../domain/entities';
import { formatDateTime, formatDuration } from '../../domain/value-objects';
import { StatusBadge } from '../components/common';

function ResultDetail({
  result,
  audit,
  onClose,
  onSaveComment,
  onAdjustScore,
}: {
  result: CompletedResult;
  audit: AuditRecord[];
  onClose: () => void;
  onSaveComment: (value: string) => Promise<void>;
  onAdjustScore: (score: number, reason: string) => Promise<void>;
}) {
  const [comment, setComment] = useState(result.teacherComment);
  const [score, setScore] = useState(result.expertScore);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const adjust = async () => {
    if (!reason.trim()) {
      setError('Укажите причину корректировки — изменение без аудита запрещено.');
      return;
    }
    setError('');
    await onAdjustScore(score, reason);
    setReason('');
  };
  return (
    <section className="td-panel td-result-detail">
      <div className="td-section-title">
        <div>
          <p className="td-kicker">Подробный результат</p>
          <h3>
            {result.student.name} · {result.scenarioTitle}
          </h3>
        </div>
        <button className="td-icon-btn" onClick={onClose} aria-label="Закрыть результат">
          ×
        </button>
      </div>
      <div className="td-score-hero">
        <div>
          <strong>{result.finalScore}%</strong>
          <span>Итоговый балл</span>
        </div>
        <dl>
          <div>
            <dt>Автоматическая</dt>
            <dd>{result.automaticScore}%</dd>
          </div>
          <div>
            <dt>Экспертная</dt>
            <dd>{result.expertScore}%</dd>
          </div>
          <div>
            <dt>Результат</dt>
            <dd>{result.passed ? 'Пройдено' : 'Не пройдено'}</dd>
          </div>
        </dl>
      </div>
      <div className="td-grid td-grid--two">
        <div>
          <h4>Баллы по критериям</h4>
          <div className="td-criteria">
            {result.criteria.map((criterion) => (
              <div key={criterion.criterionId}>
                <span>{criterion.label}</span>
                <div>
                  <i style={{ width: `${(criterion.score / criterion.maxScore) * 100}%` }} />
                </div>
                <strong>
                  {criterion.score}/{criterion.maxScore}
                </strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4>Ошибки и подтверждения</h4>
          <div className="td-stack">
            {result.mistakes.map((mistake) => (
              <article className="td-error-card" key={mistake.code}>
                <StatusBadge
                  tone={
                    mistake.severity === 'critical'
                      ? 'danger'
                      : mistake.severity === 'major'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {mistake.severity}
                </StatusBadge>
                <strong>{mistake.description}</strong>
                {mistake.evidence.map((evidence) => (
                  <blockquote key={evidence.ref}>
                    «{evidence.quote}» <cite>{evidence.ref}</cite>
                  </blockquote>
                ))}
              </article>
            ))}
          </div>
        </div>
      </div>
      <h4>Рекомендации</h4>
      <ul className="td-reasons">
        {result.recommendations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="td-grid td-grid--two">
        <div>
          <label className="td-field">
            Комментарий преподавателя
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button className="td-btn td-btn--secondary" onClick={() => void onSaveComment(comment)}>
            Сохранить комментарий
          </button>
        </div>
        <div className="td-score-edit">
          <label>
            Экспертная оценка
            <input
              type="number"
              min="0"
              max="100"
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
            />
          </label>
          <label>
            Причина корректировки
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Обязательное поле"
            />
          </label>
          {error && (
            <p className="td-form-error" role="alert">
              {error}
            </p>
          )}
          <button className="td-btn td-btn--primary" onClick={() => void adjust()}>
            Скорректировать с аудитом
          </button>
        </div>
      </div>
      <h4>Mock-аудит результата</h4>
      <div className="td-stack">
        {audit
          .filter((item) => item.entityId === result.id)
          .map((item) => (
            <article className="td-audit" key={item.id}>
              <time>{formatDateTime(item.at)}</time>
              <div>
                <strong>{item.action}</strong>
                <p>
                  {item.previousValue && `${item.previousValue} → ${item.newValue} · `}
                  {item.reason}
                </p>
              </div>
              <StatusBadge tone="accent">mock</StatusBadge>
            </article>
          ))}
      </div>
    </section>
  );
}

export function ResultsPage({
  results,
  groups,
  audit,
  onSaveComment,
  onAdjustScore,
}: {
  results: CompletedResult[];
  groups: TrainingGroup[];
  audit: AuditRecord[];
  onSaveComment: (id: string, value: string) => Promise<void>;
  onAdjustScore: (id: string, score: number, reason: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState('');
  const [student, setStudent] = useState('');
  const [scenario, setScenario] = useState('');
  const [period, setPeriod] = useState('all');
  const [outcome, setOutcome] = useState('');
  const visible = useMemo(
    () =>
      results.filter(
        (item) =>
          (!group || item.student.groupId === group) &&
          (!student || item.student.id === student) &&
          (!scenario || item.scenarioId === scenario) &&
          (!outcome || String(item.passed) === outcome) &&
          (period === 'all' || new Date(item.completedAt) >= new Date('2026-09-13T00:00:00+05:00')),
      ),
    [results, group, student, scenario, outcome, period],
  );
  const selected = results.find((item) => item.id === selectedId);
  return (
    <div className="td-page">
      <header className="td-page-head">
        <div>
          <p className="td-kicker">Качество подготовки</p>
          <h2>Результаты и аналитика</h2>
        </div>
        <StatusBadge tone="accent">
          Средний балл{' '}
          {Math.round(results.reduce((sum, item) => sum + item.finalScore, 0) / results.length)}%
        </StatusBadge>
      </header>
      <section className="td-filters" aria-label="Фильтры результатов">
        <label>
          Группа
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Все</option>
            {groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Обучающийся
          <select value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">Все</option>
            {results.map((item) => (
              <option key={item.student.id} value={item.student.id}>
                {item.student.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Сценарий
          <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <option value="">Все</option>
            {[...new Map(results.map((item) => [item.scenarioId, item])).values()].map((item) => (
              <option key={item.scenarioId} value={item.scenarioId}>
                {item.scenarioTitle}
              </option>
            ))}
          </select>
        </label>
        <label>
          Период
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">Всё время</option>
            <option value="week">Последние 7 дней</option>
          </select>
        </label>
        <label>
          Результат
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">Все</option>
            <option value="true">Пройдено</option>
            <option value="false">Не пройдено</option>
          </select>
        </label>
      </section>
      {selected && (
        <ResultDetail
          result={selected}
          audit={audit}
          onClose={() => setSelectedId(null)}
          onSaveComment={(value) => onSaveComment(selected.id, value)}
          onAdjustScore={(score, reason) => onAdjustScore(selected.id, score, reason)}
        />
      )}
      <section className="td-panel">
        <div className="td-table-wrap">
          <table className="td-table">
            <thead>
              <tr>
                <th>Обучающийся</th>
                <th>Сценарий</th>
                <th>Дата</th>
                <th>Авто</th>
                <th>Эксперт</th>
                <th>Итог</th>
                <th>Ошибки</th>
                <th>Время</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((result) => (
                <tr key={result.id}>
                  <td>
                    <strong>{result.student.name}</strong>
                  </td>
                  <td>{result.scenarioTitle}</td>
                  <td>{formatDateTime(result.completedAt)}</td>
                  <td>{result.automaticScore}%</td>
                  <td>{result.expertScore}%</td>
                  <td>
                    <StatusBadge tone={result.passed ? 'good' : 'danger'}>
                      {result.finalScore}%
                    </StatusBadge>
                  </td>
                  <td>{result.mistakes.length}</td>
                  <td>{formatDuration(result.durationSec)}</td>
                  <td>
                    <button
                      className="td-btn td-btn--secondary"
                      onClick={() => setSelectedId(result.id)}
                    >
                      Подробнее
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
