import { OKRUG_OPTIONS } from '../data/ui-catalog';
import { mergeClassName, useArmRegionProps } from '../guided/arm-region';
import type { IncidentAddress } from '../model/arm112-models';

type Props = {
  address: IncidentAddress;
  onChange: (next: IncidentAddress) => void;
  onOpenMap: () => void;
};

export function AddressPanel(props: Props) {
  const a = props.address;
  const region = useArmRegionProps('address');
  function set<K extends keyof IncidentAddress>(key: K, value: IncidentAddress[K]) {
    props.onChange({ ...a, [key]: value });
  }
  function clear() {
    props.onChange({
      searchLine: '',
      country: '',
      subject: '',
      settlement: '',
      object: '',
      okrug: '',
      district: '',
      street: '',
      house: '',
      corpus: '',
      stroenie: '',
      apartment: '',
      entrance: '',
      floor: '',
      code: '',
      descriptiveAddress: '',
      latitude: a.latitude,
      longitude: a.longitude,
    });
  }

  return (
    <section
      className={mergeClassName('arm112-address', region.className)}
      aria-label="Адрес"
      data-arm-region={region['data-arm-region']}
      onClick={region.onClick}
    >
      <div className="arm112-address-head">
        <label className="arm112-label">
          <input type="checkbox" defaultChecked /> Адрес:
        </label>
        <input
          className="arm112-underline"
          aria-label="Адрес"
          placeholder="введите адрес"
          value={a.searchLine}
          onChange={(event) => set('searchLine', event.target.value)}
        />
        <button type="button" className="arm112-icon-btn arm112-map-btn" onClick={props.onOpenMap} aria-label="Карта">
          ⌖
        </button>
        <button type="button" className="arm112-icon-btn" onClick={clear} aria-label="Закрыть адрес">
          ×
        </button>
      </div>
      <div className="arm112-grid-3">
        <label className="arm112-field">
          <span className="arm112-label">Страна:</span>
          <input className="arm112-underline" value={a.country} onChange={(event) => set('country', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Субъект:</span>
          <input className="arm112-underline" value={a.subject} onChange={(event) => set('subject', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Населенный пункт:</span>
          <input className="arm112-underline" value={a.settlement} onChange={(event) => set('settlement', event.target.value)} />
        </label>
      </div>
      <div className="arm112-grid-3">
        <label className="arm112-field">
          <span className="arm112-label">Объект:</span>
          <input className="arm112-underline" value={a.object} onChange={(event) => set('object', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Округ:</span>
          <select className="arm112-underline" value={a.okrug} onChange={(event) => set('okrug', event.target.value)}>
            <option value="" />
            {OKRUG_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Район:</span>
          <input className="arm112-underline" value={a.district} onChange={(event) => set('district', event.target.value)} />
        </label>
      </div>
      <div className="arm112-grid-3">
        <label className="arm112-field">
          <span className="arm112-label">Улица</span>
          <input className="arm112-underline" value={a.street} onChange={(event) => set('street', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Дом/Вл</span>
          <input className="arm112-underline" value={a.house} onChange={(event) => set('house', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Корпус</span>
          <input className="arm112-underline" value={a.corpus} onChange={(event) => set('corpus', event.target.value)} />
        </label>
      </div>
      <div className="arm112-grid-5">
        <label className="arm112-field">
          <span className="arm112-label">Стр/соор:</span>
          <input className="arm112-underline" value={a.stroenie} onChange={(event) => set('stroenie', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Квартира/офис:</span>
          <input className="arm112-underline" value={a.apartment} onChange={(event) => set('apartment', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Подъезд:</span>
          <input className="arm112-underline" value={a.entrance} onChange={(event) => set('entrance', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Этаж:</span>
          <input className="arm112-underline" value={a.floor} onChange={(event) => set('floor', event.target.value)} />
        </label>
        <label className="arm112-field">
          <span className="arm112-label">Код:</span>
          <input className="arm112-underline" value={a.code} onChange={(event) => set('code', event.target.value)} />
        </label>
      </div>
      <label className="arm112-field" style={{ marginTop: 10 }}>
        <span className="arm112-label">Описательный адрес:</span>
        <input
          className="arm112-underline"
          value={a.descriptiveAddress}
          onChange={(event) => set('descriptiveAddress', event.target.value)}
        />
      </label>
      <button type="button" className="arm112-clear-address" onClick={clear}>
        очистить адрес
      </button>
    </section>
  );
}
