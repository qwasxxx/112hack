import { useState } from 'react';
import { journalTime } from './adapter';
import { splitDdsAddress } from './display';
import type { DdsQueueItemState, DdsIncidentCardViewModel, DdsServiceStatus } from './types';

type Item = {
  card: DdsIncidentCardViewModel;
  state: DdsQueueItemState;
  sourceLabel?: string;
  role?: 'own' | 'foreign';
  workplaceStatus?: DdsServiceStatus;
  shortLine?: string;
};

type Props = {
  query: string;
  onQuery: (value: string) => void;
  items: Item[];
  clock: string;
  seconds: string;
  weekday: string;
  readyToClose?: boolean;
  onOpen: (id: string) => void;
  onLeave: () => void;
  onFinishShift?: () => void;
};

export function DdsJournal(props: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const visible = props.items.filter((item) => {
    const hay = `${item.card.number} ${item.card.typeCode} ${item.card.description} ${item.card.addressLine}`.toLowerCase();
    return hay.includes(props.query.trim().toLowerCase());
  });

  return (
    <div className="dds-journal">
      <header className="dds-journal-head">
        <div className="dds-journal-search">
          <h2>Поиск происшествий</h2>
          <button type="button" className="dds-linkish">
            расширенный по параметрам
            <span aria-hidden="true">▾</span>
          </button>
        </div>
        <div className="dds-journal-tools">
          {searchOpen || props.query ? (
            <input
              autoFocus
              value={props.query}
              onChange={(event) => props.onQuery(event.target.value)}
              aria-label="Поиск происшествий"
            />
          ) : (
            <span className="dds-search-spacer" />
          )}
          <button
            type="button"
            className="dds-icon-btn"
            onClick={() => setSearchOpen((value) => !value)}
            aria-label="Поиск"
          >
            <SearchIcon />
          </button>
          <button type="button" className="dds-reset" onClick={() => props.onQuery('')}>
            сбросить
          </button>
        </div>
        <div className="dds-clock">
          <div className="dds-clock-date">
            <span>{props.weekday}</span>
            <span className="dds-clock-icons">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="dds-clock-meta">
            <span>УМЦ| О п</span>
            <button type="button" className="dds-clock-user" onClick={props.onLeave} aria-label="выйти">
              <UserIcon />
            </button>
          </div>
          <div className="dds-clock-time">
            {props.clock}
            <small>{props.seconds}</small>
          </div>
        </div>
      </header>

      <div className="dds-list-wrap">
        <div className="dds-list-head">
          <p className="dds-list-title">
            Список происшествий <span>▲</span>
          </p>
          <label className="dds-notify">
            <i className="dds-bell" />
            уведомления
            <select defaultValue="">
              <option value="">выберите что показать</option>
            </select>
          </label>
        </div>

        <div className="dds-cols">
          <span />
          <span>Связи</span>
          <span>ЧС</span>
          <span>Опер.</span>
          <span>АРМ</span>
          <span>Номер</span>
          <span>
            Дата <span className="dds-sort">↓</span>
          </span>
          <span>Время</span>
          <span className="dds-col-type">Тип происшествия</span>
          <span>Постр.</span>
          <span>Адрес</span>
          <span>Статус службы</span>
          <span />
        </div>

        {visible.map((item) => {
          const time = journalTime(item.card);
          const status = statusLabel(item);
          const address = splitDdsAddress(item.card.addressLine);
          const addr = address.okrug ? `${address.title.replace(/^Россия,\s*/u, '')}` : item.card.addressLine;
          return (
            <article key={item.card.id} className="dds-row-block">
              <button
                type="button"
                className={`dds-row${item.state === 'completed' || item.state === 'transferred' ? ' is-done' : ''}`}
                onClick={() => props.onOpen(item.card.id)}
              >
                <span className="dds-chevron">▾</span>
                <span className="dds-link-cell">
                  <LinkIcon />
                </span>
                <span className="dds-chs">
                  <LightningIcon />
                  <TargetIcon />
                </span>
                <span className="dds-oper">0</span>
                <span>4</span>
                <span>{item.card.number}</span>
                <span>{time.date}</span>
                <span className="dds-time">{time.time}</span>
                <span className="dds-type">{item.card.typeCode}</span>
                <span>{item.card.injured}</span>
                <span className="dds-row-addr">{addr}</span>
                <span className="dds-status-cell">
                  <FlagIcon />
                  {status}
                </span>
                <span className="dds-doc-ico">
                  <DocIcon />
                </span>
              </button>
              <div className="dds-desc">
                Описание: {item.card.createdAt} УМЦ| О. п. —{' '}
                <b>{item.shortLine || shortLine(item.card.description)}</b>
              </div>
            </article>
          );
        })}

        <div className="dds-page-row">
          <span>
            Страница: <u>1</u>
          </span>
          <span>Записей на странице: 10</span>
          <span>
            1-{visible.length} из {visible.length}
          </span>
          <button type="button" disabled>
            ‹
          </button>
          <button type="button" disabled>
            ›
          </button>
        </div>
        {props.readyToClose ? (
          <div className="dds-finish-bar">
            <p>Все карточки закрыты.</p>
            <button type="button" onClick={props.onFinishShift}>
              Завершить смену
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function statusLabel(item: Item): string {
  if (item.state === 'completed') {
    return item.workplaceStatus ?? 'Работы завершены';
  }
  if (item.state === 'transferred') {
    return 'Не принято';
  }
  return item.workplaceStatus ?? 'Добавлена';
}

function shortLine(text: string): string {
  const cut = text.split(/[,.]/)[0]?.trim() ?? text;
  return cut.length > 42 ? `${cut.slice(0, 40)}…` : cut;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M15 15l7 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="none"
        stroke="#e4e8ea"
        strokeWidth="1.7"
        d="M6.2 9.8 9.8 6.2M7 5.2l1.2-1.2a2.4 2.4 0 1 1 3.4 3.4L10.4 9M9 10.8l-1.2 1.2a2.4 2.4 0 1 1-3.4-3.4L5.6 7"
      />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg viewBox="0 0 12 16" width="10" height="14" aria-hidden="true">
      <path fill="#cfd3d6" d="M7 0 0 9h5L3 16l9-10H7z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="#c62828" strokeWidth="1.4" />
      <circle cx="7" cy="7" r="2" fill="#c62828" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true">
      <path fill="#e67a2a" d="M1 0v12h1.4V7.2L9 4.6 2.4 2.2V0z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <circle cx="6" cy="3.4" r="2.2" fill="none" stroke="#c5cdd2" strokeWidth="1.2" />
      <path d="M1.8 11c.4-2.6 2-3.8 4.2-3.8S9.8 8.4 10.2 11" fill="none" stroke="#c5cdd2" strokeWidth="1.2" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 14 16" width="12" height="14" aria-hidden="true">
      <path fill="#ddd" d="M3 0h6l4 4v12H3z" />
      <path fill="#8e9498" d="M9 0v4h4" />
    </svg>
  );
}
