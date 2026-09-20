import { CALLER_STATUSES } from '../model/arm112-models';
import { COMMUNICATION_CHANNELS } from '../data/ui-catalog';
import { mergeClassName, useArmRegionProps } from '../guided/arm-region';
import type { IncidentCard } from '../model/arm112-models';

type Props = {
  card: IncidentCard;
  onFio: (value: string) => void;
  onStatus: (value: string) => void;
  onChannel: (value: string) => void;
  onInjured: () => void;
  onToggleNotOnScene: () => void;
  onToggleNoAccess: () => void;
  onNoContact: () => void;
  onDropped: () => void;
};

export function CallerActionRow(props: Props) {
  const card = props.card;
  const caller = useArmRegionProps('caller');
  const quick = useArmRegionProps('quick-actions');
  return (
    <div
      className={mergeClassName('arm112-caller-row', caller.className)}
      data-arm-region={caller['data-arm-region']}
      onClick={caller.onClick}
    >
      <label className="arm112-field arm112-caller-fio">
        <span className="arm112-label">Фамилия и имя заявителя</span>
        <input
          className="arm112-underline"
          value={card.caller.familyNameAndGivenName}
          onChange={(event) => props.onFio(event.target.value)}
        />
      </label>
      <label className="arm112-field">
        <span className="arm112-label">выберите статус</span>
        <select
          className="arm112-underline"
          value={card.caller.callerStatus ?? ''}
          onChange={(event) => props.onStatus(event.target.value)}
        >
          <option value="">выберите статус</option>
          {CALLER_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="arm112-field">
        <span className="arm112-label">&nbsp;</span>
        <select
          className="arm112-underline"
          value={card.caller.communicationChannel}
          onChange={(event) => props.onChannel(event.target.value)}
        >
          <option value="">выберите статус</option>
          {COMMUNICATION_CHANNELS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <div
        className={mergeClassName('arm112-flag-row', quick.className)}
        data-arm-region={quick['data-arm-region']}
        onClick={quick.onClick}
      >
        <button type="button" className={`arm112-ghost${card.injured.hasInjured ? ' is-on' : ''}`} onClick={props.onInjured}>
          Пострадавшие
        </button>
        <button
          type="button"
          className={`arm112-ghost${card.flags.notOnSceneOrAmbulanceRefusal ? ' is-on' : ''}`}
          onClick={props.onToggleNotOnScene}
        >
          Нет на месте/
          <br />
          Отказ от скорой
        </button>
        <button
          type="button"
          className={`arm112-ghost${card.flags.noAccessOrBlocked ? ' is-on' : ''}`}
          onClick={props.onToggleNoAccess}
        >
          Нет доступа/
          <br />
          Заблокированные
        </button>
        <button type="button" className="arm112-orange-outline" onClick={props.onNoContact}>
          нет контакта
        </button>
        <button type="button" className="arm112-orange-outline" onClick={props.onDropped}>
          срыв звонка
        </button>
      </div>
    </div>
  );
}
