import { useState, type ReactNode } from 'react';
import type { DdsShiftRole } from '../../dds-lanes';
import { EVIDENCED_SERVICE_LINES, parseServiceLine } from '../arm112-simulator/data/gsi-services';
import { ownChipLabel, splitDdsAddress } from './display';
import type { DdsDraft } from './incoming-card';
import type { DdsIncidentCardViewModel, DdsServiceChip, DdsServiceStatus, DdsStatusEvent } from './types';
import type { DdsStatusForm } from './use-dds-session';

type Modal = 'map' | 'recordings' | 'sms' | 'injured' | 'services' | 'sheet' | null;
type CardMode = 'view' | 'edit';

const CATALOG = EVIDENCED_SERVICE_LINES.map(parseServiceLine);

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
  chs: boolean;
  chp: boolean;
  onToggleMark: (key: 'chs' | 'chp') => void;
  onPatch: (next: Partial<DdsDraft>) => void;
  onStartStatus: () => void;
  onCancelStatus: () => void;
  onPatchStatus: (next: Partial<DdsStatusForm>) => void;
  onApplyStatus: () => void;
  onCallback: () => void;
  onContactService: (label: string, phone: string) => void;
  onCallChief: () => void;
  onCallCrew: () => void;
  onReport112: () => void;
  formError?: string | null;
  routeHint?: string | null;
  onClose: () => void;
};

export function DdsCard(props: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const [mode, setMode] = useState<CardMode>('edit');
  const [historyOf, setHistoryOf] = useState<'own' | string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overflow, setOverflow] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const address = splitDdsAddress(props.draft.address);
  const injuredYes = props.draft.injured === 'Есть';
  const ownLabel = ownChipLabel(props.workplace, props.draft.address);
  const others = props.card.services.filter(
    (item) => item.status !== 'Не принято' && item.shortLabel !== ownLabel,
  );
  const main = others.slice(0, 8);
  const rest = others.slice(8);
  const historyChip =
    historyOf && historyOf !== 'own' ? others.find((item) => item.id === historyOf) ?? null : null;
  const showOwnHistory = historyOf === 'own' || props.editingStatus;
  const q = catalogQuery.trim().toLowerCase();
  const catalog = CATALOG.filter(
    (item) => !q || item.full.toLowerCase().includes(q) || item.short.toLowerCase().includes(q),
  );
  const onCard = new Set(others.map((item) => item.shortLabel));
  onCard.add(ownLabel);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3200);
  }

  function openOwn() {
    setHistoryOf('own');
    if (props.canEditStatus) {
      props.onStartStatus();
    }
  }

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
            <input value={props.draft.callerPhone} readOnly aria-label="АОН" />
            <button type="button" onClick={props.onCallback} title="Перезвонить по АОН">
              ☎
            </button>
          </span>
        </label>
        <label className="dds-phone-cell">
          <span className="dds-phone-top">☎ предоставленный</span>
          <span className="dds-aon-row">
            <input value={props.draft.callerPhone} readOnly aria-label="предоставленный" />
            <button type="button" onClick={props.onCallback} title="Перезвонить заявителю">
              ☎
            </button>
          </span>
        </label>
        <label className="dds-phone-cell">
          <span className="dds-phone-top">☎ телефон на место</span>
          <input value={props.draft.callerPhone} readOnly aria-label="телефон на место" />
        </label>
        <div className="dds-id-block">
          <strong>Происшествие {props.card.number}</strong>
          <span>Созд. {props.card.createdAt}</span>
          <span>
            Опер. {props.card.operatorArm}, {props.card.operatorName}
          </span>
        </div>
        <div className="dds-modes">
          <button type="button" className={mode === 'view' ? 'is-on' : ''} onClick={() => setMode('view')}>
            просмотр
          </button>
          <button type="button" className={mode === 'edit' ? 'is-on' : ''} onClick={() => setMode('edit')}>
            дополнение
          </button>
          <button
            type="button"
            className="dds-lamp"
            onClick={() => setModal('map')}
            aria-label="Показать адрес на карте"
            title="Адрес на карте"
          >
            <LampIcon />
          </button>
        </div>
      </header>

      <div className="dds-idrow">
        <div className="dds-fio">
          <span>ФИО заявителя</span>
          <input value={props.draft.callerName} readOnly aria-label="ФИО заявителя" />
        </div>
        <div className="dds-flags">
          <button
            type="button"
            className="dds-flag-text"
            onClick={() =>
              flash('Пострадавших в карточке 112 не правят. Если ошибка — звонок бригаде, затем сообщение в 112.')
            }
          >
            Пострадавшие {injuredYes ? 'есть' : 'нет'}
          </button>
          <span>Отказ от скорой: нет</span>
          <span>Заблокированные: нет</span>
          <button
            type="button"
            className={`dds-flag${props.chs ? ' is-on' : ''}`}
            aria-pressed={props.chs}
            title="Чрезвычайная ситуация"
            onClick={() => props.onToggleMark('chs')}
          >
            ЧС
          </button>
          <button
            type="button"
            className={`dds-flag${props.chp ? ' is-on' : ''}`}
            aria-pressed={props.chp}
            title="Чрезвычайное происшествие"
            onClick={() => props.onToggleMark('chp')}
          >
            ЧП
          </button>
          <button
            type="button"
            className="dds-pencil"
            onClick={() => {
              setHistoryOf('own');
              props.onStartStatus();
            }}
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

      {showOwnHistory && props.history.length ? (
        <div className="dds-hist" role="dialog" aria-label={`История ${ownLabel}`}>
          <header>
            <span>{ownLabel}</span>
            <button type="button" onClick={() => setHistoryOf(null)} aria-label="Закрыть историю">
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

      {historyChip ? (
        <div className="dds-hist" role="dialog" aria-label={`История ${historyChip.shortLabel}`}>
          <header>
            <span>{historyChip.shortLabel}</span>
            <button type="button" onClick={() => setHistoryOf(null)} aria-label="Закрыть историю">
              ×
            </button>
          </header>
          <ul>
            {historyChip.history.map((event, index) => (
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
          {historyChip.phone ? (
            <button
              type="button"
              className="dds-hist-call"
              onClick={() => {
                setHistoryOf(null);
                props.onContactService(historyChip.shortLabel, historyChip.phone ?? '');
              }}
            >
              Связаться {historyChip.phone}
            </button>
          ) : (
            <p className="dds-hist-none">Номера нет</p>
          )}
        </div>
      ) : null}

      {props.editingStatus ? (
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
            Номер наряда
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
              aria-invalid={props.formError ? true : undefined}
              className={props.formError ? 'dds-field-bad' : undefined}
            />
            {props.formError ? <span className="dds-field-hint">{props.formError}</span> : null}
          </label>
          <button type="submit" className="dds-ok" aria-label="Подтвердить статус">
            ✓
          </button>
          <button type="button" onClick={props.onCancelStatus} aria-label="Отмена">
            ×
          </button>
        </form>
      ) : null}

      {overflow ? (
        <div className="dds-overflow">
          {rest.map((chip) => (
            <ChipButton key={chip.id} chip={chip} onClick={() => setHistoryOf(chip.id)} />
          ))}
          <button
            type="button"
            className={`dds-chip is-work${props.editingStatus ? ' is-edit' : ''}${props.workplaceStatus === 'Работы завершены' ? ' is-done' : ''}`}
            onClick={openOwn}
          >
            <span>
              {ownLabel}
              {props.canEditStatus ? ' ✎' : ''}
            </span>
            <small>
              {clockOf(props.history)} {props.workplaceStatus}
            </small>
          </button>
        </div>
      ) : null}

      <footer className="dds-footer">
        <button type="button" className="dds-services-fab" onClick={() => setModal('services')}>
          <span>СлужБис</span>
          <b>+</b>
        </button>
        {main.map((chip) => (
          <ChipButton key={chip.id} chip={chip} onClick={() => setHistoryOf(chip.id)} />
        ))}
        <button
          type="button"
          className="dds-footer-more"
          onClick={() => setOverflow((value) => !value)}
          aria-label="Ещё службы"
        >
          <b>⌃</b>
          <b>⌄</b>
        </button>
        <span className="dds-footer-spacer" />
        <button
          type="button"
          className="dds-doc"
          onClick={() => setModal('sheet')}
          aria-label="Текст карточки"
          title="Текст карточки"
        >
          ▣
        </button>
        <button type="button" className="dds-close" onClick={props.onClose} aria-label="К списку происшествий" title="К списку">
          ×
        </button>
      </footer>
      <div className="dds-routes">
        <button type="button" onClick={props.onCallChief}>
          Начальник
        </button>
        <button type="button" onClick={props.onCallCrew}>
          Бригада
        </button>
        <button type="button" onClick={props.onReport112}>
          Сообщить в 112
        </button>
      </div>
      {notice || props.routeHint ? <p className="dds-notice">{notice || props.routeHint}</p> : null}

      {modal === 'services' ? (
        <div className="dds-modal-backdrop">
          <div className="dds-modal dds-services-modal" role="dialog" aria-label="Добавьте службы">
            <button type="button" className="dds-modal-x" onClick={() => setModal(null)} aria-label="Закрыть">
              ×
            </button>
            <h2>Добавьте службы</h2>
            <input
              className="dds-catalog-search"
              placeholder="Поиск ..."
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              aria-label="Поиск службы"
            />
            <div className="dds-catalog-list">
              {catalog.map((service) => (
                <button
                  key={service.short}
                  type="button"
                  className={onCard.has(service.short) ? 'is-on' : undefined}
                  onClick={() =>
                    flash(
                      onCard.has(service.short)
                        ? `«${service.short}» уже получила эту карточку.`
                        : 'В карточке ДДС службы не добавляются. Видно, кому она уже ушла.',
                    )
                  }
                >
                  {service.full}
                </button>
              ))}
            </div>
            <button type="button" className="dds-catalog-save" onClick={() => setModal(null)}>
              Сохранить и закрыть
            </button>
          </div>
        </div>
      ) : null}
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
            ? 'Есть звонок по этой карточке.'
            : 'Записей нет. Трубка у АОН — звонок заявителю. Чип службы — история, связь если есть номер.'}
        </DdsDialog>
      ) : null}
      {modal === 'sms' ? (
        <DdsDialog title="Список SMS" onClose={() => setModal(null)}>
          Входящих SMS по этой карточке нет.
        </DdsDialog>
      ) : null}
      {modal === 'sheet' ? (
        <DdsDialog title={`Карточка ${props.card.number}`} onClose={() => setModal(null)}>
          <p>{address.title}</p>
          <p>{props.card.typeTitle}</p>
          <p>{props.draft.description}</p>
          <p>
            {props.draft.callerName || 'Заявитель не указан'}
            {props.draft.callerPhone ? ` · ${props.draft.callerPhone}` : ''}
          </p>
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

function ChipButton(props: { chip: DdsServiceChip; onClick: () => void }) {
  return (
    <button type="button" className="dds-chip is-on" onClick={props.onClick}>
      <span>{props.chip.shortLabel}</span>
      <small>
        {props.chip.statusTime} {props.chip.status}
      </small>
    </button>
  );
}

function LampIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 2h8v4l3 3v2h-3l-1 2H9L8 11H5V9l2-3V2zm3 14h2v4h-2z"
      />
    </svg>
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
