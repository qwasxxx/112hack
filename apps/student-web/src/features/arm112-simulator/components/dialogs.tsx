type EmptyProps = {
  onFill: () => void;
  onSaveEmpty: () => void;
};

export function EmptyCardDialog(props: EmptyProps) {
  return (
    <div className="arm112-modal-backdrop">
      <div className="arm112-modal" role="dialog" aria-label="Сохранить карточку как пустую ?">
        <h2>Сохранить карточку как пустую ?</h2>
        <div className="arm112-modal-actions">
          <button type="button" className="arm112-ghost" onClick={props.onFill}>
            вернуться и заполнить
          </button>
          <button type="button" className="arm112-orange-outline" onClick={props.onSaveEmpty}>
            сохранить карточку как пустую
          </button>
        </div>
      </div>
    </div>
  );
}

type InjuredProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
};

export function InjuredDialog(props: InjuredProps) {
  return (
    <div className="arm112-modal-backdrop">
      <div className="arm112-modal" role="dialog">
        <h2>количество пострадавших</h2>
        <input className="arm112-underline" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
        <div className="arm112-modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="arm112-orange-fill" onClick={props.onClose}>
            ОК
          </button>
        </div>
      </div>
    </div>
  );
}

type ReminderProps = {
  onClose: () => void;
};

export function ReminderDialog(props: ReminderProps) {
  return (
    <div className="arm112-modal-backdrop">
      <div className="arm112-modal" role="dialog" aria-label="Установить напоминание">
        <h2>Установить напоминание (будильник)</h2>
        <label className="arm112-field">
          <span className="arm112-label">текст</span>
          <input className="arm112-underline" />
        </label>
        <label className="arm112-field" style={{ marginTop: 8 }}>
          <span className="arm112-label">время</span>
          <input className="arm112-underline" type="time" />
        </label>
        <div className="arm112-modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="arm112-orange-fill" onClick={props.onClose}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

type SaveProps = {
  onConfirm: () => void;
  onBack: () => void;
};

export function SaveConfirmDialog(props: SaveProps) {
  return (
    <div className="arm112-modal-backdrop">
      <div className="arm112-modal" role="dialog">
        <h2>Оповестить и сохранить карточку</h2>
        <div className="arm112-modal-actions">
          <button type="button" className="arm112-ghost" onClick={props.onBack}>
            вернуться
          </button>
          <button type="button" className="arm112-orange-outline" onClick={props.onConfirm}>
            Оповестить и сохранить карточку
          </button>
        </div>
      </div>
    </div>
  );
}

type SimpleProps = {
  title: string;
  body: string;
  onClose: () => void;
};

export function SimpleDialog(props: SimpleProps) {
  return (
    <div className="arm112-modal-backdrop">
      <div className="arm112-modal" role="dialog" aria-label={props.title}>
        <h2>{props.title}</h2>
        <p className="arm112-label">{props.body}</p>
        <div className="arm112-modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="arm112-ghost" onClick={props.onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
