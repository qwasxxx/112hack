import { PHONE_MASK } from '../data/ui-catalog';
import { mergeClassName, useArmRegionProps } from '../guided/arm-region';
import { formatTimer } from '../hooks/use-arm112-workspace';
import type { IncidentCard } from '../model/arm112-models';

type Props = {
  card: IncidentCard;
  onAon: (value: string) => void;
  onProvided: (value: string) => void;
  onOnScene: (value: string) => void;
  onCopyAon: (field: 'providedNumber' | 'phoneOnScene') => void;
  onForeignNumber: (value: boolean) => void;
  onNoSim: (value: boolean) => void;
  onOpenRecordings: () => void;
  onOpenSms: () => void;
};

export function PhoneHeader(props: Props) {
  const card = props.card;
  const phones = useArmRegionProps('phones');
  const timer = useArmRegionProps('timer');
  return (
    <header
      className={mergeClassName('arm112-phone-bar', phones.className)}
      data-arm-region={phones['data-arm-region']}
      onClick={phones.onClick}
    >
      <div className="arm112-phone-cell">
        <div className="arm112-phone-top">☎ Отключение</div>
        <div className="arm112-hangup-row">
          <button type="button" onClick={props.onOpenRecordings}>
            записи звонков
          </button>
          <button type="button" onClick={props.onOpenSms}>
            список SMS
          </button>
        </div>
      </div>
      <div className="arm112-phone-cell">
        <div className="arm112-phone-top">☎ АОН</div>
        <div className="arm112-aon-row">
          <input
            className="arm112-underline"
            aria-label="АОН"
            placeholder={PHONE_MASK}
            value={card.caller.aon}
            onChange={(event) => props.onAon(event.target.value)}
          />
        </div>
        <label className="arm112-label">
          <input
            type="checkbox"
            checked={card.caller.foreignNumber}
            onChange={(event) => props.onForeignNumber(event.target.checked)}
          />{' '}
          зарубежный номер
        </label>
        <label className="arm112-label">
          <input
            type="checkbox"
            checked={card.caller.noSimCard}
            onChange={(event) => props.onNoSim(event.target.checked)}
          />{' '}
          без SIM-карты
        </label>
      </div>
      <div className="arm112-phone-cell">
        <div className="arm112-phone-top">☎ предоставленный</div>
        <div className="arm112-aon-row">
          <input
            className="arm112-underline"
            aria-label="предоставленный"
            placeholder={PHONE_MASK}
            value={card.caller.providedNumber}
            onChange={(event) => props.onProvided(event.target.value)}
          />
          <button type="button" className="arm112-copy-aon" onClick={() => props.onCopyAon('providedNumber')}>
            АОН
          </button>
        </div>
      </div>
      <div className="arm112-phone-cell">
        <div className="arm112-phone-top">☎ телефон на место</div>
        <div className="arm112-aon-row">
          <input
            className="arm112-underline"
            aria-label="телефон на место"
            placeholder={PHONE_MASK}
            value={card.caller.phoneOnScene}
            onChange={(event) => props.onOnScene(event.target.value)}
          />
          <button type="button" className="arm112-copy-aon" onClick={() => props.onCopyAon('phoneOnScene')}>
            АОН
          </button>
        </div>
      </div>
      <div className="arm112-phone-cell arm112-id-block">
        <strong>Происшествие {card.number}</strong>
        <span>Созд. {card.createdAt}</span>
        <span>
          Опер. , АРМ {card.armNumber}, {card.operatorLabel}
        </span>
      </div>
      <div
        className={mergeClassName('arm112-timer', card.timer.exceeded && 'is-over', timer.className)}
        data-arm-region={timer['data-arm-region']}
        onClick={timer.onClick}
      >
        <b>{formatTimer(card.timer.elapsedSeconds)}</b>
        <span>минут секунд</span>
      </div>
    </header>
  );
}
