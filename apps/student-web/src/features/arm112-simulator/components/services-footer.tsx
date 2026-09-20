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

function Icon(props: { path: string; label: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <title>{props.label}</title>
      <path fill="currentColor" d={props.path} />
    </svg>
  );
}

const ICONS = {
  link: 'M10.6 13.4a4 4 0 0 1 0-5.6l2.8-2.8a4 4 0 1 1 5.6 5.6l-1.3 1.3-1.4-1.4 1.3-1.3a2 2 0 1 0-2.8-2.8l-2.8 2.8a2 2 0 0 0 0 2.8l.7.7-1.4 1.4zm2.8-2.8a4 4 0 0 1 0 5.6l-2.8 2.8a4 4 0 1 1-5.6-5.6l1.3-1.3 1.4 1.4-1.3 1.3a2 2 0 1 0 2.8 2.8l2.8-2.8a2 2 0 0 0 0-2.8l-.7-.7z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.6 3.2 1.9-.8 1.4L11 13.5V7h2z',
  hand: 'M17 8.2V6.5a1.5 1.5 0 0 0-3 0V11h-.5V4.8a1.5 1.5 0 0 0-3 0V11H10V5.8a1.5 1.5 0 0 0-3 0V14L5.2 11.6a1.5 1.5 0 0 0-2.3 1.9L6.6 20A3 3 0 0 0 9.1 21H15a4 4 0 0 0 4-4V9.7a1.5 1.5 0 0 0-3 0V12h1V8.2z',
  comment: 'M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4v2h12V8zm0 4v2h8v-2z',
  close: 'M6.2 5 5 6.2 10.8 12 5 17.8 6.2 19 12 13.2 17.8 19 19 17.8 13.2 12 19 6.2 17.8 5 12 10.8z',
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
        <button type="button" className="arm112-plus" onClick={props.onAdd} aria-label="Добавить службу">
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
          <Icon path={ICONS.link} label="связь" />
        </button>
        <button type="button" className="arm112-icon-btn" onClick={props.onReminder} aria-label="Установить напоминание">
          <Icon path={ICONS.clock} label="напоминание" />
        </button>
        <button
          type="button"
          className={`arm112-icon-btn${props.important ? ' is-on' : ''}`}
          onClick={props.onImportant}
          aria-label="Важное происшествие"
        >
          <Icon path={ICONS.hand} label="важное" />
        </button>
        <button type="button" className="arm112-icon-btn" onClick={props.onProblem} aria-label="Сообщить о проблеме">
          <Icon path={ICONS.comment} label="проблема" />
        </button>
        <button type="button" className="arm112-icon-btn" onClick={props.onClose} aria-label="Закрыть">
          <Icon path={ICONS.close} label="закрыть" />
        </button>
      </div>
    </footer>
  );
}
