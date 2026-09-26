export const STT_CAPTURE_RATE = 16000;

export function floatToPcm16(value: number): number {
  const sample = Math.max(-1, Math.min(1, value));
  const scaled = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  if (scaled > 32767) {
    return 32767;
  }
  if (scaled < -32768) {
    return -32768;
  }
  return scaled | 0;
}

export function mixToMono(buffer: AudioBuffer | { numberOfChannels: number; getChannelData: (i: number) => Float32Array }): Float32Array {
  const channels = Math.max(1, buffer.numberOfChannels);
  const left = buffer.getChannelData(0);
  if (channels === 1) {
    return left;
  }
  const mixed = new Float32Array(left.length);
  for (let i = 0; i < left.length; i += 1) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch += 1) {
      sum += buffer.getChannelData(ch)[i] ?? 0;
    }
    mixed[i] = sum / channels;
  }
  return mixed;
}

export function resampleToPcm16(input: Float32Array, inputRate: number, outputRate = STT_CAPTURE_RATE): Int16Array {
  const resampler = new StreamingPcmResampler(outputRate);
  return resampler.push(input, inputRate);
}

/** @deprecated Telephony 8 kHz path — Whisper capture uses 16 kHz. */
export function downsampleToPcm16k8(input: Float32Array, inputRate: number): Int16Array {
  return resampleToPcm16(input, inputRate, STT_CAPTURE_RATE);
}

export class StreamingPcmResampler {
  private leftover = new Float32Array(0);
  private phase = 0;
  private outputRate: number;

  constructor(outputRate: number) {
    this.outputRate = outputRate;
  }

  get rate(): number {
    return this.outputRate;
  }

  setRate(rate: number) {
    if (rate === this.outputRate) {
      return;
    }
    this.outputRate = rate;
    this.reset();
  }

  reset() {
    this.leftover = new Float32Array(0);
    this.phase = 0;
  }

  push(input: Float32Array, inputRate: number): Int16Array {
    if (input.length === 0) {
      return new Int16Array(0);
    }
    const srcRate = inputRate > 0 ? inputRate : this.outputRate;
    const merged = new Float32Array(this.leftover.length + input.length);
    if (this.leftover.length > 0) {
      merged.set(this.leftover, 0);
    }
    merged.set(input, this.leftover.length);

    if (srcRate === this.outputRate) {
      const out = new Int16Array(merged.length);
      for (let i = 0; i < merged.length; i += 1) {
        out[i] = floatToPcm16(merged[i] ?? 0);
      }
      this.leftover = new Float32Array(0);
      this.phase = 0;
      return out;
    }

    const step = srcRate / this.outputRate;
    const out: number[] = [];
    let pos = this.phase;
    while (pos + 1e-9 < merged.length) {
      const lastIndex = Math.min(merged.length - 1, Math.floor(pos));
      const nextIndex = Math.min(merged.length - 1, lastIndex + 1);
      const needed = pos + (step > 1 ? step : 1);
      if (needed > merged.length && lastIndex >= merged.length - 1) {
        break;
      }
      if (step >= 1.5) {
        const start = lastIndex;
        const end = Math.min(merged.length, Math.ceil(pos + step));
        if (end - start < 1 || (end >= merged.length && pos + step > merged.length + 1e-9)) {
          break;
        }
        let sum = 0;
        for (let j = start; j < end; j += 1) {
          sum += merged[j] ?? 0;
        }
        out.push(floatToPcm16(sum / Math.max(1, end - start)));
      } else {
        if (pos > merged.length - 1 && merged.length < 2) {
          break;
        }
        const frac = pos - lastIndex;
        const a = merged[lastIndex] ?? 0;
        const b = merged[nextIndex] ?? a;
        out.push(floatToPcm16(a + (b - a) * frac));
      }
      pos += step;
    }

    const consumed = Math.min(merged.length, Math.floor(pos));
    this.leftover = merged.subarray(consumed);
    this.phase = pos - consumed;
    if (this.phase < 0) {
      this.phase = 0;
    }
    return Int16Array.from(out);
  }
}
