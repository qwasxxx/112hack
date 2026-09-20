import { MAP_LAYERS, MAP_RADIUS_OPTIONS } from '../data/ui-catalog';
import type { IncidentAddress } from '../model/arm112-models';

type Props = {
  address: IncidentAddress;
  onChange: (next: IncidentAddress) => void;
  onClose: () => void;
};

export function MapWindow(props: Props) {
  return (
    <div className="arm112-map" role="dialog" aria-label="С112 - карта">
      <div className="arm112-map-title">
        <span>С112 - карта</span>
        <button type="button" onClick={props.onClose}>
          ×
        </button>
      </div>
      <div className="arm112-map-tools">
        <input
          className="arm112-underline"
          style={{ width: 110 }}
          aria-label="Широта"
          placeholder="Широта"
          value={props.address.latitude}
          onChange={(event) => props.onChange({ ...props.address, latitude: event.target.value })}
        />
        <input
          className="arm112-underline"
          style={{ width: 110 }}
          aria-label="Долгота"
          placeholder="Долгота"
          value={props.address.longitude}
          onChange={(event) => props.onChange({ ...props.address, longitude: event.target.value })}
        />
        <button type="button" className="arm112-ghost">
          ОК
        </button>
        <button type="button" className="arm112-ghost">
          Указать на карте
        </button>
        <select defaultValue="50 м" aria-label="Радиус">
          {MAP_RADIUS_OPTIONS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select aria-label="Слой" defaultValue="">
          <option value="">Слой</option>
          {MAP_LAYERS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="arm112-map-canvas">
        <div className="arm112-map-canvas-pin" />
      </div>
    </div>
  );
}
