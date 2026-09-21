import { useState } from 'react';
import type { Arm112Workspace } from '../hooks/use-arm112-workspace';
import type { CallerStatus } from '../model/arm112-models';
import { AddressPanel } from '../components/address-panel';
import { CallerActionRow } from '../components/caller-action-row';
import { DescriptionPanel } from '../components/description-panel';
import { SubscriberDataPanel } from '../components/subscriber-data-panel';
import { EmptyCardDialog, InjuredDialog, ReminderDialog, SaveConfirmDialog, SimpleDialog } from '../components/dialogs';
import { IncidentTypePanel } from '../components/incident-type-panel';
import { MapWindow } from '../components/map-window';
import { PhoneHeader } from '../components/phone-header';
import { QuestionnairePanel } from '../components/questionnaire-panel';
import { ServicesFooter } from '../components/services-footer';
import { ServicesModal } from '../components/services-modal';

type Props = {
  workspace: Arm112Workspace;
  onClose: () => void;
};

export function CardCreateScreen(props: Props) {
  const w = props.workspace;
  const card = w.card;
  const [serviceQuery, setServiceQuery] = useState('');

  return (
    <div className="arm112-card">
      <PhoneHeader
        card={card}
        onAon={(value) => w.setCard({ ...card, caller: { ...card.caller, aon: value } })}
        onProvided={(value) => w.setCard({ ...card, caller: { ...card.caller, providedNumber: value } })}
        onOnScene={(value) => w.setCard({ ...card, caller: { ...card.caller, phoneOnScene: value } })}
        onCopyAon={w.copyAonTo}
        onForeignNumber={(value) => w.setCard({ ...card, caller: { ...card.caller, foreignNumber: value } })}
        onNoSim={(value) => w.setCard({ ...card, caller: { ...card.caller, noSimCard: value } })}
        onOpenRecordings={() => w.setModal('recordings')}
        onOpenSms={() => w.setModal('sms')}
      />
      <CallerActionRow
        card={card}
        onFio={(value) => w.setCard({ ...card, caller: { ...card.caller, familyNameAndGivenName: value } })}
        onStatus={(value) =>
          w.setCard({
            ...card,
            caller: { ...card.caller, callerStatus: (value || null) as CallerStatus | null },
          })
        }
        onChannel={(value) => w.setCard({ ...card, caller: { ...card.caller, communicationChannel: value } })}
        onInjured={() => w.setModal('injured')}
        onToggleNotOnScene={() => w.toggleFlag('notOnSceneOrAmbulanceRefusal')}
        onToggleNoAccess={() => w.toggleFlag('noAccessOrBlocked')}
        onNoContact={() => {
          w.setEmptyReason('нет контакта');
          w.setModal('empty-card');
        }}
        onDropped={() => {
          w.setEmptyReason('срыв звонка');
          w.setModal('empty-card');
        }}
      />
      <div className="arm112-card-body">
        <div className="arm112-left">
          <AddressPanel
            address={card.address}
            onChange={(address) => w.setCard({ ...card, address })}
            onOpenMap={() => w.setMapOpen(true)}
          />
          {card.caller.subscriberData?.fioAbonenta ||
          card.caller.subscriberData?.adresAbonenta ||
          card.caller.subscriberData?.operatorSvyazi ||
          card.caller.subscriberData?.receivedAt ? (
            <SubscriberDataPanel
              data={card.caller.subscriberData}
              onChange={(subscriberData) => w.setCard({ ...card, caller: { ...card.caller, subscriberData } })}
            />
          ) : null}
          <DescriptionPanel
            value={card.descriptionFromCaller}
            limit={card.descriptionCharLimit}
            onChange={(value) => w.setCard({ ...card, descriptionFromCaller: value })}
          />
        </div>
        <div className="arm112-right">
          {card.classification.selectedTypes.length === 0 ? (
            <IncidentTypePanel
              search={card.classification.searchQuery}
              catalog={w.typeCatalog}
              selected={card.classification.selectedTypes}
              frequentChips={w.frequentChips}
              significantTypes={w.significantTypes}
              onSearch={(value) =>
                w.setCard({ ...card, classification: { ...card.classification, searchQuery: value } })
              }
              onSelect={w.selectType}
            />
          ) : (
            <QuestionnairePanel
              selectedTypes={card.classification.selectedTypes}
              additionalQuery={card.classification.additionalTypeQuery}
              catalog={w.typeCatalog}
              items={w.activeQuestionnaire}
              answersByType={card.classification.answersByType}
              onAdditionalQuery={(value) =>
                w.setCard({
                  ...card,
                  classification: { ...card.classification, additionalTypeQuery: value, searchQuery: value },
                })
              }
              onSelectHit={w.selectType}
              onRemoveType={w.selectType}
              onToggle={w.toggleAnswer}
              onFreeText={(type, question, value) => w.setAnswer(type, question, value ? [value] : [])}
            />
          )}
        </div>
      </div>
      <ServicesFooter
        services={card.services}
        important={card.flags.importantIncident}
        onAdd={() => w.setModal('services')}
        onRemove={(name) => w.setCard({ ...card, services: card.services.filter((item) => item.name !== name) })}
        onSave={() => w.setModal('save')}
        onLink={() => undefined}
        onReminder={() => w.setModal('reminder')}
        onImportant={() => w.toggleFlag('importantIncident')}
        onProblem={() => w.setModal('sms')}
        onClose={props.onClose}
      />
      {w.modal === 'services' ? (
        <ServicesModal
          selected={card.services}
          catalog={w.allServices}
          query={serviceQuery}
          onQuery={setServiceQuery}
          onToggle={w.toggleService}
          onClose={() => w.setModal('none')}
        />
      ) : null}
      {w.mapOpen ? (
        <MapWindow address={card.address} onChange={(address) => w.setCard({ ...card, address })} onClose={() => w.setMapOpen(false)} />
      ) : null}
      {w.modal === 'empty-card' ? (
        <EmptyCardDialog
          onFill={() => w.setModal('none')}
          onSaveEmpty={() => {
            w.setModal('none');
            w.setPhase('завершена');
          }}
        />
      ) : null}
      {w.modal === 'injured' ? (
        <InjuredDialog
          value={card.injured.count == null ? '' : String(card.injured.count)}
          onChange={w.setInjuredCount}
          onClose={() => w.setModal('none')}
        />
      ) : null}
      {w.modal === 'reminder' ? <ReminderDialog onClose={() => w.setModal('none')} /> : null}
      {w.modal === 'recordings' ? (
        <SimpleDialog
          title="записи звонков"
          body={
            w.phase === 'активный вызов'
              ? 'Идёт запись текущего вызова. Файл появится после завершения.'
              : 'Записей сохранённых вызовов нет.'
          }
          onClose={() => w.setModal('none')}
        />
      ) : null}
      {w.modal === 'sms' ? (
        <SimpleDialog
          title="список SMS"
          body={w.smsInbox || 'Входящих сообщений по этой карточке нет.'}
          onClose={() => w.setModal('none')}
        />
      ) : null}
      {w.modal === 'save' ? (
        <SaveConfirmDialog onBack={() => w.setModal('none')} onConfirm={w.saveCard} />
      ) : null}
    </div>
  );
}
