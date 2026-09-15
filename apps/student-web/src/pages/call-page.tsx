import { useEffect, useRef, useState } from 'react';
import type { TrainingScenario } from '../data/scenarios';
import { applySttEvent, emptyTranscript } from '../lib/stt-protocol';
import { createSttStream } from '../lib/stt-stream';

type Line = {
  id: string;
  role: 'caller' | 'operator';
  text: string;
  live?: boolean;
  source?: 'script' | 'stt' | 'typed';
};

type CallState = 'idle' | 'connecting' | 'listening' | 'error' | 'ended';

type Props = {
  scenario: TrainingScenario;
  onLeave: () => void;
};

export function CallPage(props: Props) {
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([
    { id: 'open', role: 'caller', text: props.scenario.callerOpening, source: 'script' },
  ]);
  const [card, setCard] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [micError, setMicError] = useState<string | undefined>();
  const logRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<ReturnType<typeof createSttStream> | undefined>(undefined);
  const startingRef = useRef(false);
  const finalsRef = useRef(emptyTranscript());
  const leavingRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((value) => (recording || callState === 'connecting' ? value + 1 : value));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording, callState]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    return () => {
      leavingRef.current = true;
      void streamRef.current?.stop();
      streamRef.current = undefined;
    };
  }, []);

  async function startCall() {
    if (startingRef.current || recording || callState === 'connecting') {
      return;
    }
    startingRef.current = true;
    leavingRef.current = false;
    setMicError(undefined);
    setCallState('connecting');
    const stream = createSttStream({
      onEvent: (event) => {
        finalsRef.current = applySttEvent(finalsRef.current, event);
        setLines((current) => syncOperatorLines(current, finalsRef.current.finals, finalsRef.current.partial));
      },
      onError: (message) => {
        setMicError(message);
        setCallState('error');
        setRecording(false);
      },
    });
    streamRef.current = stream;
    try {
      await stream.start();
      if (leavingRef.current) {
        await stream.stop();
        return;
      }
      setRecording(true);
      setCallState('listening');
    } catch (error: unknown) {
      streamRef.current = undefined;
      if (leavingRef.current) {
        return;
      }
      setCallState('error');
      setRecording(false);
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setMicError('Нет доступа к микрофону. Разрешите запись в браузере.');
        return;
      }
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        setMicError('Микрофон не найден.');
        return;
      }
      const text = error instanceof Error ? error.message : '';
      setMicError(text && /микрофон|распознаван|браузер|модель/i.test(text) ? text : 'Не удалось начать распознавание. Проверьте, что сервис STT запущен.');
    } finally {
      startingRef.current = false;
    }
  }

  function addOperatorLine(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setLines((current) => [
      ...current.filter((line) => !line.live),
      { id: crypto.randomUUID(), role: 'operator', text: trimmed, source: 'typed' },
    ]);
    setDraft('');
  }

  function sendDraft() {
    addOperatorLine(draft);
  }

  async function hangup() {
    if (!streamRef.current) {
      props.onLeave();
      return;
    }
    leavingRef.current = true;
    const complete = await streamRef.current?.stop();
    streamRef.current = undefined;
    if (complete) {
      finalsRef.current = { ...finalsRef.current, completeText: complete, partial: '' };
      setLines((current) => syncOperatorLines(current, finalsRef.current.finals, ''));
    }
    setRecording(false);
    setCallState('ended');
  }

  function setField(key: string, value: string) {
    setCard((current) => ({ ...current, [key]: value }));
  }

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const liveLabel =
    callState === 'connecting'
      ? 'Подключение…'
      : callState === 'listening'
        ? 'Идёт звонок'
        : callState === 'ended'
          ? 'Вызов завершён'
          : callState === 'error'
            ? 'Ошибка звонка'
            : 'Учебный вызов';
  const micLabel =
    callState === 'connecting'
      ? 'Подключение…'
      : recording
        ? 'Говорите…'
        : callState === 'error'
          ? 'Повторить'
          : 'Позвонить';

  return (
    <div className="call">
      <header className="call-bar">
        <div>
          <p className={`call-live${callState === 'listening' ? ' call-live-on' : ''}`}>{liveLabel}</p>
          <h1>{props.scenario.title}</h1>
        </div>
        <div className="call-meta">
          <span className="mono">{clock}</span>
          {callState === 'ended' ? (
            <button type="button" className="btn" onClick={props.onLeave}>
              К сценариям
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => void hangup()} disabled={callState === 'connecting'}>
              Завершить
            </button>
          )}
        </div>
      </header>

      <div className="call-body">
        <section className="panel call-log" aria-label="Разговор">
          <h2>Разговор</h2>
          <div className="log" ref={logRef}>
            {lines.map((line) => (
              <article key={line.id} className={`line line-${line.role}${line.live ? ' line-partial' : ''}`}>
                <span>{line.role === 'caller' ? 'Заявитель' : 'Оператор'}</span>
                <p>{line.text}</p>
              </article>
            ))}
          </div>

          {callState === 'ended' ? (
            <p className="hint">Расшифровка сохранена в этом вызове.</p>
          ) : (
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                sendDraft();
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Реплика оператора"
                rows={2}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendDraft();
                  }
                }}
              />
              <div className="composer-actions">
                <button
                  type="button"
                  className={recording ? 'btn btn-danger' : 'btn btn-primary'}
                  disabled={callState === 'connecting' || recording}
                  onClick={() => void startCall()}
                >
                  {micLabel}
                </button>
                <button type="submit" className="btn btn-primary">
                  Отправить
                </button>
              </div>
              {micError ? <p className="hint">{micError}</p> : null}
            </form>
          )}
        </section>

        <section className="panel" aria-label="Карточка происшествия">
          <h2>Карточка происшествия</h2>
          <form className="card-form" onSubmit={(event) => event.preventDefault()}>
            {props.scenario.cardFields.map((field) => (
              <label key={field.key} className="field">
                <span>
                  {field.label}
                  {field.required ? ' *' : ''}
                </span>
                {field.type === 'text' ? (
                  <textarea
                    rows={3}
                    value={card[field.key] ?? ''}
                    onChange={(event) => setField(field.key, event.target.value)}
                  />
                ) : field.type === 'enum' ? (
                  <select
                    value={card[field.key] ?? ''}
                    onChange={(event) => setField(field.key, event.target.value)}
                  >
                    <option value="">Выберите</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'phone' ? 'tel' : 'text'}
                    value={card[field.key] ?? ''}
                    onChange={(event) => setField(field.key, event.target.value)}
                  />
                )}
              </label>
            ))}
          </form>
        </section>
      </div>
    </div>
  );
}

function syncOperatorLines(
  current: Line[],
  finals: Array<{ id: string; text: string }>,
  partial: string,
): Line[] {
  const rest = current.filter((line) => line.source !== 'stt');
  const caller = rest.filter((line) => line.role === 'caller');
  const typed = rest.filter((line) => line.source === 'typed');
  const operator: Line[] = finals.map((item) => ({
    id: item.id,
    role: 'operator',
    text: item.text,
    source: 'stt',
  }));
  if (partial) {
    operator.push({ id: 'partial', role: 'operator', text: partial, live: true, source: 'stt' });
  }
  return [...caller, ...operator, ...typed];
}
