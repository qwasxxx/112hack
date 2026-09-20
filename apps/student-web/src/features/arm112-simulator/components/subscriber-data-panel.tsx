import type { SubscriberData } from '../model/arm112-models';

type Props = {
  data?: SubscriberData;
  onChange: (next: SubscriberData) => void;
};

const EMPTY: SubscriberData = {
  receivedAt: '',
  operatorSvyazi: '',
  fioAbonenta: '',
  dateOfBirth: '',
  adresAbonenta: '',
};

export function SubscriberDataPanel(props: Props) {
  const data = props.data ?? EMPTY;
  return (
    <section className="arm112-subscriber" aria-label="Данные абонента">
      <p className="arm112-label">Данные абонента</p>
      <div className="arm112-subscriber-meta">
        <input
          className="arm112-underline"
          aria-label="Время получения"
          placeholder="дата и время"
          value={data.receivedAt}
          onChange={(event) => props.onChange({ ...data, receivedAt: event.target.value })}
        />
        <input
          className="arm112-underline"
          aria-label="Оператор связи"
          placeholder="Оператор связи"
          value={data.operatorSvyazi}
          onChange={(event) => props.onChange({ ...data, operatorSvyazi: event.target.value })}
        />
      </div>
      <p className="arm112-subscriber-line">
        <span className="arm112-label">ФИО абонента:</span>
        <input
          className="arm112-underline"
          value={data.fioAbonenta}
          onChange={(event) => props.onChange({ ...data, fioAbonenta: event.target.value })}
        />
        <span className="arm112-label">Дата рождения:</span>
        <input
          className="arm112-underline"
          value={data.dateOfBirth}
          onChange={(event) => props.onChange({ ...data, dateOfBirth: event.target.value })}
        />
      </p>
      <label className="arm112-field">
        <span className="arm112-label">Адрес абонента:</span>
        <input className="arm112-underline" value={data.adresAbonenta} onChange={(event) => props.onChange({ ...data, adresAbonenta: event.target.value })} />
      </label>
    </section>
  );
}
