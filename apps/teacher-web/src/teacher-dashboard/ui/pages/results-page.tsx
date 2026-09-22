import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AuditRecord,
  CompletedResult,
  DashboardSnapshot,
  TrainingGroup,
} from '../../domain/entities';
import { formatDateTime, formatDuration } from '../../domain/value-objects';
import { StatusBadge } from '../components/common';
import { TeacherFilterBar, TeacherFilterMenu } from '../components/teacher-filter-menu';
import { downloadResultsCsv, downloadResultsXlsx, printGroupReport, printResultCertificate } from '../teacher-export';
import { loadLocalRecording } from '../../infrastructure/local-recording';

function MarkRing({ value }: { value: number }) {
  const radius = 46;
  const length = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, value / 100));
  return (
    <div className="td-ring" aria-label={`${value} из 100`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="td-ring-track" cx="60" cy="60" r={radius} />
        <circle
          className="td-ring-value"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - pct)}
        />
      </svg>
      <div>
        <b>{value}</b>
        <span>из 100</span>
      </div>
    </div>
  );
}

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
  const [ownScore, setOwnScore] = useState(false);
  const [score, setScore] = useState(result.confirmed ? result.expertScore : result.automaticScore);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [fileId, setFileId] = useState(result.recordingId ?? '');
  const [localUrl, setLocalUrl] = useState('');
  const fields = result.reviewFields ?? [];
  const lines = result.transcript ?? [];
  const history = audit.filter((item) => item.entityId === result.id);
  const parts = result.parts?.length
    ? result.parts
    : result.criteria.map((item) => ({ label: item.label, score: item.score, max: item.maxScore }));
  const mark = result.confirmed ? result.finalScore : result.automaticScore;
  const recording = fileId ? `/api/v1/training/recordings/${fileId}` : '';
  const playable = localUrl || recording;
  useEffect(() => {
    let url = '';
    let stop = false;
    void loadLocalRecording(result.id).then((blob) => {
      if (stop || !blob?.size) {
        return;
      }
      url = URL.createObjectURL(blob);
      setLocalUrl(url);
    });
    return () => {
      stop = true;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [result.id]);
  useEffect(() => {
    if (fileId || result.recordingId) {
      if (result.recordingId) {
        setFileId(result.recordingId);
      }
      return;
    }
    let stop = false;
    const pull = () => {
      void fetch('/api/v1/training/recordings')
        .then((response) => (response.ok ? response.json() : []))
        .then((rows: unknown) => {
          if (stop || !Array.isArray(rows)) {
            return;
          }
          const hit = rows.find(
            (row) =>
              row &&
              typeof row === 'object' &&
              (row as { lessonId?: string }).lessonId === result.id,
          ) as { id?: string } | undefined;
          if (hit?.id) {
            setFileId(hit.id);
          }
        })
        .catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [fileId, result.id, result.recordingId]);
  const saveScore = async (next: number, why: string) => {
    setBusy(true);
    setError('');
    try {
      await onAdjustScore(next, why);
      setOwnScore(false);
      setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить оценку');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="td-review">
      <div className="td-review-top">
        <div>
          <button className="td-review-back" type="button" onClick={onClose}>
            ← К списку
          </button>
          <h3>{result.student.name}</h3>
          <p className="td-review-meta">
            {result.scenarioTitle}
            <br />
            {formatDateTime(result.completedAt)} · {formatDuration(result.durationSec)} · {result.category}
          </p>
        </div>
      </div>

      <article className="td-hero">
        <MarkRing value={mark} />
        <div className="td-hero-copy">
          <p className="td-hero-kicker">{result.confirmed ? (result.passed ? 'Зачёт' : 'Незачёт') : 'Черновик ИИ'}</p>
          <h3>
            {result.student.name}
            <span>{result.scenarioTitle}</span>
          </h3>
          <p>
            {formatDateTime(result.completedAt)} · {formatDuration(result.durationSec)} · {result.category}
            {result.confirmed ? ` · подтверждено ${result.expertScore}` : ' · ученик увидит итог после подтверждения'}
          </p>
          <div className="td-hero-actions">
            {!result.confirmed ? (
              <button
                className="td-confirm"
                type="button"
                disabled={busy}
                onClick={() => void saveScore(result.automaticScore, 'Подтверждена автоматическая оценка ИИ')}
              >
                Подтвердить оценку
              </button>
            ) : null}
            <button className="td-quiet-btn" type="button" onClick={() => setOwnScore((value) => !value)}>
              {ownScore ? 'Отмена' : 'Другой балл'}
            </button>
            {result.confirmed && result.passed ? (
              <button className="td-quiet-btn" type="button" onClick={() => printResultCertificate(result)}>
                Справка
              </button>
            ) : null}
          </div>
        </div>
      </article>

      {ownScore ? (
        <form
          className="td-scoreform"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reason.trim()) {
              setError('Напишите, почему балл другой.');
              return;
            }
            void saveScore(score, reason.trim());
          }}
        >
          <label>
            Балл
            <input
              type="number"
              min="0"
              max="100"
              value={score}
              onChange={(event) => setScore(Number(event.target.value))}
            />
          </label>
          <label>
            Почему другой балл
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Коротко, это сохранится" />
          </label>
          <button className="td-confirm" type="submit" disabled={busy}>
            Сохранить балл
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="td-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="td-fold">
        <button type="button" className="td-fold-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span>
            <b>Полный разбор</b>
            <small>По каким критериям сняты баллы</small>
          </span>
          <em>{open ? 'Свернуть' : 'Развернуть'}</em>
        </button>
        {open ? (
          <div className="td-fold-body">
            <ul className="td-scorebars">
              {parts.map((part) => (
                <li key={part.label}>
                  <span>{part.label}</span>
                  <i>
                    <b style={{ width: `${part.max ? Math.min(100, (part.score / part.max) * 100) : 0}%` }} />
                  </i>
                  <strong>
                    {part.score}/{part.max}
                  </strong>
                </li>
              ))}
            </ul>
            {fields.length ? (
              <div className="td-deductions">
                {fields.map((field) => (
                  <article key={field.label} className={`is-${field.state}`}>
                    <header>
                      <b>{field.label}</b>
                      {field.max > 0 ? (
                        <span>
                          {field.points}/{field.max}
                        </span>
                      ) : null}
                    </header>
                    <p>
                      В карточке: {field.got.trim() || 'пусто'}
                      {field.expected.trim() ? ` · По билету: ${field.expected.trim()}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
            {result.recommendations.length ? <p className="td-quiet">{result.recommendations.join(' ')}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="td-play">
        <header>
          <h4>Запись разговора</h4>
          {playable ? (
            <a href={localUrl || `${recording}?download=1`} download={localUrl ? 'zvonok.wav' : undefined}>
              Скачать WAV
            </a>
          ) : null}
        </header>
        {playable ? (
          <audio controls preload="auto" src={playable} />
        ) : (
          <p className="td-quiet">
            Файла к этой попытке нет. Плеер появляется здесь после звонка: можно прослушать и скачать. У этой сессии осталась только стенограмма.
          </p>
        )}
        {lines.length ? (
          <ol className="td-talk">
            {lines.map((line, index) => (
              <li key={`${line.role}-${index}`} className={line.role === 'operator' ? 'is-operator' : 'is-caller'}>
                <span>{line.role === 'operator' ? 'Оператор' : 'Заявитель'}</span>
                {line.text}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <form
        className="td-note"
        onSubmit={(event) => {
          event.preventDefault();
          void onSaveComment(comment);
        }}
      >
        <label>
          Комментарий ученику
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Необязательно" />
        </label>
        <button className="td-btn" type="submit">
          Сохранить
        </button>
      </form>

      {history.length ? (
        <p className="td-quiet">
          {history
            .map(
              (item) =>
                `${formatDateTime(item.at)} · ${item.action}${item.previousValue ? ` · ${item.previousValue} → ${item.newValue}` : ''}${item.reason ? ` · ${item.reason}` : ''}`,
            )
            .join('  ')}
        </p>
      ) : null}
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
          (!outcome ||
            (outcome === 'pending'
              ? !item.confirmed
              : item.confirmed && String(item.passed) === outcome)) &&
          (period === 'all' || Date.parse(item.completedAt) >= Date.now() - 7 * 24 * 60 * 60 * 1000),
      )
        .slice()
        .sort((a, b) => Number(a.confirmed) - Number(b.confirmed) || b.completedAt.localeCompare(a.completedAt)),
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
          <button className="td-btn td-btn--secondary" type="button" onClick={() => downloadResultsXlsx(visible)}>
            Excel группы
          </button>
          <button className="td-btn td-btn--ghost" type="button" onClick={() => printGroupReport(visible)}>
            Печать отчёта
          </button>
        </div>
      </header>
      {selected ? (
        <ResultDetail
          key={selected.id}
          result={selected}
          audit={audit}
          onClose={() => setSelectedId(null)}
          onSaveComment={(value) => onSaveComment(selected.id, value)}
          onAdjustScore={(score, reason) => onAdjustScore(selected.id, score, reason)}
        />
      ) : (
      <>
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
            { value: 'pending', label: 'Ждёт подтверждения' },
          ]}
        />
      </TeacherFilterBar>
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
                  <td>{result.confirmed ? `${result.expertScore}%` : '—'}</td>
                  <td>
                    <StatusBadge tone={result.confirmed ? (result.passed ? 'good' : 'danger') : 'warning'}>
                      {result.confirmed ? `${result.finalScore}%` : 'Ждёт'}
                    </StatusBadge>
                  </td>
                  <td>{result.mistakes.length}</td>
                  <td>{formatDuration(result.durationSec)}</td>
                  <td>
                    <button
                      className="td-btn td-btn--secondary"
                      onClick={() => setSelectedId(result.id)}
                    >
                      {result.confirmed ? 'Подробнее' : 'Подтвердить'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}
    </div>
  );
}
