import { useState, type ReactNode } from 'react';
import type { DdsShiftRole } from '../../dds-lanes';
import type { ServiceKind } from '../../data/scenarios';
import { serviceChipLabel, splitDdsAddress } from './display';
import type { DdsDraft } from './incoming-card';
import type { DdsIncidentCardViewModel, DdsServiceStatus, DdsStatusEvent } from './types';
import type { DdsStatusForm } from './use-dds-session';

const KINDS: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];

type Modal = 'map' | 'recordings' | 'sms' | 'injured' | null;

type Props = {
  card: DdsIncidentCardViewModel;
  draft: DdsDraft;
  workplace: string;
  role: DdsShiftRole;
  workplaceStatus: DdsServiceStatus;
  naryad: string;
  history: DdsStatusEvent[];
  editingStatus: boolean;
  statusForm: DdsStatusForm;
  statusOptions: DdsServiceStatus[];
  canEditStatus: boolean;
  callbackDone: boolean;
  onPatch: (next: Partial<DdsDraft>) => void;
  onToggleService: (kind: ServiceKind) => void;
  onStartStatus: () => void;
  onCancelStatus: () => void;
  onPatchStatus: (next: Partial<DdsStatusForm>) => void;
  onApplyStatus: () => void;
  onCallback: () => void;
  onClose: () => void;
};

export function DdsCard(props: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const address = splitDdsAddress(props.draft.address);
  const injuredYes = props.draft.injured === 'Есть';

  return (
    <div className="dds-card">
      <header className="dds-phone-bar">
        <div className="dds-phone-cell">
          <div className="dds-phone-top">☎ Отключение</div>
          <div className="dds-hangup-row">
            <button type="button" onClick={() => setModal('recordings')}>
              записи звонков
            </button>
            <button type="button" onClick={() => setModal('sms')}>
              список SMS
            </button>
          </div>
        </div>
        <label className="dds-phone-cell">
          <span className="dds-phone-top">☎ АОН</span>
          <span className="dds-aon-row">
            <input
              value={props.draft.callerPhone}
              onChange={(event) => props.onPatch({ callerPhone: event.target.value })}
              aria-label="АОН"
            />
            <button type="button" onClick={props.onCallback} title="Перезвонить по АОН">
              ☎
            </button>
          </span>
        </label>
        <label className="dds-phone-cell">
          <span className="dds-phone-top">☎ предоставленный</span>
          <span className="dds-aon-row">
            <input
              value={props.draft.callerPhone}
              onChange={(event) => props.onPatch({ callerPhone: event.target.value })}
              aria-label="предоставленный"
            />
            <button type="button" onClick={props.onCallback} title="Перезвонить заявителю">
              ☎
            </button>
          </span>
        </label>
        <label className="dds-phone-cell">
          <span className="dds-phone-top">☎ телефон на место</span>
          <input
            value={props.draft.callerPhone}
            onChange={(event) => props.onPatch({ callerPhone: event.target.value })}
            aria-label="телефон на место"
          />
        </label>
        <div className="dds-id-block">
          <strong>Происшествие {props.card.number}</strong>
          <span>Созд. {props.card.createdAt}</span>
          <span>
            Опер. {props.card.operatorArm}, {props.card.operatorName}
          </span>
        </div>
        <div className="dds-modes">
          <span>просмотр</span>
          <span className="is-on">дополнение</span>
        </div>
      </header>

      <div className="dds-idrow">
        <div className="dds-fio">
          <span>ФИО заявителя</span>
          <input
            value={props.draft.callerName}
            onChange={(event) => props.onPatch({ callerName: event.target.value })}
            aria-label="ФИО заявителя"
          />
        </div>
        <div className="dds-flags">
          <button type="button" className="dds-flag-text" onClick={() => setModal('injured')}>
            Пострадавшие {injuredYes ? 'есть' : 'нет'}
          </button>
          <span>Отказ от скорой: нет</span>
          <span>Заблокированные: нет</span>
          <button type="button" className="dds-flag">
            ЧС
          </button>
          <button type="button" className="dds-flag">
            ЧП
          </button>
          <button
            type="button"
            className="dds-pencil"
            onClick={props.onStartStatus}
            disabled={!props.canEditStatus}
            aria-label="Изменить статус службы"
          >
            ✎
          </button>
        </div>
      </div>

      <div className="dds-body">
        <section className="dds-left">
          <div className="dds-addr-block">
            <div>
              <p className="dds-addr">{address.title}</p>
              {address.okrug ? <p className="dds-okrug">{address.okrug}</p> : null}
            </div>
            <button type="button" className="dds-map-btn" onClick={() => setModal('map')} aria-label="Карта">
              ⌖
            </button>
          </div>
          <p className="dds-note">
            {props.card.createdAt} 0 УМЦ О n.
            <br />
            {props.draft.description}
          </p>
        </section>
        <section className="dds-right">
          <div className="dds-type-bar">{props.card.typeTitle || `Происшествие ${props.card.typeCode}`}</div>
          <div className="dds-tags">{props.card.tags}</div>
          <div className="dds-class">Класс: {props.card.classifierClass};</div>
          <div className="dds-class">ВИС класс:</div>
        </section>
      </div>

      {props.editingStatus ? (
        <>
          {props.history.length ? (
            <div className="dds-hist">
              <header>
                <span>{props.workplace}</span>
                <button type="button" onClick={props.onCancelStatus} aria-label="Закрыть историю">
                  ×
                </button>
              </header>
              <ul>
                {props.history.map((event, index) => (
                  <li key={`${event.at}-${event.status}-${index}`}>
                    <span>оп. 0</span>
                    <div>
                      <b>
                        {event.at} {event.status}
                      </b>
                      {event.comment ? <p>{event.comment}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <form
            className="dds-form"
            onSubmit={(event) => {
              event.preventDefault();
              props.onApplyStatus();
            }}
          >
            <label>
              Статус
              <select
                value={props.statusForm.status}
                onChange={(event) =>
                  props.onPatchStatus({ status: event.target.value as DdsServiceStatus })
                }
              >
                {props.statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Наряд
              <input
                value={props.statusForm.naryad}
                onChange={(event) => props.onPatchStatus({ naryad: event.target.value })}
                aria-label="Номер наряда"
              />
            </label>
            <label>
              Комментарий
              <input
                value={props.statusForm.comment}
                onChange={(event) => props.onPatchStatus({ comment: event.target.value })}
                aria-label="Комментарий"
              />
            </label>
            <button type="submit" className="dds-ok" aria-label="Подтвердить статус">
              ✓
            </button>
            <button type="button" onClick={props.onCancelStatus} aria-label="Отмена">
              ×
            </button>
          </form>
        </>
      ) : null}

      <footer className="dds-footer">
        {KINDS.map((kind) => {
          const on = props.draft.services.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              className={`dds-chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              title={
                on
                  ? `${serviceChipLabel(kind)} привлечена — клик снимет`
                  : `${serviceChipLabel(kind)} не привлечена — клик добавит. 101 пожар, 102 полиция, 103 скорая, 104 газ`
              }
              onClick={() => props.onToggleService(kind)}
            >
              <span>{serviceChipLabel(kind)}</span>
              <small>{on ? `${clockOf(props.history) || '—'} Добавлена` : ''}</small>
            </button>
          );
        })}
        <button
          type="button"
          className={`dds-chip is-work${props.editingStatus ? ' is-edit' : ''}${props.workplaceStatus === 'Работы завершены' ? ' is-done' : ''}`}
          onClick={props.onStartStatus}
        >
          <span>{shortWorkplace(props.workplace)}</span>
          <small>
            {clockOf(props.history)} {props.workplaceStatus}
            {props.naryad ? ` · ${props.naryad}` : ''}
          </small>
        </button>
        <span className="dds-footer-more" aria-hidden="true">
          <b>⌃</b>
          <b>⌄</b>
        </span>
        <span className="dds-footer-spacer" />
        <button type="button" className="dds-doc" onClick={props.onClose} aria-label="Закрыть карточку">
          ▣
        </button>
        <button type="button" className="dds-close" onClick={props.onClose} aria-label="Закрыть">
          ×
        </button>
      </footer>

      {modal === 'map' ? (
        <div className="dds-map" role="dialog" aria-label="С112 - карта">
          <div className="dds-map-title">
            <span>С112 - карта</span>
            <button type="button" onClick={() => setModal(null)}>
              ×
            </button>
          </div>
          <p className="dds-map-addr">{address.title}</p>
          <div className="dds-map-canvas">
            <div className="dds-map-pin" />
          </div>
        </div>
      ) : null}
      {modal === 'recordings' ? (
        <DdsDialog title="Записи звонков" onClose={() => setModal(null)}>
          {props.callbackDone
            ? 'Есть обратный звонок заявителю в этой карточке.'
            : 'Записей нет. Чтобы уточнить данные, нажмите трубку у номера АОН или предоставленного.'}
        </DdsDialog>
      ) : null}
      {modal === 'sms' ? (
        <DdsDialog title="Список SMS" onClose={() => setModal(null)}>
          Входящих SMS по этой карточке нет.
        </DdsDialog>
      ) : null}
      {modal === 'injured' ? (
        <DdsDialog title="Пострадавшие" onClose={() => setModal(null)}>
          <div className="dds-injured-pick">
            <button
              type="button"
              className={injuredYes ? '' : 'is-on'}
              onClick={() => {
                props.onPatch({ injured: 'Нет' });
                setModal(null);
              }}
            >
              нет
            </button>
            <button
              type="button"
              className={injuredYes ? 'is-on' : ''}
              onClick={() => {
                props.onPatch({ injured: 'Есть' });
                setModal(null);
              }}
            >
              есть
            </button>
          </div>
        </DdsDialog>
      ) : null}
    </div>
  );
}

function DdsDialog(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="dds-modal-backdrop">
      <div className="dds-modal" role="dialog" aria-label={props.title}>
        <h2>{props.title}</h2>
        <div>{props.children}</div>
        <button type="button" onClick={props.onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

function clockOf(history: DdsStatusEvent[]): string {
  const last = history.at(-1);
  if (!last) {
    return '';
  }
  const time = last.at.split(' ')[1] ?? last.at;
  return time.slice(0, 5);
}

function shortWorkplace(name: string): string {
  return name.replace(/^ДДС\s+/u, '');
}
