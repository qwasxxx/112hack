type Props = {
  number: string;
  kind?: 'call' | 'sms';
  preview?: string;
  onAccept: () => void;
};

export function IncomingCallOverlay(props: Props) {
  const sms = props.kind === 'sms';
  return (
    <div className="arm112-incoming-stage">
      <div className="arm112-incoming" role="dialog" aria-label={sms ? 'Входящее SMS' : 'Входящий звонок'}>
        <div className="arm112-incoming-pulse" aria-hidden="true">
          <span>{sms ? 'SMS' : '☎'}</span>
        </div>
        <h2>{sms ? 'Входящее SMS' : 'Входящий звонок'}</h2>
        <p>с номера {props.number}</p>
        {sms && props.preview ? <p className="arm112-incoming-sms">{props.preview}</p> : null}
        <button type="button" className="arm112-incoming-accept" onClick={props.onAccept}>
          {sms ? 'Открыть карточку' : 'Принять вызов'}
        </button>
      </div>
    </div>
  );
}
