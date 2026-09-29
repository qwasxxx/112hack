import { useEffect, useRef, useState } from 'react';
import type { LessonSection, TrainingScenario } from '../data/scenarios';
import { SECTION_AI_ROLE } from '../data/scenarios';
import { buildLessonSystemPrompt } from '../data/ags-tickets';
import { createLlmStream } from '../lib/llm-stream';
import {
  createAiSpeechSession,
  USER_FLUSH_COALESCE_MS,
  type TtsPlaybackHooks,
} from '../lib/speech-pipeline';
import { applySttEvent, emptyTranscript } from '../lib/stt-protocol';
import { createSttStream } from '../lib/stt-stream';
import { classifyIncident } from '../data/caller-truth';
import { holdRequested, operatorMayEndCall, presenceDecision, soundsLikeFarewell } from '../lib/call-presence';
import { ambienceProfileForIncident } from '../lib/ambience-profile';
import { startCallAmbience, stopCallAmbience } from '../lib/ambience-player';
import {
  beginCallRecording,
  connectToCallRecording,
  disconnectFromCallRecording,
  enqueueTtsAudio,
  getSharedAudioContext,
  isTtsBusy,
  setTtsVoiceActivityListener,
  stopTtsAudio,
  unlockTtsAudio,
  waitTtsQueue,
  type TtsChunkHooks,
} from '../lib/tts-player';
import {
  commitSpokenCaption,
  createSpokenTranscript,
  upsertSpokenCaption,
} from '../lib/spoken-transcript';
import type { TranscriptTurn } from '../progress';
import { patchLive, readLiveSessions, refreshCuesFromApi, subscribeCues, takePendingLlmCues } from '../progress';

type Line = {
  id: string;
  role: 'caller' | 'operator';
  text: string;
  live?: boolean;
  speaking?: boolean;
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
  aiRole?: 'service' | 'chief' | 'crew' | 'enroute' | 'desk';
  counterparty?: string;
  transcriptScope?: string;
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
  const conversationRole = props.aiRole ?? SECTION_AI_ROLE[props.section];
  const userRole: Line['role'] = conversationRole === 'operator' ? 'caller' : 'operator';
  const aiRole: Line['role'] = conversationRole === 'operator' ? 'operator' : 'caller';
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [card, setCard] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [micError, setMicError] = useState<string | undefined>();
  const [muted, setMuted] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const linesRef = useRef<Line[]>([]);
  const aiRoleRef = useRef<Line['role']>('caller');
  const spokenRef = useRef<ReturnType<typeof createSpokenTranscript> | undefined>(undefined);
  const captionListenerRef = useRef<(state: { visibleText: string; speaking: boolean; generation: number }) => void>(
    () => undefined,
  );
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
  const speechRef = useRef<ReturnType<typeof createAiSpeechSession> | undefined>(undefined);
  const micReleaseRef = useRef<Promise<void> | undefined>(undefined);
  const micReleaseTurnRef = useRef(-1);
  const aiTurnRef = useRef(0);
  const flushOriginRef = useRef<number | undefined>(undefined);
  const userSpokeRef = useRef(false);
  const awaitingReplyRef = useRef(false);
  const replyShownRef = useRef(false);
  const pendingUserRef = useRef('');
  const lastSentRef = useRef('');
  const staleGensRef = useRef(new Set<number>());
  const endedSentRef = useRef(false);
  const callEpochRef = useRef(0);
  const recorderRef = useRef<{ stop: () => Promise<Blob | null> } | undefined>(undefined);
  const mutedRef = useRef(false);
  const draftRef = useRef('');
  const lastHumanAtRef = useRef(0);
  const probesRef = useRef(0);
  const probeAudioEndedAtRef = useRef<number | null>(null);
  const holdRef = useRef(false);
  const closeArmedRef = useRef(false);
  const askedStayRef = useRef(false);
  const probeTurnRef = useRef(false);
  const farewellTurnRef = useRef(false);
  const hangupRef = useRef<() => Promise<void>>(async () => undefined);
  draftRef.current = draft;
  const voiceRef = useRef(props.scenario.ttsVoice);
  const teacherToneRef = useRef<{ emotion: string; pitch: string; speed: number } | undefined>(undefined);
  const aiVoiceId = conversationRole;
  const showCard = !embedded && props.section !== 'theory';
  const sectionLabel = props.section === 'theory' ? 'Теория' : props.section === 'exam' ? 'Экзамен' : 'Тренировка';
  const deskSide =
    conversationRole === 'service' ||
    conversationRole === 'chief' ||
    conversationRole === 'crew' ||
    conversationRole === 'enroute' ||
    conversationRole === 'desk';
  const youAre = deskSide ? 'Вы — диспетчер ДДС' : conversationRole === 'victim' ? 'Вы — оператор' : 'Вы — заявитель';
  const otherSpeaker =
    props.counterparty ||
    (conversationRole === 'chief'
      ? 'Начальник'
      : conversationRole === 'crew' || conversationRole === 'enroute'
        ? 'Бригада'
        : conversationRole === 'desk'
          ? 'Оператор 112'
          : conversationRole === 'service'
            ? 'Служба'
            : 'Заявитель');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((value) => (recording || callState === 'connecting' ? value + 1 : value));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording, callState]);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      const el = logRef.current;
      if (!el || !stickToBottomRef.current) {
        return;
      }
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [lines]);
  linesRef.current = lines;
  aiRoleRef.current = aiRole;
  captionListenerRef.current = (state) => {
    if (spokenRef.current && state.generation !== spokenRef.current.generation()) {
      return;
    }
    setLines((current) => {
      if (!state.visibleText.trim() && current.some((line) => line.role === aiRoleRef.current && line.text.trim())) {
        return current;
      }
      return upsertSpokenCaption(current, aiRoleRef.current, state.visibleText, state.speaking);
    });
  };

  useEffect(() => {
    const login = props.operatorLogin;
    if (!login) {
      return;
    }
    const scope = props.transcriptScope || 'call';
    const spoken = lines
      .filter((line) => line.text.trim())
      .slice(-12)
      .map((line) => ({
        role: (line.role === 'operator' ? 'student' : 'caller') as 'student' | 'caller',
        speaker:
          deskSide
            ? line.role === 'operator'
              ? 'Диспетчер'
              : otherSpeaker
            : line.role === 'operator'
              ? 'Оператор'
              : 'Заявитель',
        text: line.text,
        at: new Date(line.at).toISOString(),
        scope,
      }));
    const prior = (readLiveSessions().find((item) => item.login === login)?.transcript ?? []).filter(
      (line) => line.scope !== scope,
    );
    patchLive(login, { transcript: [...prior, ...spoken].slice(-48) });
  }, [conversationRole, lines, otherSpeaker, props.operatorLogin, props.transcriptScope]);

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
          teacherToneRef.current = tone;
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
      callEpochRef.current += 1;
      startingRef.current = false;
      leavingRef.current = true;
      speechRef.current?.cancel();
      spokenRef.current?.cancel();
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current);
      }
      void streamRef.current?.stop();
      void recorderRef.current?.stop();
      recorderRef.current = undefined;
      void llmRef.current?.stop();
      stopTtsAudio();
      stopCallAmbience();
      streamRef.current = undefined;
      llmRef.current = undefined;
    };
  }, []);

  function ensureSpoken() {
    if (!spokenRef.current) {
      spokenRef.current = createSpokenTranscript({
        now: () => performance.now(),
        raf: (callback) => window.requestAnimationFrame(callback),
        caf: (handle) => window.cancelAnimationFrame(handle),
        onChange: (state) => captionListenerRef.current(state),
      });
    }
    return spokenRef.current;
  }

  function attachCaptionHooks(base?: TtsPlaybackHooks): TtsChunkHooks {
    const spoken = ensureSpoken();
    const generation = spoken.generation();
    const epoch = callEpochRef.current;
    return {
      ...base,
      onChunkPlaybackStart: (info) => {
        if (callEpochRef.current !== epoch) {
          return;
        }
        spoken.startChunk(info.text, info.durationMs, generation);
      },
      onChunkPlaybackProgress: (info) => {
        if (callEpochRef.current !== epoch || spoken.generation() !== generation) {
          return;
        }
        spoken.setChunkDuration(info.durationMs, info.complete);
      },
      onChunkPlaybackEnd: () => {
        if (callEpochRef.current !== epoch) {
          return;
        }
        spoken.finishChunk(generation);
      },
      onPlaybackCancelled: () => {
        if (callEpochRef.current !== epoch || spoken.generation() !== generation) {
          return;
        }
        spoken.cancel();
      },
    };
  }

  function commitSpokenLine() {
    setLines((current) => commitSpokenCaption(current));
  }

  function createSpeech() {
    const session = createAiSpeechSession({
      enqueue: (text, hooks) =>
        enqueueTtsAudio(
          text,
          deskSide ? 'service' : aiVoiceId,
          callerVoice(),
          attachCaptionHooks(hooks),
        ),
      waitQueue: waitTtsQueue,
      stop: stopTtsAudio,
      isBusy: isTtsBusy,
      now: () => performance.now(),
      onLatency: (line) => {
        console.info(line);
      },
    });
    speechRef.current = session;
    return session;
  }

  async function releaseMicAfterAi(turnId: number) {
    try {
      await speechRef.current?.waitForTurnEnd();
    } finally {
      if (leavingRef.current || aiTurnRef.current !== turnId) {
        return;
      }
      if (probeTurnRef.current && !farewellTurnRef.current) {
        probeAudioEndedAtRef.current = performance.now();
        probeTurnRef.current = false;
      } else {
        lastHumanAtRef.current = performance.now();
      }
      if (closeArmedRef.current) {
        const heard = speechRef.current?.getSpoken() || '';
        if (farewellTurnRef.current || soundsLikeFarewell(heard)) {
          farewellTurnRef.current = false;
          probeTurnRef.current = false;
          void hangupRef.current();
          return;
        }
        farewellTurnRef.current = true;
        probeTurnRef.current = true;
        const next = speechRef.current ?? createSpeech();
        aiTurnRef.current += 1;
        next.beginTurn();
        ensureSpoken().beginTurn();
        llmRef.current?.sendPresence(crypto.randomUUID(), 'farewell');
        ensureAiTurnWaiter();
        return;
      }
      ttsHoldRef.current = false;
      replyShownRef.current = false;
      commitSpokenLine();
      if (!mutedRef.current) {
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
        sendToLlm(id, queued);
      }
    }
  }

  function ensureAiTurnWaiter() {
    if (!ttsHoldRef.current) {
      holdMicForTts();
    }
    const turnId = aiTurnRef.current;
    if (micReleaseRef.current && micReleaseTurnRef.current === turnId) {
      return;
    }
    const pending = releaseMicAfterAi(turnId);
    micReleaseRef.current = pending;
    micReleaseTurnRef.current = turnId;
    void pending.finally(() => {
      if (micReleaseRef.current === pending) {
        micReleaseRef.current = undefined;
      }
    });
  }

  function noteOperatorText(text: string) {
    closeArmedRef.current = operatorMayEndCall(text);
    holdRef.current = holdRequested(text);
    if (!closeArmedRef.current) {
      farewellTurnRef.current = false;
    }
    lastHumanAtRef.current = performance.now();
    probesRef.current = 0;
    probeAudioEndedAtRef.current = null;
    askedStayRef.current = false;
    probeTurnRef.current = false;
    llmRef.current?.cancelPresence();
  }

  function sendToLlm(id: string, text: string) {
    noteOperatorText(text);
    aiTurnRef.current += 1;
    const session = speechRef.current ?? createSpeech();
    session.beginTurn({ userFinalAt: flushOriginRef.current ?? performance.now() });
    ensureSpoken().beginTurn();
    session.markLlmSent(performance.now());
    flushOriginRef.current = undefined;
    userSpokeRef.current = true;
    awaitingReplyRef.current = true;
    llmRef.current?.sendUserFinal(id, text);
  }

  async function startCall() {
    if (startingRef.current) {
      return;
    }
    if (recording && !leavingRef.current) {
      return;
    }
    const epoch = (callEpochRef.current += 1);
    const live = () => callEpochRef.current === epoch && !leavingRef.current;
    startingRef.current = true;
    leavingRef.current = false;
    lastHumanAtRef.current = performance.now();
    probesRef.current = 0;
    probeAudioEndedAtRef.current = null;
    holdRef.current = false;
    closeArmedRef.current = false;
    askedStayRef.current = false;
    probeTurnRef.current = false;
    farewellTurnRef.current = false;
    setSeconds(0);
    speechRef.current?.resetForNewCall();
    void unlockTtsAudio();
    if (!live()) {
      startingRef.current = false;
      return;
    }
    stopTtsAudio();
    startCallAmbience(ambienceProfileForIncident(classifyIncident(props.scenario).class, props.scenario), {
      getContext: getSharedAudioContext,
      connectRecording: connectToCallRecording,
      disconnectRecording: disconnectFromCallRecording,
      listenVoiceActivity: setTtsVoiceActivityListener,
    });
    aiTurnRef.current += 1;
    createSpeech();
    seenFinalsRef.current = new Set();
    finalsRef.current = emptyTranscript();
    utterancePartsRef.current = [];
    liveSttRef.current = '';
    if (flushTimerRef.current !== undefined) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    spokenTtsRef.current = '';
    flushOriginRef.current = undefined;
    userSpokeRef.current = false;
    awaitingReplyRef.current = false;
    replyShownRef.current = false;
    pendingUserRef.current = '';
    lastSentRef.current = '';
    staleGensRef.current = new Set();
    ttsHoldRef.current = false;
    endedSentRef.current = false;
    ensureSpoken().reset();
    setLines([]);
    setMicError(undefined);
    setRecording(true);
    setCallState('listening');
    const opening =
      props.opening?.trim() ||
      (conversationRole === 'victim' ? props.scenario.callerOpening.trim() : '');
    if (opening) {
      spokenTtsRef.current = opening;
      ensureSpoken().beginTurn();
      const openingTurn = aiTurnRef.current;
      const role = aiRole;
      setLines([
        {
          id: `opening-${Date.now()}`,
          role,
          text: opening,
          live: false,
          speaking: false,
          source: 'llm',
          at: Date.now(),
        },
      ]);
      holdMicForTts();
      const releaseOpeningMic = () => {
        if (leavingRef.current) {
          return;
        }
        if (aiTurnRef.current !== openingTurn && (awaitingReplyRef.current || isTtsBusy())) {
          return;
        }
        ttsHoldRef.current = false;
        lastHumanAtRef.current = performance.now();
        if (!mutedRef.current) {
          streamRef.current?.setCaptureEnabled(true);
        }
      };
      void enqueueTtsAudio(opening, deskSide ? 'service' : aiVoiceId, callerVoice(), {
        onChunkPlaybackEnd: releaseOpeningMic,
      }).finally(releaseOpeningMic);
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
          speechRef.current?.failGeneration();
          spokenRef.current?.cancel();
          if (ttsHoldRef.current) {
            ensureAiTurnWaiter();
          } else {
            replyShownRef.current = false;
          }
          commitSpokenLine();
          return;
        }
        if (event.type === 'assistant_partial' && event.text.trim()) {
          if (!userSpokeRef.current && isSameSpeech(event.text, opening)) {
            return;
          }
          replyShownRef.current = true;
          if (!speechRef.current?.isGenerationOpen()) {
            speechRef.current?.beginTurn();
            ensureSpoken().beginTurn();
          }
          ensureAiTurnWaiter();
          speechRef.current?.ingestPartial(event.text);
          spokenTtsRef.current = speechRef.current?.getSpoken() || spokenTtsRef.current;
        }
        if (event.type === 'assistant_final') {
          awaitingReplyRef.current = false;
          if (!event.text.trim()) {
            speechRef.current?.failGeneration();
            if (ttsHoldRef.current) {
              ensureAiTurnWaiter();
            } else {
              replyShownRef.current = false;
              ttsHoldRef.current = false;
              if (!mutedRef.current) {
                streamRef.current?.setCaptureEnabled(true);
              }
            }
            if (userSpokeRef.current) {
              setMicError('Модель не вернула ответ. Повторите фразу.');
            }
            return;
          }
          if (!userSpokeRef.current && isSameSpeech(event.text, opening)) {
            speechRef.current?.failGeneration();
            ttsHoldRef.current = false;
            if (!mutedRef.current) {
              streamRef.current?.setCaptureEnabled(true);
            }
            return;
          }
          replyShownRef.current = true;
          setMicError(undefined);
          if (!speechRef.current?.isGenerationOpen() && !speechRef.current?.getSpoken()) {
            speechRef.current?.beginTurn();
            ensureSpoken().beginTurn();
          }
          ensureAiTurnWaiter();
          speechRef.current?.ingestFinal(event.text);
          spokenTtsRef.current = speechRef.current?.getSpoken() || event.text;
        }
      },
      onError: (message) => {
        setMicError(message);
        awaitingReplyRef.current = false;
        probeTurnRef.current = false;
        speechRef.current?.failGeneration();
        ttsHoldRef.current = false;
        replyShownRef.current = false;
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
        flushOriginRef.current = undefined;
        return;
      }
      const origin = flushOriginRef.current;
      if (origin != null) {
        console.info(`[VOICE LATENCY] frontend_handoff_ms=${Math.max(0, Math.round(performance.now() - origin))}`);
      }
      const id = crypto.randomUUID();
      lastSentRef.current = text;
      setLines((current) => replaceOrAppendUser(current, userRole, text, id, 'stt'));
      if (replyShownRef.current) {
        pendingUserRef.current = text;
        return;
      }
      beginUserTurn();
      sendToLlm(id, text);
    };

    const postponeFlushForLiveSpeech = () => {
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = undefined;
      }
    };

    const scheduleFlush = () => {
      if (flushOriginRef.current === undefined) {
        flushOriginRef.current = performance.now();
      }
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(flushUtterance, USER_FLUSH_COALESCE_MS);
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
      onActivity: () => {
        lastHumanAtRef.current = performance.now();
      },
      onEvent: (event) => {
        if (ttsHoldRef.current || mutedRef.current) {
          return;
        }
        const previousFinalCount = finalsRef.current.finals.length;
        finalsRef.current = applySttEvent(finalsRef.current, event);
        const live = finalsRef.current.partial;
        if (event.type === 'partial' && live.trim()) {
          postponeFlushForLiveSpeech();
          if (!isShorterTranscript(liveSttRef.current, live)) {
            liveSttRef.current = live;
          }
          showUserSpeech(utterancePartsRef.current, liveSttRef.current);
        }
        if (event.type === 'final' && finalsRef.current.finals.length === previousFinalCount) {
          return;
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
      if (!live()) {
        void llm.stop();
        return;
      }
      if (conversationRole === 'victim' && !opening) {
        llm.kickoff();
      }
    } catch (error: unknown) {
      if (!live()) {
        return;
      }
      const text = error instanceof Error ? error.message : '';
      if (text === 'stopped') {
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
      if (!live()) {
        return;
      }
      await stream.start();
      if (!live()) {
        await stream.stop();
        return;
      }
      const mic = stream.mediaStream();
      if (mic) {
        try {
          recorderRef.current = beginCallRecording(mic);
        } catch {
          recorderRef.current = undefined;
        }
      }
      if (ttsHoldRef.current && isTtsBusy()) {
        stream.setCaptureEnabled(false);
      } else if (mutedRef.current) {
        stream.setCaptureEnabled(false);
      } else {
        ttsHoldRef.current = false;
        stream.setCaptureEnabled(true);
      }
    } catch (error: unknown) {
      if (!live()) {
        return;
      }
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setMicError('Нет доступа к микрофону. Можно отвечать текстом.');
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setMicError('Микрофон не найден. Можно отвечать текстом.');
      } else {
        setMicError('Распознавание речи недоступно. Можно отвечать текстом.');
      }
    } finally {
      if (callEpochRef.current === epoch) {
        startingRef.current = false;
      }
    }
  }

  function callerVoice() {
    if (deskSide) {
      const tone = teacherToneRef.current;
      return tone
        ? { emotion: tone.emotion, pitch: tone.pitch, speed: tone.speed, gender: 'male' as const, speaker: 'aidar' as const }
        : { emotion: 'dispatch', pitch: 'medium' as const, speed: 1.08, gender: 'male' as const, speaker: 'aidar' as const };
    }
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

  function beginUserTurn() {
    aiTurnRef.current += 1;
    speechRef.current?.cancel();
    commitSpokenLine();
    userSpokeRef.current = true;
    spokenTtsRef.current = '';
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
    sendToLlm(id, trimmed);
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
    const epoch = (callEpochRef.current += 1);
    startingRef.current = false;
    leavingRef.current = true;
    ttsHoldRef.current = false;
    setRecording(false);
    spokenRef.current?.cancel();
    speechRef.current?.cancel();
    stopTtsAudio();
    stopCallAmbience();
    const stream = streamRef.current;
    const llm = llmRef.current;
    const rec = recorderRef.current;
    streamRef.current = undefined;
    llmRef.current = undefined;
    recorderRef.current = undefined;
    const committed = commitSpokenCaption(linesRef.current);
    setLines(committed);
    linesRef.current = committed;
    const snapshot: TranscriptTurn[] = committed
      .filter((line) => !line.live && line.text.trim())
      .map((line) => ({ role: line.role, text: line.text.trim(), at: line.at || Date.now() }));
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
    const audio = rec ? rec.stop().catch(() => null) : undefined;
    await stream?.stop();
    await llm?.stop();
    if (callEpochRef.current !== epoch) {
      return;
    }
    setCallState('ended');
    emitEnded(snapshot, audio);
  }

  hangupRef.current = hangup;

  useEffect(() => {
    if (!recording) {
      return;
    }
    const role = deskSide ? 'service' : conversationRole === 'operator' ? 'operator' : 'victim';
    const timer = window.setInterval(() => {
      if (leavingRef.current) {
        return;
      }
      if (
        ttsHoldRef.current &&
        !isTtsBusy() &&
        !awaitingReplyRef.current &&
        !speechRef.current?.isGenerationOpen()
      ) {
        probeTurnRef.current = false;
        ttsHoldRef.current = false;
        lastHumanAtRef.current = performance.now();
        if (!mutedRef.current) {
          streamRef.current?.setCaptureEnabled(true);
        }
      }
      const linesNow = linesRef.current;
      const operator = [...linesNow].reverse().find((line) => line.role === userRole && !line.live)?.text ?? '';
      const assistant =
        [...linesNow].reverse().find((line) => line.role === aiRole && !line.live)?.text ?? spokenTtsRef.current;
      const decision = presenceDecision({
        now: performance.now(),
        callActive: !leavingRef.current,
        userBusy:
          awaitingReplyRef.current ||
          ttsHoldRef.current ||
          isTtsBusy() ||
          Boolean(liveSttRef.current.trim()) ||
          utterancePartsRef.current.length > 0 ||
          flushTimerRef.current !== undefined ||
          Boolean(pendingUserRef.current.trim()) ||
          Boolean(draftRef.current.trim()) ||
          Boolean(speechRef.current?.isGenerationOpen()) ||
          probeTurnRef.current ||
          farewellTurnRef.current,
        lastHumanAt: lastHumanAtRef.current || performance.now(),
        probes: probesRef.current,
        probeAudioEndedAt: probeAudioEndedAtRef.current,
        hold: holdRef.current,
        closeArmed: closeArmedRef.current,
        farewellAudioReady: false,
        operatorText: operator,
        assistantText: assistant,
        role,
        askedStay: askedStayRef.current,
      });
      if (decision.kind !== 'probe') {
        return;
      }
      probesRef.current += 1;
      if (decision.intent === 'stay') {
        askedStayRef.current = true;
      }
      probeTurnRef.current = true;
      const session = speechRef.current ?? createSpeech();
      aiTurnRef.current += 1;
      session.beginTurn();
      ensureSpoken().beginTurn();
      llmRef.current?.sendPresence(crypto.randomUUID(), decision.intent);
      ensureAiTurnWaiter();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [aiRole, conversationRole, recording, userRole]);

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
          <div
            className="log"
            ref={logRef}
            lang="ru"
            onScroll={(event) => {
              const el = event.currentTarget;
              stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
            }}
          >
            {lines.length === 0 ? (
              <p className="hint">
                {props.hint ??
                  (conversationRole === 'victim'
                    ? 'После соединения заявитель начнёт разговор. Отвечайте голосом или текстом.'
                    : 'Вы заявитель. Задайте оператору вопросы по ситуации — в ответ будут эталонные формулировки.')}
              </p>
            ) : null}
            {lines.map((line) => (
              <article
                key={line.id}
                className={`line line-${line.role}${line.live ? ' line-partial' : ''}${line.speaking ? ' line-speaking' : ''}`}
                aria-current={line.speaking ? 'true' : undefined}
              >
                <span className="line-speaker">
                  {line.role === 'caller'
                    ? otherSpeaker
                    : deskSide
                      ? 'Диспетчер'
                      : 'Оператор'}
                  {line.speaking ? <i className="line-speak-pulse" aria-hidden="true" /> : null}
                </span>
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
