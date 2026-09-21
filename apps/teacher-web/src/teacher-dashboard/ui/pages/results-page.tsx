import { useMemo, useState, type ReactNode } from 'react';
import type {
  AuditRecord,
  CompletedResult,
  DashboardSnapshot,
  TrainingGroup,
} from '../../domain/entities';
import { formatDateTime, formatDuration } from '../../domain/value-objects';
import { StatusBadge } from '../components/common';
import {
  TeacherAnalyticsPanels,
  TeacherSystemStatuses,
} from '../components/teacher-analytics-panels';
import { TeacherFilterBar, TeacherFilterMenu } from '../components/teacher-filter-menu';
import { downloadResultsCsv, printGroupReport, printResultCertificate } from '../teacher-export';

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
          <button className="td-btn td-btn--ghost" type="button" onClick={() => printResultCertificate(result)}>
            Печать справки
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
      <h4>Аудит результата</h4>
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
            </article>
          ))}
      </div>
    </section>
  );
}

export function ResultsPage({
  results,
  groups,
  snapshot,
  audit,
  systemStatus,
  onSaveComment,
  onAdjustScore,
}: {
  results: CompletedResult[];
  groups: TrainingGroup[];
  snapshot: DashboardSnapshot;
  audit: AuditRecord[];
  systemStatus: ReactNode;
  onSaveComment: (id: string, value: string) => Promise<void>;
  onAdjustScore: (id: string, score: number, reason: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState('');
  const [student, setStudent] = useState('');
  const [scenario, setScenario] = useState('');
  const [period, setPeriod] = useState('all');
  const [outcome, setOutcome] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const visible = useMemo(
    () =>
      results.filter(
        (item) =>
          (!group || item.student.groupId === group) &&
          (!student || item.student.id === student) &&
          (!scenario || item.scenarioId === scenario) &&
          (!outcome || String(item.passed) === outcome) &&
          (period === 'all' || Date.parse(item.completedAt) >= Date.now() - 7 * 24 * 60 * 60 * 1000),
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
        <div className="td-inline">
          <StatusBadge tone="accent">{results.length ? `${Math.round(results.reduce((sum, item) => sum + item.finalScore, 0) / results.length)}% средний` : 'Нет попыток'}</StatusBadge>
          <button className="td-btn td-btn--secondary" type="button" onClick={() => downloadResultsCsv(visible)}>
            CSV группы
          </button>
          <button className="td-btn td-btn--ghost" type="button" onClick={() => printGroupReport(visible)}>
            Печать отчёта
          </button>
        </div>
      </header>
      <TeacherFilterBar label="Фильтры результатов">
        <TeacherFilterMenu
          label="Группа"
          icon="people"
          value={group}
          open={openMenu === 'group'}
          onOpenChange={(open) => setOpenMenu(open ? 'group' : null)}
          onChange={setGroup}
          options={[
            { value: '', label: 'Все' },
            ...groups.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <TeacherFilterMenu
          label="Обучающийся"
          icon="people"
          value={student}
          open={openMenu === 'student'}
          onOpenChange={(open) => setOpenMenu(open ? 'student' : null)}
          onChange={setStudent}
          options={[
            { value: '', label: 'Все' },
            ...[...new Map(results.map((item) => [item.student.id, item.student])).values()].map(
              (item) => ({ value: item.id, label: item.name }),
            ),
          ]}
        />
        <TeacherFilterMenu
          label="Сценарий"
          icon="book"
          value={scenario}
          open={openMenu === 'scenario'}
          onOpenChange={(open) => setOpenMenu(open ? 'scenario' : null)}
          onChange={setScenario}
          options={[
            { value: '', label: 'Все' },
            ...[...new Map(results.map((item) => [item.scenarioId, item])).values()].map((item) => ({
              value: item.scenarioId,
              label: item.scenarioTitle,
            })),
          ]}
        />
        <TeacherFilterMenu
          label="Период"
          icon="clock"
          value={period}
          open={openMenu === 'period'}
          onOpenChange={(open) => setOpenMenu(open ? 'period' : null)}
          onChange={setPeriod}
          options={[
            { value: 'all', label: 'Всё время' },
            { value: 'week', label: 'Последние 7 дней' },
          ]}
        />
        <TeacherFilterMenu
          label="Результат"
          icon="shield"
          value={outcome}
          open={openMenu === 'outcome'}
          onOpenChange={(open) => setOpenMenu(open ? 'outcome' : null)}
          onChange={setOutcome}
          options={[
            { value: '', label: 'Все' },
            { value: 'true', label: 'Пройдено' },
            { value: 'false', label: 'Не пройдено' },
          ]}
        />
      </TeacherFilterBar>
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
      <TeacherAnalyticsPanels snapshot={snapshot} results={visible} />
      <TeacherSystemStatuses>{systemStatus}</TeacherSystemStatuses>
    </div>
  );
}
