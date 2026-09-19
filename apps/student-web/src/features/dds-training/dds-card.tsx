import { SERVICE_LABEL, type ServiceKind } from '../../data/scenarios';
import type { DdsIncidentCardViewModel } from './types';
import type { DdsDraft } from './incoming-card';
import { serviceCaption } from './incoming-card';

const KINDS: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];

type Props = {
  card: DdsIncidentCardViewModel;
  draft: DdsDraft;
  onPatch: (next: Partial<DdsDraft>) => void;
  onToggleService: (kind: ServiceKind) => void;
  onDispatch: () => void;
  onClose: () => void;
};

export function DdsCard(props: Props) {
  return (
    <div className="dds-card">
      <div className="dds-card-top">
        <div className="dds-tools">
          <span className="dds-from">Карточка от оператора 112</span>
        </div>
        <label className="dds-phone">
          <span>АОН</span>
          <input
            value={props.draft.callerPhone}
            onChange={(event) => props.onPatch({ callerPhone: event.target.value })}
            aria-label="Телефон АОН"
          />
        </label>
        <label className="dds-phone">
          <span>предоставленный</span>
          <input
            value={props.draft.callerPhone}
            onChange={(event) => props.onPatch({ callerPhone: event.target.value })}
            aria-label="Предоставленный телефон"
          />
        </label>
        <div className="dds-meta">
          <div className="dds-meta-text">
            <strong>Происшествие {props.card.number}</strong>
            <div>Созд. {props.card.createdAt}</div>
            <div>
              Опер., {props.card.operatorArm}, {props.card.operatorName}
            </div>
          </div>
          <div className="dds-modes">
            <span className="is-on">дополнение</span>
          </div>
        </div>
      </div>

      <div className="dds-idrow">
        <label>
          ФИО заявителя
          <input
            value={props.draft.callerName}
            onChange={(event) => props.onPatch({ callerName: event.target.value })}
          />
        </label>
        <div className="dds-flags">
          <label>
            Пострадавшие
            <select
              value={props.draft.injured}
              onChange={(event) => props.onPatch({ injured: event.target.value })}
            >
              <option value="Нет">нет</option>
              <option value="Есть">есть</option>
            </select>
          </label>
        </div>
      </div>

      <div className="dds-body">
        <section className="dds-left">
          <h3>Адрес</h3>
          <textarea
            className="dds-addr-input"
            value={props.draft.address}
            onChange={(event) => props.onPatch({ address: event.target.value })}
            rows={3}
          />
          <label className="dds-desc-label">
            Что произошло
            <textarea
              value={props.draft.description}
              onChange={(event) => props.onPatch({ description: event.target.value })}
              rows={4}
            />
          </label>
        </section>
        <section className="dds-right">
          <div className="dds-type-bar">Направление в службы</div>
          <p className="dds-hint">Отметьте службы, которые должны получить карточку. Лишние снимите.</p>
          <div className="dds-pick">
            {KINDS.map((kind) => {
              const on = props.draft.services.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  className={`dds-pick-btn${on ? ' is-on' : ''}`}
                  onClick={() => props.onToggleService(kind)}
                >
                  {serviceCaption(kind)}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="dds-footer">
        {KINDS.map((kind) => {
          const on = props.draft.services.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              className={`dds-chip${on ? ' is-edit' : ''}`}
              onClick={() => props.onToggleService(kind)}
            >
              {SERVICE_LABEL[kind]}
              <small>{on ? 'Направить' : 'Не направлять'}</small>
            </button>
          );
        })}
        <button type="button" className="dds-send" onClick={props.onDispatch}>
          Подтвердить и направить
        </button>
        <button type="button" className="dds-close" onClick={props.onClose} aria-label="Закрыть">
          ×
        </button>
      </footer>
    </div>
  );
}
