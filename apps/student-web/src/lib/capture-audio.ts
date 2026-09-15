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
