import { useEffect, useRef, useState } from 'react';
import type { LessonSection, TrainingScenario } from '../data/scenarios';
import { SECTION_AI_ROLE } from '../data/scenarios';
import { buildLessonSystemPrompt } from '../data/ags-tickets';
import { createLlmStream } from '../lib/llm-stream';
import { applySttEvent, emptyTranscript } from '../lib/stt-protocol';
import { createSttStream } from '../lib/stt-stream';
import { beginCallRecording, enqueueTtsAudio, stopTtsAudio, unlockTtsAudio, waitTtsQueue } from '../lib/tts-player';
import type { TranscriptTurn } from '../progress';
import { patchLive, refreshCuesFromApi, subscribeCues, takePendingLlmCues } from '../progress';

type Line = {
  id: string;
  role: 'caller' | 'operator';
  text: string;
  live?: boolean;
  source?: 'stt' | 'llm' | 'typed';
  at: number;
};

type CallState = 'idle' | 'connecting' | 'listening' | 'analyzing' | 'error' | 'ended';

type Props = {
  scenario: TrainingScenario;
  section: LessonSection;
  onLeave: () => void;
  variant?: 'page' | 'panel';
  autoStart?: boolean;
  systemPrompt?: string;
  opening?: string;
  hint?: string;
  panelTitle?: string;
  onCallEnded?: (payload: { lines: TranscriptTurn[]; seconds: number; audio?: Promise<Blob | null> }) => void;
  operatorLogin?: string;
};

function voiceForTeacherCue(type: string, note: string): { emotion: string; pitch: string; speed: number } | undefined {
  const text = note.toLowerCase();
  const tone =
    /шепот|шепч|тихо/.test(text)
      ? 'whisper'
      : /зол|орёт|орет|злост|кричит на/.test(text)
        ? 'angry'
        : /плач|рыда|слёз|слез|растер/.test(text)
          ? 'crying'
          : /паник|задых|ужас|испуг|истер|крич/.test(text)
            ? 'panic'
            : '';
  if (tone === 'whisper') {
    return { emotion: 'whisper', pitch: 'low', speed: 0.92 };
  }
  if (tone === 'angry') {
    return { emotion: 'angry', pitch: 'low', speed: 1.08 };
  }
  if (tone === 'crying') {
    return { emotion: 'crying', pitch: 'high', speed: 0.94 };
  }
  if (tone === 'panic' || type === 'set_emotional_state') {
    return { emotion: 'panic', pitch: 'high', speed: 1.08 };
  }
  if (type === 'add_circumstance' || type === 'inject_event' || type === 'force_state') {
    return { emotion: 'startled', pitch: 'high', speed: 1.06 };
  }
  return undefined;
}

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
  const [muted, setMuted] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<Line[]>([]);
  const streamRef = useRef<ReturnType<typeof createSttStream> | undefined>(undefined);
  const llmRef = useRef<ReturnType<typeof createLlmStream> | undefined>(undefined);
  const startingRef = useRef(false);
  const finalsRef = useRef(emptyTranscript());
  const leavingRef = useRef(false);
  const seenFinalsRef = useRef(new Set<string>());
  const utterancePartsRef = useRef<string[]>([]);
  const liveSttRef = useRef('');
  const flushTimerRef = useRef<number | undefined>(undefined);
  const ttsHoldRef = useRef(false);
  const spokenTtsRef = useRef('');
  const userSpokeRef = useRef(false);
  const awaitingReplyRef = useRef(false);
  const replyShownRef = useRef(false);
  const pendingUserRef = useRef('');
  const lastSentRef = useRef('');
  const staleGensRef = useRef(new Set<number>());
  const endedSentRef = useRef(false);
  const recorderRef = useRef<{ stop: () => Promise<Blob | null> } | undefined>(undefined);
  const mutedRef = useRef(false);
  const voiceRef = useRef(props.scenario.ttsVoice);
  const aiVoiceId = conversationRole;
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
  linesRef.current = lines;

  useEffect(() => {
    const login = props.operatorLogin;
    if (!login) {
      return;
    }
    patchLive(login, {
      transcript: lines
        .filter((line) => line.text.trim())
        .slice(-12)
        .map((line) => ({
          role: line.role === 'operator' ? 'student' : 'caller',
          text: line.text,
          at: typeof line.at === 'number' ? new Date(line.at).toISOString() : new Date().toISOString(),
        })),
    });
  }, [lines, props.operatorLogin]);

  useEffect(() => {
    const login = props.operatorLogin;
    if (!login) {
      return;
    }
    const apply = () => {
      if (!llmRef.current) {
        return;
      }
      const pending = takePendingLlmCues(login);
      for (const cue of pending) {
        const tone = voiceForTeacherCue(cue.type, cue.note || '');
        if (tone) {
          const base = voiceRef.current ?? props.scenario.ttsVoice;
          voiceRef.current = {
            speaker: base?.speaker ?? 'xenia',
            gender: base?.gender ?? 'female',
            emotion: tone.emotion,
            pitch: tone.pitch,
            speed: tone.speed,
          };
        }
        llmRef.current.intervene(cue.type, cue.note);
      }
    };
    apply();
    const timer = window.setInterval(apply, 800);
    const stop = subscribeCues(apply);
    void refreshCuesFromApi(login).then(apply);
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [props.operatorLogin, props.scenario.ttsVoice]);

  useEffect(() => {
    let armed = false;
    const arm = window.setTimeout(() => {
      armed = true;
    }, 80);
    return () => {
      window.clearTimeout(arm);
      if (!armed) {
        return;
      }
      leavingRef.current = true;
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current);
      }
      void streamRef.current?.stop();
      void recorderRef.current?.stop();
      recorderRef.current = undefined;
      void llmRef.current?.stop();
      stopTtsAudio();
      streamRef.current = undefined;
      llmRef.current = undefined;
    };
  }, []);

  async function startCall() {
    if (startingRef.current || recording) {
      return;
    }
    startingRef.current = true;
    leavingRef.current = false;
    setSeconds(0);
    unlockTtsAudio();
    seenFinalsRef.current = new Set();
    finalsRef.current = emptyTranscript();
    utterancePartsRef.current = [];
    liveSttRef.current = '';
    if (flushTimerRef.current !== undefined) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    spokenTtsRef.current = '';
    userSpokeRef.current = false;
    awaitingReplyRef.current = false;
    replyShownRef.current = false;
    pendingUserRef.current = '';
    lastSentRef.current = '';
    staleGensRef.current = new Set();
    ttsHoldRef.current = false;
    endedSentRef.current = false;
    setLines([]);
    setMicError(undefined);
    setRecording(true);
    setCallState('listening');
    const opening =
      props.opening?.trim() ||
      (conversationRole === 'victim' ? props.scenario.callerOpening.trim() : '');
    if (opening) {
      setLines([
        {
          id: 'caller-opening',
          role: 'caller',
          text: opening,
          source: 'llm',
          at: Date.now(),
        },
      ]);
      spokenTtsRef.current = opening;
      holdMicForTts();
      void Promise.race([
        enqueueTtsAudio(opening, aiVoiceId, callerVoice()),
        new Promise((resolve) => window.setTimeout(resolve, 12000)),
      ]).finally(() => {
        if (leavingRef.current || awaitingReplyRef.current) {
          return;
        }
        ttsHoldRef.current = false;
        if (!mutedRef.current) {
          streamRef.current?.setCaptureEnabled(true);
        }
      });
    }
    const callId = crypto.randomUUID();
    const llm = createLlmStream({
      callId,
      conversationRole,
      opening: opening || undefined,
      systemPrompt: props.systemPrompt ?? buildLessonSystemPrompt(props.scenario, props.section),
      lessonId: props.scenario.id,
      onEvent: (event) => {
        if ('gen' in event && typeof event.gen === 'number' && staleGensRef.current.has(event.gen)) {
          return;
        }
        if (event.type === 'generation_cancelled') {
          if (typeof event.gen === 'number') {
            staleGensRef.current.add(event.gen);
          }
          awaitingReplyRef.current = false;
          if (!ttsHoldRef.current) {
            replyShownRef.current = false;
          }
          setLines((current) =>
            current.map((line) =>
              line.role === aiRole && line.live ? { ...line, live: false, id: crypto.randomUUID() } : line,
            ),
          );
          return;
        }
        if (event.type === 'assistant_partial' && event.text.trim()) {
          if (!userSpokeRef.current && isSameSpeech(event.text, opening)) {
            return;
          }
          replyShownRef.current = true;
          if (!ttsHoldRef.current) {
            holdMicForTts();
          }
          setLines((current) => upsertLive(current, aiRole, event.text, 'llm'));
        }
        if (event.type === 'assistant_final') {
          awaitingReplyRef.current = false;
          if (!event.text.trim()) {
            replyShownRef.current = false;
            awaitingReplyRef.current = false;
            ttsHoldRef.current = false;
            if (!mutedRef.current) {
              streamRef.current?.setCaptureEnabled(true);
            }
            if (userSpokeRef.current) {
              setMicError('Модель не вернула ответ. Повторите фразу.');
            }
            return;
          }
          if (!userSpokeRef.current && isSameSpeech(event.text, opening)) {
            ttsHoldRef.current = false;
            if (!mutedRef.current) {
              streamRef.current?.setCaptureEnabled(true);
            }
            return;
          }
          replyShownRef.current = true;
          setLines((current) => commitLive(current, aiRole, event.text, 'llm'));
          void speakAi(event.text);
        }
      },
      onError: (message) => {
        setMicError(message);
        ttsHoldRef.current = false;
        replyShownRef.current = false;
        awaitingReplyRef.current = false;
        if (!mutedRef.current) {
          streamRef.current?.setCaptureEnabled(true);
        }
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
      if (!text.trim() || repeatsSent(text, lastSentRef.current) || isPhantomSpeech(text)) {
        setLines((current) => current.filter((line) => !(line.live && line.role === userRole)));
        return;
      }
      const id = crypto.randomUUID();
      lastSentRef.current = text;
      setLines((current) => replaceOrAppendUser(current, userRole, text, id, 'stt'));
      if (replyShownRef.current) {
        pendingUserRef.current = text;
        return;
      }
      beginUserTurn();
      awaitingReplyRef.current = true;
      llmRef.current?.sendUserFinal(id, text);
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(flushUtterance, 1000);
    };

    const showUserSpeech = (parts: string[], live: string) => {
      const text = composeUtterance(parts, live);
      if (!text.trim() || repeatsSent(text, lastSentRef.current) || isPhantomSpeech(text)) {
        if (isPhantomSpeech(text)) {
          setLines((current) => current.filter((line) => !(line.live && line.role === userRole)));
        }
        return;
      }
      setLines((current) => upsertLive(current, userRole, text, 'stt'));
    };

    const stream = createSttStream({
      onEvent: (event) => {
        if (ttsHoldRef.current || mutedRef.current) {
          return;
        }
        finalsRef.current = applySttEvent(finalsRef.current, event);
        if (event.type === 'partial' && event.text.trim()) {
          if (!isShorterTranscript(liveSttRef.current, event.text)) {
            liveSttRef.current = event.text;
          }
          showUserSpeech(utterancePartsRef.current, liveSttRef.current);
        }
        if (event.type === 'final') {
          const last = finalsRef.current.finals.at(-1);
          if (!last || !last.text.trim() || seenFinalsRef.current.has(last.id)) {
            return;
          }
          seenFinalsRef.current.add(last.id);
          const next = last.text.trim();
          const previous = utterancePartsRef.current.at(-1) ?? '';
          const joined = composeUtterance(utterancePartsRef.current, '');
          if (!previous) {
            utterancePartsRef.current = [next];
          } else if (repeatsSent(next, previous)) {
            if (next.length >= previous.length) {
              utterancePartsRef.current = [...utterancePartsRef.current.slice(0, -1), next];
            }
          } else if (!joined.toLowerCase().includes(next.toLowerCase())) {
            utterancePartsRef.current = [...utterancePartsRef.current, next];
          }
          liveSttRef.current = '';
          showUserSpeech(utterancePartsRef.current, '');
          scheduleFlush();
        }
      },
      onError: () => {
        setMicError('Не расслышал. Повторите фразу.');
      },
    });
    streamRef.current = stream;
    try {
      await llm.start();
      if (conversationRole === 'victim' && !opening) {
        llm.kickoff();
      }
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : '';
      if (leavingRef.current || text === 'stopped') {
        setRecording(false);
        setCallState('idle');
        return;
      }
      setRecording(false);
      setCallState('error');
      setMicError(
        text && /модель|диалог/i.test(text)
          ? text
          : 'Не удалось начать диалог. Можно отвечать текстом, если сервис поднимется.',
      );
    }
    try {
      await stream.start();
      const mic = stream.mediaStream();
      if (mic) {
        try {
          recorderRef.current = beginCallRecording(mic);
        } catch {
          recorderRef.current = undefined;
        }
      }
      if (ttsHoldRef.current) {
        stream.setCaptureEnabled(false);
      } else if (mutedRef.current) {
        stream.setCaptureEnabled(false);
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setMicError('Нет доступа к микрофону. Можно отвечать текстом.');
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setMicError('Микрофон не найден. Можно отвечать текстом.');
      } else {
        setMicError('Распознавание речи недоступно. Можно отвечать текстом.');
      }
    } finally {
      startingRef.current = false;
    }
  }

  function callerVoice() {
    return conversationRole === 'victim' ? voiceRef.current ?? props.scenario.ttsVoice : undefined;
  }

  function holdMicForTts() {
    const pending = composeUtterance(utterancePartsRef.current, liveSttRef.current).trim();
    if (pending && !repeatsSent(pending, lastSentRef.current)) {
      pendingUserRef.current = pending;
    }
    ttsHoldRef.current = true;
    if (flushTimerRef.current !== undefined) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    utterancePartsRef.current = [];
    liveSttRef.current = '';
    streamRef.current?.setCaptureEnabled(false);
  }

  async function speakAi(text: string) {
    holdMicForTts();
    const fresh = text.trim();
    if (fresh) {
      spokenTtsRef.current = fresh;
      void enqueueTtsAudio(fresh, aiVoiceId, callerVoice());
    }
    try {
      await Promise.race([
        waitTtsQueue(),
        new Promise((resolve) => window.setTimeout(resolve, 12000)),
      ]);
    } finally {
      ttsHoldRef.current = false;
      replyShownRef.current = false;
      if (!leavingRef.current && !mutedRef.current) {
        streamRef.current?.setCaptureEnabled(true);
      }
      const sent = lastSentRef.current;
      const queued = pendingUserRef.current.trim();
      pendingUserRef.current = '';
      lastSentRef.current = '';
      if (queued && !leavingRef.current && !repeatsSent(queued, sent)) {
        const id = crypto.randomUUID();
        lastSentRef.current = queued;
        setLines((current) => {
          const lastUser = [...current].reverse().find((line) => line.role === userRole && !line.live);
          if (lastUser && repeatsSent(queued, lastUser.text)) {
            return current;
          }
          return replaceOrAppendUser(current, userRole, queued, id, 'stt');
        });
        userSpokeRef.current = true;
        awaitingReplyRef.current = true;
        llmRef.current?.sendUserFinal(id, queued);
      }
    }
  }

  function beginUserTurn() {
    userSpokeRef.current = true;
    spokenTtsRef.current = '';
    stopTtsAudio();
    ttsHoldRef.current = false;
    if (!mutedRef.current) {
      streamRef.current?.setCaptureEnabled(true);
    }
  }

  function addOperatorLine(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const id = crypto.randomUUID();
    setLines((current) => replaceOrAppendUser(current, userRole, trimmed, id, 'typed'));
    if (replyShownRef.current) {
      pendingUserRef.current = trimmed;
      setDraft('');
      return;
    }
    beginUserTurn();
    awaitingReplyRef.current = true;
    llmRef.current?.sendUserFinal(id, trimmed);
    setDraft('');
  }

  function sendDraft() {
    addOperatorLine(draft);
  }

  function toggleMute() {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      if (next) {
        streamRef.current?.setCaptureEnabled(false);
      } else if (!ttsHoldRef.current) {
        streamRef.current?.setCaptureEnabled(true);
      }
      return next;
    });
  }

  function emitEnded(snapshot: TranscriptTurn[], audio?: Promise<Blob | null>) {
    if (endedSentRef.current) {
      return;
    }
    endedSentRef.current = true;
    props.onCallEnded?.({ lines: snapshot, seconds, audio });
    if (!embedded && !props.onCallEnded) {
      props.onLeave();
    }
  }

  async function hangup() {
    const snapshot: TranscriptTurn[] = linesRef.current
      .filter((line) => !line.live && line.text.trim())
      .map((line) => ({ role: line.role, text: line.text.trim(), at: line.at || Date.now() }));
    if (!streamRef.current && !llmRef.current) {
      const rec = recorderRef.current;
      recorderRef.current = undefined;
      emitEnded(snapshot, rec ? rec.stop().catch(() => null) : undefined);
      return;
    }
    leavingRef.current = true;
    stopTtsAudio();
    if (flushTimerRef.current !== undefined) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    const leftover = composeUtterance(utterancePartsRef.current, liveSttRef.current);
    utterancePartsRef.current = [];
    liveSttRef.current = '';
    if (leftover.trim()) {
      snapshot.push({ role: userRole, text: leftover.trim(), at: Date.now() });
      setLines((current) => commitLive(current, userRole, leftover, 'stt'));
    }
    const rec = recorderRef.current;
    recorderRef.current = undefined;
    const audio = rec ? rec.stop().catch(() => null) : undefined;
    await streamRef.current?.stop();
    streamRef.current = undefined;
    await llmRef.current?.stop();
    llmRef.current = undefined;
    setRecording(false);
    setCallState('ended');
    emitEnded(snapshot, audio);
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
  const micStatus =
    callState === 'connecting'
      ? 'Соединение…'
      : callState === 'error' || micError
        ? 'Можно ответить текстом'
        : muted
          ? 'Микрофон выключен'
          : recording
            ? 'Слушаю'
            : 'Соединение…';

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
            <h1>{props.panelTitle ?? 'Разговор'}</h1>
          </div>
          <div className="call-panel-meta">
            <span className="mono">{clock}</span>
            {callState === 'ended' ? null : (
              <button type="button" className="btn btn-danger" onClick={() => void hangup()}>
                Завершить
              </button>
            )}
          </div>
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
            >
              Завершить
            </button>
          )}
        </div>
      </header>
      )}

      <div className={`call-body${showCard ? '' : ' call-body-solo'}`}>
        <section className={`panel call-log${embedded ? ' call-log-panel' : ''}`} aria-label="Разговор">
          {embedded ? null : <h2>Разговор</h2>}
          <div className="log" ref={logRef}>
            {lines.length === 0 ? (
              <p className="hint">
                {props.hint ??
                  (conversationRole === 'victim'
                    ? 'После соединения заявитель начнёт разговор. Отвечайте голосом или текстом.'
                    : 'Вы заявитель. Задайте оператору вопросы по ситуации — в ответ будут эталонные формулировки.')}
              </p>
            ) : null}
            {lines.map((line) => (
              <article key={line.id} className={`line line-${line.role}${line.live ? ' line-partial' : ''}`}>
                <span>{line.role === 'caller' ? 'Заявитель' : 'Оператор'}</span>
                <p>{line.text}</p>
              </article>
            ))}
          </div>

          {callState === 'ended' ? (
            <p className="hint">Вызов завершён. Открывается разбор.</p>
          ) : embedded ? (
            <div className="composer composer-dock">
              <div className="composer-status">
                <span
                  className={`composer-mic${recording && !muted ? ' is-live' : ''}${muted ? ' is-muted' : ''}`}
                  aria-hidden="true"
                />
                <p>{micStatus}</p>
                {callState === 'error' ? (
                  <button type="button" className="composer-side" onClick={() => void startCall()}>
                    Повторить
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`composer-side${muted ? ' is-on' : ''}`}
                    onClick={toggleMute}
                    disabled={callState !== 'listening'}
                  >
                    {muted ? 'Вкл. микрофон' : 'Выкл. микрофон'}
                  </button>
                )}
              </div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ответить текстом · Enter"
                rows={2}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendDraft();
                  }
                }}
              />
              {micError ? <p className="hint">{micError}</p> : null}
            </div>
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
                  disabled={recording || callState === 'listening'}
                  onClick={() => void startCall()}
                >
                  {micStatus === 'Слушаю' ? 'Говорите…' : callState === 'error' ? 'Повторить' : 'Позвонить'}
                </button>
                <button type="submit" className="btn btn-primary">
                  Отправить
                </button>
              </div>
              {micError ? <p className="hint">{micError}</p> : null}
            </form>
          )}
        </section>

        {showCard ? (
          <div className="call-side">
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
        ) : null}
      </div>
    </div>
  );
}

function isPhantomSpeech(text: string): boolean {
  const clean = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return /^(спасибо|спасибо большое|большое спасибо|благодарю|благодарю вас|пожалуйста)$/.test(clean);
}

function isSameSpeech(left: string, right: string): boolean {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const a = clean(left);
  const b = clean(right);
  return Boolean(a && b && a === b);
}

function repeatsSent(text: string, sent: string): boolean {
  const compact = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const next = compact(text);
  const prev = compact(sent);
  if (!next || !prev) {
    return false;
  }
  if (next === prev) {
    return true;
  }
  const longer = Math.max(next.length, prev.length);
  const shorter = Math.min(next.length, prev.length);
  if (longer - shorter > 8) {
    return false;
  }
  let same = 0;
  for (let index = 0; index < shorter; index += 1) {
    if (next[index] === prev[index]) {
      same += 1;
    }
  }
  return same / longer >= 0.84;
}

function upsertLive(current: Line[], role: Line['role'], text: string, source: Line['source']): Line[] {
  const next = current.filter((line) => !(line.live && line.source === source));
  const prev = current.find((line) => line.live && line.source === source);
  return [...next, { id: `${source}-live`, role, text, live: true, source, at: prev?.at ?? Date.now() }];
}

function replaceOrAppendUser(
  current: Line[],
  userRole: Line['role'],
  text: string,
  id: string,
  source: Line['source'],
): Line[] {
  const kept = current.filter((line) => !(line.live && line.role === userRole));
  const last = kept.at(-1);
  if (last?.role === userRole) {
    return [...kept.slice(0, -1), { id, role: userRole, text, source, at: last.at || Date.now() }];
  }
  return [...kept, { id, role: userRole, text, source, at: Date.now() }];
}

function commitLive(current: Line[], role: Line['role'], text: string, source: Line['source']): Line[] {
  const next = current.filter((line) => !(line.live && line.source === source));
  const live = current.find((line) => line.live && line.source === source);
  return [...next, { id: crypto.randomUUID(), role, text, source, at: live?.at ?? Date.now() }];
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
