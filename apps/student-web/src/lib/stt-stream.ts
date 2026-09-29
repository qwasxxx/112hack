import { parseSttEvent, type SttEvent } from './stt-protocol';
import { gateRussianOperatorText, polishOperatorTranscript } from './russian-transcript';
import { mixToMono, StreamingPcmResampler, STT_CAPTURE_RATE } from './pcm';
import { getSharedAudioContext } from './tts-player';

export const STT_WIRE_RATE = STT_CAPTURE_RATE;
export const STT_FRAME_SAMPLES = 320;
const FRAME_SAMPLES = STT_FRAME_SAMPLES;
const ECHO_TAIL_MS = 320;
const PROCESSOR_BUFFER = 1024;
const MAX_RECONNECT = 5;

export type SttStream = {
  start(): Promise<void>;
  stop(): Promise<string>;
  setCaptureEnabled(enabled: boolean): void;
  mediaStream(): MediaStream | undefined;
};

function logMicDiagnostics(track: MediaStreamTrack, contextRate: number, wireRate: number) {
  const settings = track.getSettings();
  console.info('[STT MIC]', {
    trackSampleRate: settings.sampleRate ?? null,
    contextSampleRate: contextRate,
    wireSampleRate: wireRate,
    channelCount: settings.channelCount ?? null,
    echoCancellation: settings.echoCancellation ?? null,
    noiseSuppression: settings.noiseSuppression ?? null,
    autoGainControl: settings.autoGainControl ?? null,
  });
}

export function createSttStream(handlers: {
  onEvent: (event: SttEvent) => void;
  onError: (message: string) => void;
  onActivity?: () => void;
}): SttStream {
  let socket: WebSocket | undefined;
  let media: MediaStream | undefined;
  let context: AudioContext | undefined;
  let processor: ScriptProcessorNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let mute: GainNode | undefined;
  let pending = new Int16Array(0);
  let stopped = false;
  let started = false;
  let retired = false;
  let ticket = 0;
  let captureEnabled = true;
  let resumeAt = 0;
  let wireRate = STT_WIRE_RATE;
  let dropUntilResume = false;
  let reconnectAttempts = 0;
  let reconnectTimer = 0;
  const resampler = new StreamingPcmResampler(STT_WIRE_RATE);

  function sendControl(kind: 'hold' | 'resume' | 'start') {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify({ type: kind, sample_rate: wireRate, channels: 1, encoding: 'pcm_s16le' }));
  }

  function sendPcm(frame: Int16Array) {
    if (!socket || socket.readyState !== WebSocket.OPEN || frame.length === 0) {
      return;
    }
    socket.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
  }

  function flush(force = false) {
    while (pending.length >= FRAME_SAMPLES) {
      sendPcm(pending.subarray(0, FRAME_SAMPLES));
      pending = pending.subarray(FRAME_SAMPLES);
    }
    if (force && pending.length > 0) {
      sendPcm(pending);
      pending = new Int16Array(0);
    }
  }

  function releaseMic() {
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }
    source?.disconnect();
    mute?.disconnect();
    media?.getTracks().forEach((track) => track.stop());
    processor = undefined;
    source = undefined;
    mute = undefined;
    media = undefined;
    resampler.reset();
    pending = new Int16Array(0);
  }

  function alive(mine: number) {
    return !retired && !stopped && mine === ticket;
  }

  function emitEvent(event: SttEvent) {
    if ((event.type === 'partial' || event.type === 'final') && dropUntilResume) {
      return;
    }
    if (event.type === 'partial' || event.type === 'final') {
      const gated = polishOperatorTranscript(event.text);
      if (!gated) {
        return;
      }
      handlers.onEvent({ ...event, text: gated });
      return;
    }
    handlers.onEvent(event);
  }

  async function start(): Promise<void> {
    if (started || retired) {
      throw new Error('stopped');
    }
    const mine = ++ticket;
    stopped = false;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      throw new Error('Браузер не поддерживает запись звука.');
    }
    const requested = navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const socketReady = openSocket(mine);
    try {
      media = await requested;
      if (!alive(mine)) {
        media.getTracks().forEach((track) => track.stop());
        media = undefined;
        throw new Error('stopped');
      }
      media.getAudioTracks().forEach((track) => {
        track.enabled = captureEnabled;
      });
      context = getSharedAudioContext();
      await context.resume();
      if (!alive(mine)) {
        throw new Error('stopped');
      }
      const track = media.getAudioTracks()[0];
      if (track) {
        logMicDiagnostics(track, context.sampleRate, wireRate);
        watchMicTrack(mine, track);
      }
      source = context.createMediaStreamSource(media);
      processor = context.createScriptProcessor(PROCESSOR_BUFFER, 1, 1);
      mute = context.createGain();
      mute.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (stopped || !captureEnabled || performance.now() < resumeAt) {
          return;
        }
        const input = mixToMono(event.inputBuffer);
        let energy = 0;
        for (let index = 0; index < input.length; index += 1) {
          energy += input[index] * input[index];
        }
        if (input.length > 0 && Math.sqrt(energy / input.length) > 0.02) {
          handlers.onActivity?.();
        }
        const pcm = resampler.push(input, context?.sampleRate ?? 48000);
        if (pcm.length === 0) {
          return;
        }
        const merged = new Int16Array(pending.length + pcm.length);
        merged.set(pending);
        merged.set(pcm, pending.length);
        pending = merged;
        flush();
      };
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);
      await socketReady;
      if (!alive(mine)) {
        throw new Error('stopped');
      }
    } catch (error) {
      void requested.then((stream) => {
        if (media !== stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      }).catch(() => undefined);
      await abortStart();
      throw error;
    }
  }

  function openSocket(mine: number): Promise<void> {
    const host = window.location.hostname;
    socket = new WebSocket(
      host === 'localhost' || host === '127.0.0.1'
        ? 'ws://127.0.0.1:8090/ws/stt'
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/stt`,
    );
    socket.binaryType = 'arraybuffer';
    const current = socket;
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Сервис распознавания не отвечает.')), 8000);
      current.onopen = () => {
        current.send(
          JSON.stringify({ type: 'start', sample_rate: wireRate, channels: 1, encoding: 'pcm_s16le' }),
        );
      };
      current.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Сервис распознавания недоступен.'));
      };
      current.onclose = () => {
        if (!started && !stopped) {
          window.clearTimeout(timer);
          reject(new Error('Сервис распознавания недоступен.'));
          return;
        }
        if (started && !stopped && !retired && current === socket) {
          scheduleReconnect(mine);
        }
      };
      current.onmessage = (message) => {
        if (typeof message.data !== 'string') {
          return;
        }
        const event = parseSttEvent(message.data);
        if (!event) {
          return;
        }
        if (event.type === 'ready') {
          window.clearTimeout(timer);
          if (!alive(mine)) {
            reject(new Error('stopped'));
            return;
          }
          const accepted = event.sample_rate;
          if (typeof accepted === 'number' && accepted > 0 && accepted !== wireRate) {
            wireRate = accepted;
            resampler.setRate(wireRate);
            console.info('[STT MIC]', { wireSampleRate: wireRate, adapted: true });
          }
          started = true;
          reconnectAttempts = 0;
          current.onmessage = (next) => {
            if (stopped || typeof next.data !== 'string') {
              return;
            }
            const parsed = parseSttEvent(next.data);
            if (parsed?.type === 'error') {
              handlers.onError(parsed.message);
              return;
            }
            if (parsed) {
              if (parsed.type === 'final') {
                console.info('[VOICE LATENCY] T2_stt_final');
              }
              emitEvent(parsed);
            }
          };
          resolve();
          return;
        }
        if (event.type === 'error') {
          window.clearTimeout(timer);
          handlers.onError(event.message);
          reject(new Error(event.message));
        }
      };
    });
  }

  function scheduleReconnect(mine: number) {
    if (!alive(mine) || !started || stopped || retired) {
      return;
    }
    if (reconnectAttempts >= MAX_RECONNECT) {
      handlers.onError('Распознавание речи недоступно. Можно отвечать текстом.');
      return;
    }
    const delay = Math.min(2000, 300 * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(() => {
      if (!alive(mine) || stopped || retired) {
        return;
      }
      void openSocket(mine).catch(() => {
        if (alive(mine) && !stopped && !retired) {
          scheduleReconnect(mine);
        }
      });
    }, delay);
  }

  function watchMicTrack(mine: number, track: MediaStreamTrack) {
    track.onended = () => {
      if (!alive(mine) || stopped || retired) {
        return;
      }
      void reacquireMic(mine);
    };
  }

  async function reacquireMic(mine: number) {
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!alive(mine) || stopped || retired) {
        next.getTracks().forEach((item) => item.stop());
        return;
      }
      media?.getTracks().forEach((item) => item.stop());
      source?.disconnect();
      media = next;
      next.getAudioTracks().forEach((item) => {
        item.enabled = captureEnabled;
      });
      if (context && processor) {
        source = context.createMediaStreamSource(next);
        source.connect(processor);
      }
      const track = next.getAudioTracks()[0];
      if (track && context) {
        logMicDiagnostics(track, context.sampleRate, wireRate);
        watchMicTrack(mine, track);
      }
    } catch {
      handlers.onError('Нет доступа к микрофону. Можно отвечать текстом.');
    }
  }

  async function abortStart() {
    retired = true;
    ticket += 1;
    stopped = true;
    window.clearTimeout(reconnectTimer);
    releaseMic();
    context = undefined;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close();
    }
    socket = undefined;
  }

  async function stop(): Promise<string> {
    const alreadyDone = retired && stopped && !started;
    retired = true;
    ticket += 1;
    stopped = true;
    window.clearTimeout(reconnectTimer);
    if (alreadyDone) {
      return '';
    }
    flush(true);
    releaseMic();
    context = undefined;

    return await new Promise((resolve) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        started = false;
        resolve('');
        return;
      }
      const current = socket;
      let settled = false;
      let timer = 0;
      const finish = (text: string) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        started = false;
        resolve(gateRussianOperatorText(text));
      };
      timer = window.setTimeout(() => {
        current.close();
        finish('');
      }, 2500);
      current.onclose = () => finish('');
      const previous = current.onmessage;
      current.onmessage = (message) => {
        previous?.call(current, message);
        if (typeof message.data !== 'string') {
          return;
        }
        const event = parseSttEvent(message.data);
        if (event?.type === 'session_complete') {
          finish(event.text);
          current.close();
        }
      };
      current.send(JSON.stringify({ type: 'stop' }));
    });
  }

  function setCaptureEnabled(enabled: boolean) {
    if (enabled && !captureEnabled) {
      dropUntilResume = false;
      resumeAt = performance.now() + ECHO_TAIL_MS;
      resampler.reset();
      pending = new Int16Array(0);
      sendControl('resume');
    }
    captureEnabled = enabled;
    media?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    if (!enabled) {
      dropUntilResume = true;
      pending = new Int16Array(0);
      resampler.reset();
      sendControl('hold');
    }
  }

  return { start, stop, setCaptureEnabled, mediaStream: () => media };
}
