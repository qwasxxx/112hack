import { journalTime } from './adapter';
import type { DdsQueueItemState, DdsIncidentCardViewModel } from './types';

type Item = {
  card: DdsIncidentCardViewModel;
  state: DdsQueueItemState;
};

type Props = {
  query: string;
  onQuery: (value: string) => void;
  items: Item[];
  activeId: string | null;
  clock: string;
  weekday: string;
  onOpen: (id: string) => void;
};

export function DdsJournal(props: Props) {
  const visible = props.items.filter((item) => {
    const hay = `${item.card.number} ${item.card.typeCode} ${item.card.description} ${item.card.addressLine}`.toLowerCase();
    return hay.includes(props.query.trim().toLowerCase());
  });

  return (
    <div className="dds-journal">
      <header className="dds-journal-head">
        <div>
          <h2>Поиск происшествий</h2>
          <div className="dds-search-row">
            <span>расширенный по параметрам</span>
            <input
              value={props.query}
              onChange={(event) => props.onQuery(event.target.value)}
              aria-label="Поиск происшествий"
            />
            <button type="button" onClick={() => props.onQuery('')}>
              сбросить
            </button>
          </div>
        </div>
        <div className="dds-clock">
          <span>{props.weekday}</span>
          <strong>{props.clock}</strong>
          <span>УМЦ О n</span>
        </div>
      </header>
      <div className="dds-list-wrap">
        <p className="dds-list-title">Список происшествий</p>
        <div className="dds-cols">
          <span>Связи</span>
          <span>ЧС</span>
          <span>Опер.</span>
          <span>АРМ</span>
          <span>Номер</span>
          <span>Дата</span>
          <span>Время</span>
          <span>Тип происшествия</span>
          <span>Постр.</span>
          <span>Адрес</span>
          <span>Статус службы</span>
          <span />
        </div>
        {visible.map((item) => {
          const time = journalTime(item.card);
          const service = item.card.services.find((chip) => chip.status === 'Добавлена');
          return (
            <article key={item.card.id} className="dds-row-block">
              <button
                type="button"
                className={`dds-row${item.state === 'selected' || item.state === 'editing' ? ' is-active' : ''}${item.state === 'completed' ? ' is-done' : ''}`}
                onClick={() => props.onOpen(item.card.id)}
              >
                <span />
                <span />
                <span>0</span>
                <span>4</span>
                <b>{item.card.number}</b>
                <span>{time.date}</span>
                <span>{time.time}</span>
                <span>{item.card.typeCode}</span>
                <span>{item.card.injured}</span>
                <span>{item.card.addressLine}</span>
                <span className="dds-status-cell">{service?.status ?? 'Добавлена'}</span>
                <span />
              </button>
              <div className="dds-desc">
                Описание: {item.card.createdAt} УМЦ О n. {item.card.description}
              </div>
            </article>
          );
        })}
        <div className="dds-page-row">
          <span>Страница: 1</span>
          <span>Записей на странице: {visible.length} из {visible.length}</span>
        </div>
      </div>
    </div>
  );
}
