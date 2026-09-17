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
    <section style={{ padding: '6px 10px', borderTop: '1px solid #d0d0d0', background: '#fafafa' }} aria-label="Данные абонента">
      <p className="arm112-label">Данные абонента</p>
      <div className="arm112-grid-3">
        <label className="arm112-field">
          <span className="arm112-label">Оператор связи</span>
          <input className="arm112-underline" value={data.operatorSvyazi} onChange={(event) => props.onChange({ ...data, operatorSvyazi: event.target.value })} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">ФИО абонента</span>
          <input className="arm112-underline" value={data.fioAbonenta} onChange={(event) => props.onChange({ ...data, fioAbonenta: event.target.value })} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Дата рождения</span>
          <input className="arm112-underline" value={data.dateOfBirth} onChange={(event) => props.onChange({ ...data, dateOfBirth: event.target.value })} />
        </label>
      </div>
      <label className="arm112-field" style={{ marginTop: 6 }}>
        <span className="arm112-label">Адрес абонента</span>
        <input className="arm112-underline" value={data.adresAbonenta} onChange={(event) => props.onChange({ ...data, adresAbonenta: event.target.value })} />
      </label>
    </section>
  );
}
