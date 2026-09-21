import { useState } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import type { ActiveSession } from '../../domain/entities';
import { difficultyLabels, formatDuration } from '../../domain/value-objects';
import { StatusBadge } from '../components/common';

interface Action {
  type: InterventionType;
  label: string;
  hint: string;
}

function formatLineTime(value: string): string {
  const stamp = Date.parse(value);
  if (Number.isFinite(stamp)) {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
      stamp,
    );
  }
  return value;
}

export function ObservationPage({
  session,
  examActions,
  onBack,
  onIntervene,
}: {
  session: ActiveSession;
  examActions: Action[];
  onBack: () => void;
  onIntervene: (type: InterventionType, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const filled = session.requiredActions.filter((item) => item.completed).length;
  const total = session.requiredActions.length;
  const fields = Object.entries(session.incidentCard);
  const live = session.status === 'live';
  const act = async (action: Action) => {
    if (!window.confirm(`Отправить ученику «${action.label}»?`)) {
      return;
    }
    setBusy(true);
    try {
      await onIntervene(action.type, note || action.hint);
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="td-page td-observe-page">
      <header className="td-page-head td-observe-head">
        <div>
          <button className="td-back" onClick={onBack}>
            ← Активные занятия
          </button>
          <p className="td-kicker">Наблюдение за вызовом</p>
          <h2>{session.student.name}</h2>
          <p>
            {session.scenarioTitle} · {difficultyLabels[session.difficulty]}
          </p>
        </div>
        <div className={`td-session-clock ${live ? 'is-live' : ''}`}>
          <span>{live ? 'Идёт вызов' : session.status === 'paused' ? 'Подготовка' : 'Завершение'}</span>
          <strong>{formatDuration(session.durationSec)}</strong>
        </div>
      </header>

      <div className="td-observe-summary">
        <StatusBadge tone={session.mode === 'exam' ? 'warning' : 'neutral'}>
          {session.category || (session.mode === 'exam' ? 'Экзамен' : 'Тренировка')}
        </StatusBadge>
        <div className="td-observe-meter" title="Заполнение карточки">
          <span>Карточка</span>
          <b>
            <i style={{ width: `${session.cardProgress}%` }} />
          </b>
          <strong>{session.cardProgress}%</strong>
        </div>
        <span>
          Поля {filled}/{total || 0}
        </span>
      </div>

      <div className="td-observe-grid">
        <section className="td-panel td-transcript">
          <div className="td-section-title">
            <h3>Разговор</h3>
            {live ? <span className="td-live">● LIVE</span> : <span className="td-help">ожидание</span>}
          </div>
          {session.transcript.length ? (
            session.transcript.map((line) => (
              <article className={`td-message td-message--${line.role}`} key={line.id}>
                <div>
                  <strong>
                    {line.role === 'student' ? 'Оператор' : line.role === 'caller' ? 'Заявитель' : 'Система'}
                  </strong>
                  <time>{formatLineTime(line.at)}</time>
                </div>
                <p>{line.text}</p>
              </article>
            ))
          ) : (
            <p className="td-observe-empty">Реплики появятся, когда ученик начнёт разговор.</p>
          )}
        </section>

        <aside className="td-panel td-observe-card">
          <div className="td-section-title">
            <h3>Карточка происшествия</h3>
            <span className="td-help">
              {filled}/{total || 0} заполнено
            </span>
          </div>
          <dl className="td-card-fields">
            {fields.length ? (
              fields.map(([key, value]) => {
                const text = String(value ?? '').trim();
                return (
                  <div key={key} className={text ? 'is-filled' : 'is-empty'}>
                    <dt>{key}</dt>
                    <dd>{text || 'не заполнено'}</dd>
                  </div>
                );
              })
            ) : (
              <p className="td-observe-empty">Карточка ещё не открыта.</p>
            )}
          </dl>
          {session.requiredActions.length > 0 && (
            <>
              <h4>Обязательные поля</h4>
              <ul className="td-checklist">
                {session.requiredActions.map((item) => (
                  <li key={item.id} className={item.completed ? 'is-done' : ''}>
                    <span>{item.completed ? '✓' : ''}</span>
                    {item.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <section className="td-panel td-observe-intervene">
          <div className="td-section-title">
            <div>
              <h3>Вмешательство</h3>
              <span className="td-help">Указание сразу появится у ученика на АРМ</span>
            </div>
          </div>
          <label className="td-field">
            Комментарий
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Например: уточните этаж и есть ли там люди"
            />
          </label>
          <div className="td-action-grid">
            {examActions.map((action) => (
              <button
                disabled={busy}
                key={action.type}
                className="td-action-btn"
                onClick={() => void act(action)}
              >
                <strong>{action.label}</strong>
                <span>{action.hint}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
