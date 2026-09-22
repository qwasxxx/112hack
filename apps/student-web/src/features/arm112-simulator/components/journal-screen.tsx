import { Fragment, useEffect, useState } from 'react';
import { JOURNAL_COLUMNS, JOURNAL_NAV } from '../data/ui-catalog';
import type { TelephonyStatus } from '../model/arm112-models';

const SAMPLE_ROWS = [
  {
    number: '179968',
    date: '25.06.19',
    time: '20:15',
    what: 'Природная стихия',
    injured: '',
    status: 'Не оповещено',
    address: 'Москва, Метрополис, (САО, Войковский район), г. Москва',
    description: '',
    bad: true,
  },
  {
    number: '3633538',
    date: '22.04.19',
    time: '14:01',
    what: '101',
    injured: '',
    status: 'Зарегистрирована',
    address: 'г. Москва, ул. Ивана Сусанина, 3, (САО, Западное Дегунино)',
    description: 'Сигнализация',
    bad: false,
  },
  {
    number: '3633535',
    date: '22.04.19',
    time: '14:01',
    what: 'Помощь службам',
    injured: 'Нет',
    status: 'Зарегистрирована',
    address: 'г. Москва, проезд. Дорожный 3-й, 1, (ЮАО, Чертаново Южное)',
    description: 'транспортировка больного в карету 103, вес 230 кг',
    bad: false,
  },
];

type Props = {
  telephonyStatus: TelephonyStatus;
  onCreateCard: () => void;
  onToggleTelephony: () => void;
};

export function JournalScreen(props: Props) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const weekday = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Insert') {
        event.preventDefault();
        props.onCreateCard();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onCreateCard]);

  return (
    <div className="arm112-journal">
      <header className="arm112-journal-top">
        <div className="arm112-journal-search">
          <h1>Поиск происшествий</h1>
          <div className="arm112-journal-search-row">
            <input aria-label="Поиск происшествий" />
            <button type="button" className="arm112-ghost">
              сбросить
            </button>
            <button type="button" className="arm112-ghost">
              новый поиск
            </button>
          </div>
          <button type="button" className="arm112-linkish" onClick={() => setAdvanced((value) => !value)}>
            расширенный по параметрам
          </button>
          {advanced ? (
            <div className="arm112-grid-4" style={{ marginTop: 8 }}>
              {[
                'Что случилось',
                'АРМ',
                'Статус',
                'Адрес',
                'Описательный адрес',
                'Служба',
                'Субъект',
                'Описание',
                'Заявитель (ФИО/АОН)',
                'Канал связи',
                'Оператор',
                'Источник происшествия',
                'Номер карточки',
              ].map((label) => (
                <label key={label} className="arm112-field">
                  <span className="arm112-label">{label}</span>
                  <input className="arm112-underline" />
                </label>
              ))}
              <label className="arm112-field">
                <span className="arm112-label">дата и время</span>
                <input className="arm112-underline" type="datetime-local" />
              </label>
            </div>
          ) : null}
        </div>
        <div className="arm112-clock-block">
          <div className="arm112-clock-date">{weekday}</div>
          <div className="arm112-clock-tools">
            <button type="button">настроить</button>
            <button type="button">справка</button>
            <button type="button">выйти</button>
            <button type="button" onClick={props.onToggleTelephony}>
              {props.telephonyStatus}
            </button>
          </div>
          <div className="arm112-clock-time">
            {time}
            <small>{String(now.getSeconds()).padStart(2, '0')}</small>
          </div>
        </div>
        <button type="button" className="arm112-create-card" onClick={props.onCreateCard}>
          создать новую карточку
        </button>
      </header>

      <nav className="arm112-journal-nav" aria-label="Разделы АРМ">
        {JOURNAL_NAV.map((item, index) => (
          <button key={item} type="button" className={index === 0 ? 'is-on' : undefined}>
            {item}
          </button>
        ))}
      </nav>

      <div className="arm112-journal-filters">
        <strong>Список происшествий</strong>
        <label>
          уведомление <input type="checkbox" />
        </label>
        <label>
          автообновление <input type="checkbox" />
        </label>
        <label>
          обращения в очереди <input type="checkbox" />
        </label>
        <select aria-label="выберите что показывать" defaultValue="">
          <option value="">выберите что показывать</option>
          <option>Новые СМС</option>
          <option>пустые карточки</option>
        </select>
      </div>

      <div className="arm112-table-wrap">
        <table className="arm112-journal-table">
          <thead>
            <tr>
              {JOURNAL_COLUMNS.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ROWS.map((row) => (
              <Fragment key={row.number}>
                <tr>
                  <td />
                  <td />
                  <td>0</td>
                  <td />
                  <td>{row.number}</td>
                  <td>{row.date}</td>
                  <td>{row.time}</td>
                  <td>{row.what}</td>
                  <td>{row.injured}</td>
                  <td className={row.bad ? 'is-bad' : undefined}>{row.status}</td>
                  <td>{row.address}</td>
                  <td />
                </tr>
                {row.description ? (
                  <tr>
                    <td className="arm112-journal-desc" colSpan={JOURNAL_COLUMNS.length}>
                      Описание: {row.description}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="arm112-pager">
        <span>Страница: 1</span>
        <span>Записей на странице: 10</span>
        <span>1-3 из 3</span>
      </div>
    </div>
  );
}
