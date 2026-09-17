import { mergeClassName, useArmRegionProps } from '../guided/arm-region';
import type { ServiceAssignment } from '../model/arm112-models';

type Props = {
  services: ServiceAssignment[];
  important: boolean;
  saveLabel?: string;
  onAdd: () => void;
  onRemove: (name: string) => void;
  onSave: () => void;
  onLink: () => void;
  onReminder: () => void;
  onImportant: () => void;
  onProblem: () => void;
  onClose: () => void;
};

export function ServicesFooter(props: Props) {
  const services = useArmRegionProps('services');
  const footer = useArmRegionProps('footer');
  return (
    <footer className="arm112-footer">
      <div
        className={mergeClassName('arm112-services', services.className)}
        data-arm-region={services['data-arm-region']}
        onClick={services.onClick}
      >
        <span>Службы:</span>
        {props.services.map((service) => (
          <span key={service.name} className={`arm112-service-chip${service.isMainForType ? ' is-main' : ''}`}>
            {service.name}
            {service.visMark ? ' ВИС' : ''}
            <button type="button" onClick={() => props.onRemove(service.name)} aria-label="Удалить службу">
              ×
            </button>
          </span>
        ))}
        <button type="button" className="arm112-plus" onClick={props.onAdd}>
          +
        </button>
      </div>
      <div
        className={mergeClassName('arm112-footer-actions', footer.className)}
        data-arm-region={footer['data-arm-region']}
        onClick={footer.onClick}
      >
        <button type="button" className="arm112-orange-fill" onClick={props.onSave}>
          {props.saveLabel ?? 'сохранить'}
        </button>
        <button type="button" className="arm112-icon-btn" onClick={props.onLink} aria-label="Создание связи">
          ⛓
        </button>
        <button type="button" className="arm112-icon-btn" onClick={props.onReminder} aria-label="Установить напоминание">
          ⏱
        </button>
        <button
          type="button"
          className={`arm112-icon-btn${props.important ? ' is-on' : ''}`}
          onClick={props.onImportant}
          aria-label="Важное происшествие"
        >
          ✋
        </button>
        <button type="button" className="arm112-icon-btn" onClick={props.onProblem} aria-label="Сообщить о проблеме">
          ▤
        </button>
        <button type="button" className="arm112-icon-btn" onClick={props.onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
    </footer>
  );
}
