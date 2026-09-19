import { useEffect, useState } from 'react';
import { SERVICE_LABEL } from '../../data/scenarios';
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

  return (
    <div className="dds-page">
      <header className="dds-bar">
        <div>
          <h1>ДДС · проверка карточки</h1>
          <p>
            Поступила карточка оператора 112 · {props.scenario.code} · без звонка заявителю
          </p>
        </div>
        <div>
          {session.view === 'card' && !session.result ? (
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
            activeId={null}
            clock={clock}
            weekday={weekday}
            onOpen={() => session.openCard()}
          />
        ) : (
          <DdsCard
            card={session.card}
            draft={session.draft}
            onPatch={session.patch}
            onToggleService={session.toggleService}
            onDispatch={session.dispatchCard}
            onClose={session.closeCard}
          />
        )}
        {session.result ? (
          <section className="dds-result" aria-label="Результат проверки">
            <h2>{session.result.servicesOk ? 'Службы направлены верно' : 'Есть ошибки в службах'}</h2>
            <ul>
              <li>
                Службы:{' '}
                {session.result.servicesOk
                  ? 'совпали с происшествием'
                  : [
                      ...session.result.missing.map((item) => `не хватает: ${SERVICE_LABEL[item]}`),
                      ...session.result.extra.map((item) => `лишняя: ${SERVICE_LABEL[item]}`),
                    ].join('; ')}
              </li>
              <li>Пострадавшие: {session.result.injuredOk ? 'верно' : 'надо было исправить по тексту карточки'}</li>
              <li>Телефон: {session.result.phoneOk ? 'на месте' : 'в карточке не хватало номера'}</li>
              <li>Время: {Math.round(session.result.elapsedMs / 1000)} с</li>
            </ul>
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
