export async function captureAudio(signal: AbortSignal): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  if (signal.aborted) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return new Blob();
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream);

  try {
    return await new Promise<Blob>((resolve, reject) => {
      const stop = () => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      });
      recorder.addEventListener('stop', () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      });
      recorder.addEventListener('error', () => reject(new Error('Не удалось записать звук')));
      signal.addEventListener('abort', stop, { once: true });
      recorder.start();
    });
  } finally {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

export function startCallRecorder(): { stop: () => Promise<Blob> } {
  let recorder: MediaRecorder | undefined;
  const chunks: BlobPart[] = [];
  const ready = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    recorder = new MediaRecorder(stream);
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });
    recorder.start(1000);
    return stream;
  });

  return {
    stop: async () => {
      const stream = await ready.catch(() => undefined);
      const blob = await new Promise<Blob>((resolve) => {
        if (!recorder || recorder.state === 'inactive') {
          resolve(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
          return;
        }
        recorder.addEventListener(
          'stop',
          () => resolve(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })),
          { once: true },
        );
        recorder.stop();
      });
      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }
      return blob;
    },
  };
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = 1;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytes = length * 2;
  const out = new ArrayBuffer(44 + bytes);
  const view = new DataView(out);
  const src = buffer.getChannelData(0);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    const sample = Math.max(-1, Math.min(1, src[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}

export async function blobToWav(blob: Blob): Promise<Blob> {
  if (!blob.size) {
    return blob;
  }
  if (blob.type.includes('wav')) {
    return blob;
  }
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * 16000));
    const offline = new OfflineAudioContext(1, length, 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return encodeWav(await offline.startRendering());
  } catch {
    return blob;
  } finally {
    void ctx.close();
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      resolve(text.includes(',') ? text.slice(text.indexOf(',') + 1) : text);
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать запись'));
    reader.readAsDataURL(blob);
  });
}
