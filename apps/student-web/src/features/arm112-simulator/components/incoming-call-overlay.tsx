type Props = {
  number: string;
  kind?: 'call' | 'sms';
  preview?: string;
  onAccept: () => void;
  onDismiss: () => void;
};

export function IncomingCallOverlay(props: Props) {
  const sms = props.kind === 'sms';
  return (
    <div className="arm112-incoming" role="dialog" aria-label={sms ? 'Входящее SMS' : 'Входящий звонок'}>
      <button type="button" className="arm112-incoming-x" onClick={props.onDismiss} aria-label="Закрыть">
        ×
      </button>
      <h2>{sms ? 'Входящее SMS' : 'Входящий звонок'}</h2>
      <p>с номера {props.number}</p>
      {sms && props.preview ? <p className="arm112-incoming-sms">{props.preview}</p> : null}
      <button type="button" className="arm112-incoming-accept" onClick={props.onAccept}>
        {sms ? 'Открыть карточку' : 'Принять'}
      </button>
    </div>
  );
}
