import { useState } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import { calculateRisk } from '../../application/services/risk-radar';
import type { ActiveSession } from '../../domain/entities';
import { difficultyLabels, emotionLabels, formatDuration } from '../../domain/value-objects';
import { Sparkline, StatusBadge } from '../components/common';

interface Action { type: InterventionType; label: string; hint: string }

export function ObservationPage({ session, examActions, onBack, onIntervene }: { session: ActiveSession; examActions: Action[]; onBack: () => void; onIntervene: (type: InterventionType, note: string) => Promise<void> }) {
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const risk = calculateRisk(session.riskSignals);
  const actions: Action[] = [...examActions, { type: 'reveal_fact', label: 'Открыть факт', hint: 'Сделать факт доступным заявителю' }, { type: 'conceal_fact', label: 'Скрыть факт', hint: 'Временно скрыть обстоятельство' }, { type: 'end_call', label: 'Завершить вызов', hint: 'Перевести mock-сессию к завершению' }];
  const act = async (action: Action) => {
    if (!window.confirm(`Подтвердить mock-действие «${action.label}»? Оно изменит только данные в памяти.`)) return;
    setBusy(true); try { await onIntervene(action.type, note || action.hint); setNote(''); } finally { setBusy(false); }
  };
  return <div className="td-page"><header className="td-page-head"><div><button className="td-back" onClick={onBack}>← Активные занятия</button><p className="td-kicker">Рабочее место наблюдения</p><h2>{session.student.name}</h2><p>{session.scenarioTitle} · {difficultyLabels[session.difficulty]}</p></div><div className="td-session-clock"><span>{session.status === 'paused' ? 'Пауза' : 'Идёт вызов'}</span><strong>{formatDuration(session.durationSec)}</strong></div></header>
    <div className="td-observation-summary"><StatusBadge tone={session.mode === 'exam' ? 'warning' : 'neutral'}>{session.mode === 'exam' ? 'Экзамен' : 'Тренировка'}</StatusBadge><span>Карточка {session.cardProgress}%</span><span>Действия {session.foundActions}/{session.foundActions + session.missedActions}</span><span>Заявитель: {emotionLabels[session.emotionalState.primary]}</span><StatusBadge tone={risk.level === 'high' ? 'danger' : risk.level === 'medium' ? 'warning' : 'good'}>Риск {risk.score}/100</StatusBadge></div>
    <div className="td-observe-grid">
      <section className="td-panel td-transcript"><div className="td-section-title"><h3>Live-транскрипция</h3><span className="td-live">● LIVE</span></div>{session.transcript.map((line) => <article className={`td-message td-message--${line.role}`} key={line.id}><div><strong>{line.role === 'student' ? 'Оператор' : line.role === 'caller' ? 'Заявитель' : 'Система'}</strong><time>{line.at}</time></div><p>{line.text}</p></article>)}</section>
      <aside className="td-panel"><h3>Карточка происшествия</h3><dl className="td-card-fields">{Object.entries(session.incidentCard).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><h4>Обязательные действия</h4><ul className="td-checklist">{session.requiredActions.map((item) => <li key={item.id} className={item.completed ? 'is-done' : ''}><span>{item.completed ? '✓' : '!'}</span>{item.label}</li>)}</ul></aside>
      <section className="td-panel"><div className="td-section-title"><h3>Центр внимания</h3><Sparkline values={session.riskHistory} label="Изменение риска" /></div><div className={`td-risk-callout td-risk-callout--${risk.level}`}><strong>{risk.score}/100</strong><span>Демонстрационный аналитический показатель</span></div><ul className="td-reasons">{risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="td-recommendation">Рекомендация: {risk.recommendation}</p><h4>Нарушения регламента</h4>{session.protocolViolations.length ? <ul className="td-reasons">{session.protocolViolations.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="td-muted">Нарушений не зафиксировано</p>}<div className="td-current-score"><span>Текущая оценка</span><strong>{session.currentScore}%</strong></div></section>
      <section className="td-panel"><div className="td-section-title"><div><h3>Вмешательство преподавателя</h3><span className="td-help">Только mock · серверная команда не отправляется</span></div></div><label className="td-field">Комментарий / параметры<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Например: заявитель сообщает о ребёнке на этаже" /></label><div className="td-action-grid">{actions.map((action) => <button disabled={busy} key={action.type} className="td-action-btn" onClick={() => void act(action)}><strong>{action.label}</strong><span>{action.hint}</span></button>)}</div></section>
    </div>
    <section className="td-panel"><h3>Лента событий и вмешательств</h3><ol className="td-timeline">{[...session.timeline].reverse().map((event) => <li key={event.id} className={`is-${event.kind}`}><time>{event.at}</time><div><strong>{event.title} {event.mock && <StatusBadge tone="accent">mock</StatusBadge>}</strong><p>{event.detail}</p></div></li>)}</ol></section>
  </div>;
}
