type Props = {
  number: string;
  onAccept: () => void;
  onDismiss: () => void;
};

export function IncomingCallOverlay(props: Props) {
  return (
    <div className="arm112-incoming" role="dialog" aria-label="Входящий звонок">
      <button type="button" className="arm112-incoming-x" onClick={props.onDismiss} aria-label="Закрыть">
        ×
      </button>
      <h2>Входящий звонок</h2>
      <p>с номера {props.number}</p>
      <button type="button" className="arm112-incoming-accept" onClick={props.onAccept}>
        Принять
      </button>
    </div>
  );
}
