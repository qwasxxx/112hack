export function downsampleToPcm16k8(input: Float32Array, inputRate: number): Int16Array {
  const outputRate = 8000;
  if (input.length === 0) {
    return new Int16Array(0);
  }
  if (inputRate === outputRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      out[i] = floatToPcm16(input[i] ?? 0);
    }
    return out;
  }
  const ratio = inputRate / outputRate;
  const window = Math.max(2, Math.floor(ratio * 2));
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const center = i * ratio;
    const start = Math.max(0, Math.floor(center - window / 2));
    const end = Math.min(input.length, start + window);
    let sum = 0;
    let weightSum = 0;
    for (let j = start; j < end; j += 1) {
      const weight = 1 - Math.abs(j - center) / window;
      if (weight <= 0) {
        continue;
      }
      sum += (input[j] ?? 0) * weight;
      weightSum += weight;
    }
    out[i] = floatToPcm16(sum / Math.max(weightSum, 1e-6));
  }
  return out;
}

function floatToPcm16(value: number): number {
  const sample = Math.max(-1, Math.min(1, value));
  return sample < 0 ? sample * 0x8000 : sample * 0x7fff;
}
