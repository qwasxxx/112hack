import type { Arm112Workspace } from '../hooks/use-arm112-workspace';
import { PhoneHeader } from '../components/phone-header';
import { ServicesFooter } from '../components/services-footer';

type Props = {
  workspace: Arm112Workspace;
  onClose: () => void;
};

export function CardViewScreen(props: Props) {
  const card = props.workspace.card;
  const typeLabel = card.classification.selectedTypes[0] ?? '';

  return (
    <div className="arm112-card">
      <PhoneHeader
        card={card}
        onAon={() => undefined}
        onProvided={() => undefined}
        onOnScene={() => undefined}
        onCopyAon={() => undefined}
        onForeignNumber={() => undefined}
        onNoSim={() => undefined}
        onOpenRecordings={() => props.workspace.setModal('recordings')}
        onOpenSms={() => props.workspace.setModal('sms')}
      />
      <div className="arm112-caller-row">
        <div>
          <div>{card.caller.familyNameAndGivenName}</div>
          <div className="arm112-label">
            {card.address.searchLine}
            {card.address.okrug ? `, (${card.address.okrug}${card.address.district ? `, ${card.address.district}` : ''})` : ''}
          </div>
        </div>
        <div className="arm112-flag-row">
          <span>Пострадавшие: {card.injured.count ?? 0}</span>
          <button type="button" className="arm112-ghost">
            ЧС
          </button>
          <button type="button" className="arm112-ghost">
            ЧП
          </button>
          <button type="button" className="arm112-ghost is-on">
            просмотр
          </button>
          <button type="button" className="arm112-ghost">
            дополнение
          </button>
        </div>
      </div>
      <div className="arm112-view">
        <div className="arm112-view-left">
          <p className="arm112-label">Описание со слов заявителя</p>
          <p>{card.descriptionFromCaller}</p>
        </div>
        <div className="arm112-view-right">
          <div className="arm112-type-bar">{typeLabel || card.classification.classifier.priznak1 || 'Происшествие'}</div>
          {card.classification.classifier.matchedNumbers.length > 0 ? (
            <p className="arm112-label">
              {card.classification.classifier.matchedNumbers.slice(0, 3).join(', ')}
            </p>
          ) : null}
        </div>
      </div>
      <div className="arm112-otrabotka">
        <span className="arm112-label">Опер.</span>
        <span className="arm112-label">Дата и время</span>
        <span className="arm112-label">Служба</span>
        <span className="arm112-label">Куда звонили</span>
        <span className="arm112-label">Телефон</span>
        <span className="arm112-label">ФИО</span>
        <span className="arm112-label">Суть сообщения</span>
        <span />
        <input />
        <input />
        <select>
          <option>служба</option>
          {card.services.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>
        <input placeholder="куда" />
        <input placeholder="телефон" />
        <input placeholder="кто принял" />
        <input placeholder="суть сообщения" />
        <button type="button" className="arm112-plus">
          ✓
        </button>
      </div>
      <ServicesFooter
        services={card.services}
        important={card.flags.importantIncident}
        saveLabel="отработана"
        onAdd={() => props.workspace.setModal('services')}
        onRemove={() => undefined}
        onSave={props.workspace.markOtrabotana}
        onLink={() => undefined}
        onReminder={() => props.workspace.setModal('reminder')}
        onImportant={() => undefined}
        onProblem={() => undefined}
        onClose={props.onClose}
      />
    </div>
  );
}
