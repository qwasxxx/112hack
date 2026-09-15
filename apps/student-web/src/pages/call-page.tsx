import { useEffect, useRef, useState } from 'react';
import type { TrainingScenario } from '../data/scenarios';
import { captureAudio } from '../lib/capture-audio';

type Line = {
  id: string;
  role: 'caller' | 'operator';
  text: string;
};

type Props = {
  scenario: TrainingScenario;
  onLeave: () => void;
};

export function CallPage(props: Props) {
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([
    { id: 'open', role: 'caller', text: props.scenario.callerOpening },
  ]);
  const [card, setCard] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | undefined>();
  const recorderAbort = useRef<AbortController | undefined>(undefined);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  function addOperatorLine(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setLines((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'operator', text: trimmed },
    ]);
    setDraft('');
  }

  function sendDraft() {
    addOperatorLine(draft);
  }

  async function transcribeOperatorAudio(_audio: Blob): Promise<string | undefined> {
    return undefined;
  }

  async function startTalking() {
    setMicError(undefined);
    const abort = new AbortController();
    recorderAbort.current = abort;
    setRecording(true);
    try {
      const blob = await captureAudio(abort.signal);
      const text = await transcribeOperatorAudio(blob);
      if (text) {
        addOperatorLine(text);
      }
    } catch {
      setMicError('Микрофон недоступен. Реплику можно ввести текстом.');
    } finally {
      setRecording(false);
      recorderAbort.current = undefined;
    }
  }

  function stopTalking() {
    recorderAbort.current?.abort();
  }

  function setField(key: string, value: string) {
    setCard((current) => ({ ...current, [key]: value }));
  }

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="call">
      <header className="call-bar">
        <div>
          <p className="call-live">Учебный вызов</p>
          <h1>{props.scenario.title}</h1>
        </div>
        <div className="call-meta">
          <span className="mono">{clock}</span>
          <button type="button" className="btn btn-danger" onClick={props.onLeave}>
            Завершить
          </button>
        </div>
      </header>

      <div className="call-body">
        <section className="panel call-log" aria-label="Разговор">
          <h2>Разговор</h2>
          <div className="log" ref={logRef}>
            {lines.map((line) => (
              <article key={line.id} className={`line line-${line.role}`}>
                <span>{line.role === 'caller' ? 'Заявитель' : 'Оператор'}</span>
                <p>{line.text}</p>
              </article>
            ))}
          </div>

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
                className={recording ? 'btn btn-danger' : 'btn'}
                onMouseDown={() => void startTalking()}
                onMouseUp={stopTalking}
                onMouseLeave={stopTalking}
                onTouchStart={(event) => {
                  event.preventDefault();
                  void startTalking();
                }}
                onTouchEnd={stopTalking}
              >
                {recording ? 'Говорите…' : 'Удерживайте, чтобы говорить'}
              </button>
              <button type="submit" className="btn btn-primary">
                Отправить
              </button>
            </div>
            {micError ? <p className="hint">{micError}</p> : null}
          </form>
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
