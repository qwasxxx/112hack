import { downsampleToPcm16k8 } from './pcm';
import { parseSttEvent, type SttEvent } from './stt-protocol';

const TARGET_RATE = 8000;
const FRAME_SAMPLES = 2400;

export type SttStream = {
  start(): Promise<void>;
  stop(): Promise<string>;
  setCaptureEnabled(enabled: boolean): void;
};

export function createSttStream(handlers: {
  onEvent: (event: SttEvent) => void;
  onError: (message: string) => void;
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
  let captureEnabled = true;

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
    processor?.disconnect();
    source?.disconnect();
    mute?.disconnect();
    media?.getTracks().forEach((track) => track.stop());
    processor = undefined;
    source = undefined;
    mute = undefined;
    media = undefined;
  }

  async function start(): Promise<void> {
    if (started) {
      return;
    }
    stopped = false;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      throw new Error('Браузер не поддерживает запись звука.');
    }
    try {
      media = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: TARGET_RATE,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        }),
        new Promise<MediaStream>((_, reject) => {
          window.setTimeout(() => reject(new Error('Микрофон не ответил.')), 2500);
        }),
      ]);
      media.getAudioTracks().forEach((track) => {
        track.enabled = captureEnabled;
      });
      context = new AudioContext();
      await context.resume();
      source = context.createMediaStreamSource(media);
      processor = context.createScriptProcessor(4096, 1, 1);
      mute = context.createGain();
      mute.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (stopped || !captureEnabled) {
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        const pcm = downsampleToPcm16k8(input, context?.sampleRate ?? 48000);
        const merged = new Int16Array(pending.length + pcm.length);
        merged.set(pending);
        merged.set(pcm, pending.length);
        pending = merged;
        flush();
      };
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);

      const host = window.location.hostname;
      socket = new WebSocket(
        host === 'localhost' || host === '127.0.0.1'
          ? 'ws://127.0.0.1:8090/ws/stt'
          : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/stt`,
      );
      socket.binaryType = 'arraybuffer';

      await new Promise<void>((resolve, reject) => {
        if (!socket) {
          reject(new Error('no socket'));
          return;
        }
        const timer = window.setTimeout(() => reject(new Error('Сервис распознавания не отвечает.')), 8000);
        socket.onopen = () => {
          socket?.send(
            JSON.stringify({ type: 'start', sample_rate: TARGET_RATE, channels: 1, encoding: 'pcm_s16le' }),
          );
        };
        socket.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error('Сервис распознавания недоступен.'));
        };
        socket.onclose = () => {
          if (!started && !stopped) {
            window.clearTimeout(timer);
            reject(new Error('Сервис распознавания недоступен.'));
          }
        };
        socket.onmessage = (message) => {
          if (typeof message.data !== 'string') {
            return;
          }
          const event = parseSttEvent(message.data);
          if (!event) {
            return;
          }
          if (event.type === 'ready') {
            window.clearTimeout(timer);
            started = true;
            resolve();
            if (!socket) {
              return;
            }
            socket.onmessage = (next) => {
              if (typeof next.data !== 'string') {
                return;
              }
              const parsed = parseSttEvent(next.data);
              if (parsed?.type === 'error') {
                handlers.onError(parsed.message);
                return;
              }
              if (parsed) {
                handlers.onEvent(parsed);
              }
            };
            return;
          }
          if (event.type === 'error') {
            window.clearTimeout(timer);
            handlers.onError(event.message);
            reject(new Error(event.message));
          }
        };
      });
    } catch (error) {
      await abortStart();
      throw error;
    }
  }

  async function abortStart() {
    stopped = true;
    releaseMic();
    if (context && context.state !== 'closed') {
      await context.close().catch(() => undefined);
    }
    context = undefined;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    socket = undefined;
  }

  async function stop(): Promise<string> {
    if (stopped && !started) {
      return '';
    }
    stopped = true;
    flush(true);
    releaseMic();
    if (context && context.state !== 'closed') {
      await context.close().catch(() => undefined);
    }
    context = undefined;

    return await new Promise((resolve) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        started = false;
        resolve('');
        return;
      }
      const current = socket;
      const timer = window.setTimeout(() => {
        current.close();
        started = false;
        resolve('');
      }, 2500);
      const previous = current.onmessage;
      current.onmessage = (message) => {
        previous?.call(current, message);
        if (typeof message.data !== 'string') {
          return;
        }
        const event = parseSttEvent(message.data);
        if (event?.type === 'session_complete') {
          window.clearTimeout(timer);
          started = false;
          current.close();
          resolve(event.text);
        }
      };
      current.send(JSON.stringify({ type: 'stop' }));
    });
  }

  function setCaptureEnabled(enabled: boolean) {
    captureEnabled = enabled;
    media?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    if (!enabled) {
      pending = new Int16Array(0);
    }
  }

  return { start, stop, setCaptureEnabled };
}
