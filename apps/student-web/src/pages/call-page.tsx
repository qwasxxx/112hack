import { useEffect, useRef, useState } from 'react';
import type { LessonSection, TrainingScenario } from '../data/scenarios';
import { SECTION_AI_ROLE } from '../data/scenarios';
import { createLlmStream } from '../lib/llm-stream';
import { applySttEvent, emptyTranscript } from '../lib/stt-protocol';
import { createSttStream } from '../lib/stt-stream';

type Line = {
  id: string;
  role: 'caller' | 'operator';
  text: string;
  live?: boolean;
  source?: 'stt' | 'llm' | 'typed';
};

type CallState = 'idle' | 'connecting' | 'listening' | 'analyzing' | 'error' | 'ended';

type Props = {
  scenario: TrainingScenario;
  section: LessonSection;
  onLeave: () => void;
  variant?: 'page' | 'panel';
  autoStart?: boolean;
};

export function CallPage(props: Props) {
  const embedded = props.variant === 'panel';
  const conversationRole = SECTION_AI_ROLE[props.section];
  const userRole: Line['role'] = conversationRole === 'victim' ? 'operator' : 'caller';
  const aiRole: Line['role'] = conversationRole === 'victim' ? 'caller' : 'operator';
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [card, setCard] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [micError, setMicError] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<ReturnType<typeof createSttStream> | undefined>(undefined);
  const llmRef = useRef<ReturnType<typeof createLlmStream> | undefined>(undefined);
  const startingRef = useRef(false);
  const finalsRef = useRef(emptyTranscript());
  const leavingRef = useRef(false);
  const seenFinalsRef = useRef(new Set<string>());
  const utterancePartsRef = useRef<string[]>([]);
  const liveSttRef = useRef('');
  const flushTimerRef = useRef<number | undefined>(undefined);
  const analysisDoneRef = useRef<(() => void) | undefined>(undefined);
  const wantsAnalysis = !embedded && (props.section === 'training' || props.section === 'exam');
  const showCard = !embedded && props.section !== 'theory';
  const sectionLabel = props.section === 'theory' ? 'Теория' : props.section === 'exam' ? 'Экзамен' : 'Тренировка';
  const youAre = conversationRole === 'victim' ? 'Вы — оператор' : 'Вы — заявитель';

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
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current);
      }
      void streamRef.current?.stop();
      void llmRef.current?.stop();
      streamRef.current = undefined;
      llmRef.current = undefined;
    };
  }, []);

  async function startCall() {
    if (startingRef.current || recording || callState === 'connecting') {
      return;
    }
    startingRef.current = true;
    leavingRef.current = false;
    seenFinalsRef.current = new Set();
    finalsRef.current = emptyTranscript();
    utterancePartsRef.current = [];
    liveSttRef.current = '';
    if (flushTimerRef.current !== undefined) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    setLines([]);
    setAnalysis('');
    setMicError(undefined);
    setCallState('connecting');
    const callId = crypto.randomUUID();
    const llm = createLlmStream({
      callId,
      conversationRole,
      lessonId: props.scenario.id,
      onEvent: (event) => {
        if (event.type === 'assistant_partial' && event.text.trim()) {
          setLines((current) => upsertLive(current, aiRole, event.text, 'llm'));
        }
        if (event.type === 'assistant_final' && event.text.trim()) {
          setLines((current) => commitLive(current, aiRole, event.text, 'llm'));
        }
        if (event.type === 'analysis_partial' && event.text.trim()) {
          setAnalysis(event.text);
        }
        if (event.type === 'analysis_final' && event.text.trim()) {
          setAnalysis(event.text);
          analysisDoneRef.current?.();
        }
      },
      onError: (message) => {
        setMicError(message);
        analysisDoneRef.current?.();
      },
    });
    llmRef.current = llm;

    const flushUtterance = () => {
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = undefined;
      }
      const text = composeUtterance(utterancePartsRef.current, liveSttRef.current);
      utterancePartsRef.current = [];
      liveSttRef.current = '';
      if (!text.trim()) {
        return;
      }
      const id = crypto.randomUUID();
      setLines((current) => commitLive(current, userRole, text, 'stt'));
      llmRef.current?.sendUserFinal(id, text);
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(flushUtterance, 500);
    };

    const showUserSpeech = (parts: string[], live: string) => {
      const text = composeUtterance(parts, live);
      if (!text.trim()) {
        return;
      }
      setLines((current) => upsertLive(current, userRole, text, 'stt'));
    };

    const stream = createSttStream({
      onEvent: (event) => {
        finalsRef.current = applySttEvent(finalsRef.current, event);
        if (event.type === 'partial' && event.text.trim()) {
          if (!isShorterTranscript(liveSttRef.current, event.text)) {
            liveSttRef.current = event.text;
          }
          showUserSpeech(utterancePartsRef.current, liveSttRef.current);
          if (flushTimerRef.current !== undefined) {
            scheduleFlush();
          }
        }
        if (event.type === 'final') {
          const last = finalsRef.current.finals.at(-1);
          if (!last || !last.text.trim() || seenFinalsRef.current.has(last.id)) {
            return;
          }
          seenFinalsRef.current.add(last.id);
          const next = last.text.trim();
          const joined = composeUtterance(utterancePartsRef.current, '');
          if (!joined || !joined.toLowerCase().includes(next.toLowerCase())) {
            utterancePartsRef.current = [...utterancePartsRef.current, next];
          }
          liveSttRef.current = '';
          showUserSpeech(utterancePartsRef.current, '');
          scheduleFlush();
        }
      },
      onError: (message) => {
        setMicError(message);
        setCallState('error');
        setRecording(false);
      },
    });
    streamRef.current = stream;
    try {
      await llm.start();
      if (conversationRole === 'victim') {
        llm.kickoff();
      }
      if (leavingRef.current) {
        await stream.stop();
        await llm.stop();
        return;
      }
      await stream.start();
      if (leavingRef.current) {
        await stream.stop();
        await llm.stop();
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
      setMicError(
        text && /микрофон|распознаван|браузер|модель|диалог/i.test(text)
          ? text
          : 'Не удалось начать распознавание. Проверьте, что сервисы STT и LLM запущены.',
      );
    } finally {
      startingRef.current = false;
    }
  }

  function addOperatorLine(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const id = crypto.randomUUID();
    setLines((current) => [
      ...current.filter((line) => !line.live),
      { id, role: userRole, text: trimmed, source: 'typed' },
    ]);
    llmRef.current?.sendUserFinal(id, trimmed);
    setDraft('');
  }

  function sendDraft() {
    addOperatorLine(draft);
  }

  async function hangup() {
    if (!streamRef.current && !llmRef.current) {
      if (!embedded) {
        props.onLeave();
      }
      return;
    }
    leavingRef.current = true;
    if (flushTimerRef.current !== undefined) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    const leftover = composeUtterance(utterancePartsRef.current, liveSttRef.current);
    utterancePartsRef.current = [];
    liveSttRef.current = '';
    if (leftover.trim()) {
      setLines((current) => commitLive(current, userRole, leftover, 'stt'));
    }
    const complete = await streamRef.current?.stop();
    streamRef.current = undefined;
    if (complete) {
      finalsRef.current = { ...finalsRef.current, completeText: complete, partial: '' };
    }
    setRecording(false);
    setLines((current) => current.filter((line) => !line.live));
    if (wantsAnalysis && llmRef.current) {
      setCallState('analyzing');
      await waitForAnalysis(leftover);
    } else if (leftover.trim()) {
      llmRef.current?.sendUserFinal(crypto.randomUUID(), leftover);
    }
    await llmRef.current?.stop();
    llmRef.current = undefined;
    setCallState('ended');
  }

  async function waitForAnalysis(leftover: string) {
    const llm = llmRef.current;
    if (!llm) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 50000);
      analysisDoneRef.current = () => {
        window.clearTimeout(timer);
        resolve();
      };
      llm.analyze(leftover);
    });
    analysisDoneRef.current = undefined;
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
        : callState === 'analyzing'
          ? 'Разбор разговора…'
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

  useEffect(() => {
    if (!props.autoStart) {
      return;
    }
    void startCall();
    // Mount-only: start the existing conversation after Принять.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startCall is recreated each render
  }, [props.autoStart]);

  return (
    <div className={embedded ? 'call call-panel' : 'call'} data-conversation={embedded ? 'training' : undefined}>
      {embedded ? (
        <header className="call-bar call-bar-panel">
          <div>
            <p className={`call-live${callState === 'listening' ? ' call-live-on' : ''}`}>{liveLabel}</p>
            <h1>Разговор</h1>
          </div>
          {callState === 'ended' ? null : (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void hangup()}
              disabled={callState === 'connecting' || callState === 'analyzing'}
            >
              Завершить
            </button>
          )}
        </header>
      ) : (
      <header className="call-bar">
        <div>
          <p className={`call-live${callState === 'listening' ? ' call-live-on' : ''}`}>{liveLabel}</p>
          <h1>{props.scenario.title}</h1>
          <p className="hint">
            {sectionLabel} · {youAre}
          </p>
        </div>
        <div className="call-meta">
          <span className="mono">{clock}</span>
          {callState === 'ended' ? (
            <button type="button" className="btn" onClick={props.onLeave}>
              К уроку
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void hangup()}
              disabled={callState === 'connecting' || callState === 'analyzing'}
            >
              Завершить
            </button>
          )}
        </div>
      </header>
      )}

      <div className={`call-body${showCard || wantsAnalysis ? '' : ' call-body-solo'}`}>
        <section className="panel call-log" aria-label="Разговор">
          <h2>Разговор</h2>
          <div className="log" ref={logRef}>
            {lines.length === 0 ? (
              <p className="hint">
                {conversationRole === 'victim'
                  ? 'После соединения заявитель начнёт разговор. Отвечайте как оператор 112.'
                  : 'Вы заявитель. Задайте оператору вопросы по ситуации — в ответ будут эталонные формулировки.'}
              </p>
            ) : null}
            {lines.map((line) => (
              <article key={line.id} className={`line line-${line.role}${line.live ? ' line-partial' : ''}`}>
                <span>{line.role === 'caller' ? 'Заявитель' : 'Оператор'}</span>
                <p>{line.text}</p>
              </article>
            ))}
          </div>

          {callState === 'ended' || callState === 'analyzing' ? (
            <p className="hint">
              {callState === 'analyzing' ? 'Идёт разбор разговора…' : 'Расшифровка сохранена в этом вызове.'}
            </p>
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
                placeholder={userRole === 'caller' ? 'Реплика заявителя' : 'Реплика оператора'}
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

        {showCard || wantsAnalysis ? (
          <div className="call-side">
            {showCard ? (
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
            ) : null}
            {wantsAnalysis && (callState === 'analyzing' || analysis) ? (
              <section className="panel" aria-label="Разбор разговора">
                <h2>Разбор разговора</h2>
                <p className="analysis">{analysis || 'Готовим разбор…'}</p>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function upsertLive(current: Line[], role: Line['role'], text: string, source: Line['source']): Line[] {
  const next = current.filter((line) => !(line.live && line.source === source));
  return [...next, { id: `${source}-live`, role, text, live: true, source }];
}

function commitLive(current: Line[], role: Line['role'], text: string, source: Line['source']): Line[] {
  const next = current.filter((line) => !(line.live && line.source === source));
  return [...next, { id: crypto.randomUUID(), role, text, source }];
}

function isShorterTranscript(previous: string, next: string): boolean {
  const prev = previous.trim().replace(/\s+/g, ' ');
  const value = next.trim().replace(/\s+/g, ' ');
  if (!prev || !value || prev === value) {
    return false;
  }
  const a = prev.toLowerCase();
  const b = value.toLowerCase();
  return a.startsWith(b) || (a.includes(b) && b.length + 4 <= a.length);
}

function composeUtterance(parts: string[], live: string): string {
  const base = parts.map((item) => item.trim()).filter(Boolean).join(' ');
  const extra = live.trim();
  if (!extra) {
    return base;
  }
  if (!base) {
    return extra;
  }
  const b = base.toLowerCase();
  const e = extra.toLowerCase();
  if (e.startsWith(b)) {
    return extra;
  }
  if (b.includes(e) || isShorterTranscript(base, extra)) {
    return base;
  }
  return `${base} ${extra}`;
}
