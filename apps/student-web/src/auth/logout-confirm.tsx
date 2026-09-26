import { useEffect } from 'react';

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LogoutConfirmDialog(props: Props) {
  useEffect(() => {
    if (!props.open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onCancel();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.open, props.onCancel]);

  if (!props.open) {
    return null;
  }

  return (
    <div className="logout-confirm-layer" role="presentation" onClick={props.onCancel}>
      <div
        className="logout-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="logout-confirm-kicker">Подтверждение</p>
        <h2 id="logout-confirm-title">Выйти из аккаунта?</h2>
        <p>Вы уверены, что хотите выйти? Потребуется повторный вход.</p>
        <div className="logout-confirm-actions">
          <button type="button" className="logout-confirm-cancel" onClick={props.onCancel}>
            Отмена
          </button>
          <button type="button" className="logout-confirm-ok" onClick={props.onConfirm}>
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}

