import { useState } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import type { ActiveSession } from '../../domain/entities';
import { difficultyLabels, formatDuration } from '../../domain/value-objects';
import { StatusBadge } from '../components/common';

const DDS_MODES: Array<{
  type: InterventionType;
  label: string;
  lead: string;
  placeholder: string;
}> = [
  {
    type: 'add_circumstance',
    label: 'Новое обстоятельство',
    lead: 'Собеседник на линии сразу скажет это. Если звонка нет — скажет в следующем.',
    placeholder: 'Бригада задерживается, выезд через десять минут',
  },
  {
    type: 'adjust_difficulty',
    label: 'Усложнить',
    lead: 'Собеседник начинает путаться или переспрашивать так, как вы написали.',
    placeholder: 'Не расслышал номер дома и просит повторить адрес',
  },
  {
    type: 'set_emotional_state',
    label: 'Сменить тон',
    lead: 'Тон собеседника на линии станет таким. Факты карточки не меняются.',
    placeholder: 'Раздражён, отвечает коротко и торопит',
  },
];

const MODES: Array<{
  type: InterventionType;
  label: string;
  lead: string;
  placeholder: string;
}> = [
  {
    type: 'add_circumstance',
    label: 'Новое обстоятельство',
    lead: 'Заявитель сразу скажет это вслух и дальше будет держаться этого факта.',
    placeholder: 'Появился пострадавший, лежит без сознания',
  },
  {
    type: 'adjust_difficulty',
    label: 'Усложнить',
    lead: 'Заявитель начнёт путаться и ошибаться так, как вы написали.',
    placeholder: 'Путает номер дома и называет соседний подъезд',
  },
  {
    type: 'set_emotional_state',
    label: 'Сменить тон',
    lead: 'Голос и следующие фразы станут такими. Факты билета не меняются.',
    placeholder: 'Паника: кричит, торопит, путает слова',
  },
];

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
  onBack,
  onIntervene,
}: {
  session: ActiveSession;
  examActions?: unknown;
  onBack: () => void;
  onIntervene: (type: InterventionType, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<InterventionType>('add_circumstance');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardPick, setCardPick] = useState(0);
  const filled = session.requiredActions.filter((item) => item.completed).length;
  const total = session.requiredActions.length;
  const ddsCards = session.ddsCards ?? [];
  const cardIndex = ddsCards.length
    ? Math.min(cardPick, ddsCards.length - 1)
    : 0;
  const picked = ddsCards[cardIndex];
  const fields = picked
    ? [
        ['Карточка', picked.number],
        ['Ситуация', picked.title],
        ['Статус', picked.status],
        ['Наряд', picked.naryad],
        ['Адрес', picked.address],
        ['Пострадавшие', picked.injured],
        ['ФИО', picked.caller],
        ['Телефон', picked.phone],
        ['Связался', picked.contacts],
        ['Ход статусов', picked.history],
      ]
    : Object.entries(session.incidentCard);
  const live = session.status === 'live';
  const dds = session.category === 'ДДС';
  const modes = dds ? DDS_MODES : MODES;
  const selected = modes.find((item) => item.type === mode) ?? modes[0];
  const text = note.trim();
  const canSend = live && text.length > 0 && !busy;

  const send = async () => {
    if (!text) {
      setError('Напишите, что произошло. Без текста указание не уходит.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onIntervene(selected.type, text);
      setSent(`${selected.label}: ${text}`);
      setNote('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить');
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
          <p className="td-kicker">{dds ? 'Наблюдение за сменой ДДС' : 'Наблюдение за вызовом'}</p>
          <h2>{session.student.name}</h2>
          <p>
            {session.scenarioTitle} · {difficultyLabels[session.difficulty]}
          </p>
        </div>
        <div className={`td-session-clock ${live ? 'is-live' : ''}`}>
          <span>
            {dds ? 'Смена ДДС' : live ? 'Идёт вызов' : session.status === 'paused' ? 'Подготовка' : 'Завершение'}
          </span>
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
            <h3>{dds ? 'Ход смены' : 'Разговор'}</h3>
            {live ? <span className="td-live">● LIVE</span> : <span className="td-help">ожидание</span>}
          </div>
          {session.transcript.length ? (
            session.transcript.map((line) => (
              <article className={`td-message td-message--${line.role}`} key={line.id}>
                <div>
                  <strong>
                    {line.speaker ||
                      (line.role === 'student'
                        ? dds
                          ? 'Диспетчер'
                          : 'Оператор'
                        : line.role === 'caller'
                          ? dds
                            ? 'Служба'
                            : 'Заявитель'
                          : 'Карточка')}
                  </strong>
                  <time>{formatLineTime(line.at)}</time>
                </div>
                <p>{line.text}</p>
              </article>
            ))
          ) : (
            <p className="td-observe-empty">
              {dds
                ? 'Здесь появятся статусы карточки и звонки: службе, начальнику, бригаде и оператору 112.'
                : 'Реплики появятся, когда ученик начнёт разговор.'}
            </p>
          )}
        </section>

        <aside className="td-panel td-observe-card">
          <div className="td-section-title">
            <h3>{dds ? 'Карточка ДДС' : 'Карточка происшествия'}</h3>
            <span className="td-help">
              {filled}/{total || 0} заполнено
            </span>
          </div>
          {ddsCards.length > 1 ? (
            <div className="td-dds-switch" role="tablist" aria-label="Карточки смены">
              {ddsCards.map((card, index) => (
                <button
                  key={card.id}
                  type="button"
                  className={index === cardIndex ? 'is-on' : ''}
                  onClick={() => setCardPick(index)}
                >
                  {card.number}
                  {card.active ? ' · сейчас' : ''}
                </button>
              ))}
            </div>
          ) : null}
          <dl className="td-card-fields">
            {fields.length ? (
              fields.map(([key, value]) => {
                const valueText = String(value ?? '').trim();
                return (
                  <div key={key} className={valueText ? 'is-filled' : 'is-empty'}>
                    <dt>{key}</dt>
                    <dd>{valueText || 'не заполнено'}</dd>
                  </div>
                );
              })
            ) : (
              <p className="td-observe-empty">Карточка ещё не открыта.</p>
            )}
          </dl>
          {!picked && session.requiredActions.length > 0 && (
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
              <h3>{dds ? 'Вмешательство' : 'Ход звонка'}</h3>
              <span className="td-help">
                {dds
                  ? 'Текст уходит в текущий звонок: начальнику, бригаде, оператору 112 или службе. Если линии нет, сработает в следующем звонке.'
                  : 'Сначала текст, потом одно действие. Пока не отправите — в звонке ничего не меняется.'}
              </span>
            </div>
          </div>
          {sent && (
            <p className="td-observe-sent" role="status">
              Ушло в звонок: {sent}
            </p>
          )}
          {error && <p className="td-observe-error">{error}</p>}
          <div className="td-cue-modes" role="radiogroup" aria-label="Что сделать">
            {modes.map((item) => (
              <button
                key={item.type}
                type="button"
                role="radio"
                aria-checked={mode === item.type}
                className={`td-cue-mode ${mode === item.type ? 'is-selected' : ''}`}
                onClick={() => setMode(item.type)}
              >
                <strong>{item.label}</strong>
                <span>{item.lead}</span>
              </button>
            ))}
          </div>
          <label className="td-field">
            Что произошло
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setError(null);
              }}
              placeholder={selected.placeholder}
              rows={3}
            />
          </label>
          <button type="button" className="td-btn td-btn--primary td-cue-send" disabled={!canSend} onClick={() => void send()}>
            {busy ? 'Отправка…' : live ? (dds ? 'Отправить в смену' : 'Отправить в звонок') : 'Нет живого занятия'}
          </button>
        </section>
      </div>
    </div>
  );
}
