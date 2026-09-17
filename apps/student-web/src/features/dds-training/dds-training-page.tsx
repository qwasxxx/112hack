import { useEffect, useMemo, useState } from 'react';
import type { TrainingScenario } from '../../data/scenarios';
import { DdsCard } from './dds-card';
import { DdsJournal } from './dds-journal';
import { useDdsSession } from './use-dds-session';
import './dds-training.css';

type Props = {
  scenario: TrainingScenario;
  onLeave: () => void;
};

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = [
  'Января',
  'Февраля',
  'Марта',
  'Апреля',
  'Мая',
  'Июня',
  'Июля',
  'Августа',
  'Сентября',
  'Октября',
  'Ноября',
  'Декабря',
];

export function DdsTrainingPage(props: Props) {
  const session = useDdsSession(props.scenario);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const weekday = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const doneCount = session.items.filter((item) => item.state === 'completed').length;

  const summary = useMemo(() => {
    if (!session.result) {
      return null;
    }
    return session.result;
  }, [session.result]);

  return (
    <div className="dds-page">
      <header className="dds-bar">
        <div>
          <h1>ДДС · действия с карточкой</h1>
          <p>
            Учебная очередь {doneCount}/{session.items.length} · {props.scenario.title} · не диспетчерский контур
          </p>
        </div>
        <div>
          {session.allDone && !session.result ? (
            <button type="button" onClick={session.finishExercise}>
              Результат
            </button>
          ) : null}
          {session.view === 'card' ? (
            <button type="button" onClick={session.closeCard}>
              К списку
            </button>
          ) : null}
          <button type="button" onClick={props.onLeave}>
            К уроку
          </button>
        </div>
      </header>
      <div className="dds-shell">
        {session.view === 'journal' ? (
          <DdsJournal
            query={query}
            onQuery={setQuery}
            items={session.items}
            activeId={session.active?.card.id ?? null}
            clock={clock}
            weekday={weekday}
            onOpen={session.openCard}
          />
        ) : session.active ? (
          <DdsCard
            card={session.active.card}
            editing={session.editing}
            historyOpen={session.historyOpen}
            draftStatus={session.draftStatus}
            draftComment={session.draftComment}
            draftNaryad={session.draftNaryad}
            onDraftStatus={session.setDraftStatus}
            onDraftComment={session.setDraftComment}
            onDraftNaryad={session.setDraftNaryad}
            onStartEdit={session.startEdit}
            onCancelEdit={session.cancelEdit}
            onConfirm={session.confirmStatus}
            onToggleHistory={() => session.setHistoryOpen((value) => !value)}
            onClose={session.closeCard}
          />
        ) : null}
        {summary ? (
          <section className="dds-result" aria-label="Результат упражнения">
            <h2>Отработка карточек завершена</h2>
            <p>
              Сценарий {summary.scenarioId} · {Math.round(summary.elapsedMs / 1000)} с · действий {summary.actions.length}
              {session.learning
                ? ` · режим ${session.learning.mode} · карточка ${session.learning.cardData?.number ?? '—'}`
                : ''}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Карточка</th>
                  <th>Статус</th>
                  <th>Сек.</th>
                  <th>Комментарии</th>
                </tr>
              </thead>
              <tbody>
                {summary.cards.map((card) => (
                  <tr key={card.cardId}>
                    <td>{card.number}</td>
                    <td>{card.finalStatus}</td>
                    <td>{Math.round(card.elapsedMs / 1000)}</td>
                    <td>{card.textEntries.join('; ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              <button type="button" onClick={props.onLeave}>
                К уроку
              </button>
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
