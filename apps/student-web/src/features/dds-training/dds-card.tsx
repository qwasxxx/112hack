import {
  DDS_FIRST_RESPONSE_STATUSES,
  DDS_FOLLOWUP_STATUSES,
  DDS_TERMINAL_STATUSES,
  type DdsIncidentCardViewModel,
  type DdsServiceStatus,
} from './types';

type Props = {
  card: DdsIncidentCardViewModel;
  editing: boolean;
  historyOpen: boolean;
  draftStatus: DdsServiceStatus;
  draftComment: string;
  draftNaryad: string;
  onDraftStatus: (value: DdsServiceStatus) => void;
  onDraftComment: (value: string) => void;
  onDraftNaryad: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onConfirm: () => void;
  onToggleHistory: () => void;
  onClose: () => void;
};

export function DdsCard(props: Props) {
  const editable = props.card.services.find((item) => item.editable);
  const firstWave = !editable || editable.status === 'Добавлена' || editable.status === 'Получена службой';
  const options = firstWave ? DDS_FIRST_RESPONSE_STATUSES : DDS_FOLLOWUP_STATUSES;

  return (
    <div className="dds-card">
      <div className="dds-card-top">
        <div className="dds-tools">
          <button type="button">Отключение</button>
          <div>
            <button type="button">записи звонков</button>
            <button type="button">список SMS</button>
          </div>
        </div>
        <div className="dds-phone">
          <span>АОН</span>
          <div>{props.card.aon || '+7 ( ) - -'}</div>
        </div>
        <div className="dds-phone">
          <span>предоставленный</span>
          <div>{props.card.providedPhone || '+7 ( ) - -'}</div>
        </div>
        <div className="dds-phone">
          <span>телефон на место</span>
          <div>{props.card.phoneOnSite || '+7 ( ) - -'}</div>
        </div>
        <div className="dds-meta">
          <div className="dds-meta-text">
            <strong>Происшествие {props.card.number}</strong>
            <div>Созд. {props.card.createdAt}</div>
            <div>
              Опер., {props.card.operatorArm}, {props.card.operatorName}
            </div>
          </div>
          <div className="dds-modes">
            <button type="button" className="is-on">
              просмотр
            </button>
            <button type="button">дополнение</button>
          </div>
        </div>
      </div>

      <div className="dds-idrow">
        <span>ФИО заявителя {props.card.callerName}</span>
        <div className="dds-flags">
          <span>Пострадавшие: {props.card.injured === 'Нет' ? 'нет' : props.card.injured}</span>
          <span>Отказ от скорой: нет</span>
          <span>Заблокированные: нет</span>
          <button type="button" title="ЧС">
            ЧС
          </button>
          <button type="button" title="ЧП">
            ЧП
          </button>
          <button type="button" title="Статус службы" onClick={props.onStartEdit}>
            ✎
          </button>
        </div>
      </div>

      <div className="dds-body">
        <section className="dds-left">
          <h3>Адрес</h3>
          <div className="dds-addr">{props.card.addressLine || '—'}</div>
          <p>{props.card.okrug}</p>
          <div className="dds-note">
            <div>{props.card.createdAt} 0 УМЦ О n.</div>
            <div>{props.card.description}</div>
          </div>
        </section>
        <section className="dds-right">
          <div className="dds-type-bar">Происшествие {props.card.typeCode || props.card.typeTitle}</div>
          <div className="dds-tags">{props.card.tags || '—'}</div>
          <div className="dds-class">Класс: {props.card.classifierClass || '—'}</div>
          {props.card.classifierNumber ? (
            <div className="dds-class">
              Классификатор Лист1: {props.card.classifierNumber}
              {props.card.classifierRow ? ` r${props.card.classifierRow}` : ''}
            </div>
          ) : null}
          <div className="dds-class">[ВИС] класс: {props.card.visClass}</div>
        </section>
      </div>

      <footer className="dds-footer">
        {props.card.services.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`dds-chip${chip.editable ? ' is-edit' : ''}${DDS_TERMINAL_STATUSES.includes(chip.status) ? ' is-done' : ''}`}
            onClick={() => {
              if (chip.editable) {
                props.onToggleHistory();
              }
            }}
          >
            {chip.shortLabel}
            <small>
              {chip.statusTime} {chip.status}
            </small>
          </button>
        ))}
        <button type="button" className="dds-more" aria-label="Ещё службы">
          ↕
        </button>
        <button type="button" className="dds-close" onClick={props.onClose} aria-label="Закрыть">
          ×
        </button>
      </footer>

      {props.historyOpen && editable ? (
        <div className="dds-hist">
          <header>
            <strong>{editable.label}</strong>
            <button type="button" onClick={props.onToggleHistory}>
              ×
            </button>
          </header>
          <ul>
            {editable.history.map((event) => (
              <li key={`${event.at}-${event.status}`}>
                оп. 0 &gt; {event.at} {event.status}
                {event.comment ? ` — ${event.comment}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {props.editing ? (
        <form
          className="dds-form"
          onSubmit={(event) => {
            event.preventDefault();
            props.onConfirm();
          }}
        >
          <label>
            Статус
            <select value={props.draftStatus} onChange={(event) => props.onDraftStatus(event.target.value as DdsServiceStatus)}>
              {options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Номер наряда
            <input value={props.draftNaryad} onChange={(event) => props.onDraftNaryad(event.target.value)} />
          </label>
          <label>
            Комментарий
            <input
              value={props.draftComment}
              onChange={(event) => props.onDraftComment(event.target.value)}
              placeholder="Комментарий"
            />
          </label>
          <button type="submit" className="dds-ok" aria-label="Сохранить статус">
            ✓
          </button>
          <button type="button" onClick={props.onCancelEdit} aria-label="Отмена">
            ×
          </button>
        </form>
      ) : null}
    </div>
  );
}
