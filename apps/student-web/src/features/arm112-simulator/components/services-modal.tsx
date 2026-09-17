import type { ServiceAssignment } from '../model/arm112-models';

type CatalogService = { short: string; full: string };

type Props = {
  selected: ServiceAssignment[];
  catalog: CatalogService[];
  query: string;
  onQuery: (value: string) => void;
  onToggle: (service: CatalogService) => void;
  onClose: () => void;
};

export function ServicesModal(props: Props) {
  const q = props.query.trim().toLowerCase();
  const list = props.catalog.filter((item) => !q || item.full.toLowerCase().includes(q) || item.short.toLowerCase().includes(q));
  return (
    <div className="arm112-modal-backdrop">
      <div className="arm112-modal" role="dialog" aria-label="Добавьте службы">
        <h2>Добавьте службы</h2>
        <input className="arm112-underline" placeholder="Поиск ..." value={props.query} onChange={(event) => props.onQuery(event.target.value)} />
        <div className="arm112-modal-list">
          {list.map((service) => (
            <button
              key={service.short}
              type="button"
              className={props.selected.some((item) => item.name === service.short) ? 'is-on' : undefined}
              onClick={() => props.onToggle(service)}
            >
              {service.full}
            </button>
          ))}
        </div>
        <div className="arm112-modal-actions">
          <button type="button" className="arm112-orange-outline" onClick={props.onClose}>
            Сохранить и закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
