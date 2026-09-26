import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rate = 24000;
const seconds = 12;
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/ambience');
mkdirSync(outDir, { recursive: true });

function hashNoise(index, salt) {
  const x = Math.imul(index + 1, 1597334677 ^ salt);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

function white(index, salt) {
  return hashNoise(index, salt) * 2 - 1;
}

function normalize(data, targetRms) {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i];
  }
  const rms = Math.sqrt(sum / data.length) || 1;
  const scale = targetRms / rms;
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.max(-0.92, Math.min(0.92, data[i] * scale));
  }
}

function crossfade(data, fade) {
  const n = Math.min(fade, Math.floor(data.length / 2));
  for (let i = 0; i < n; i += 1) {
    const mix = i / n;
    const start = data[i];
    const end = data[data.length - n + i];
    data[i] = end * (1 - mix) + start * mix;
    data[data.length - n + i] = start * (1 - mix) + end * mix;
  }
}

function fireCrackle() {
  const data = new Float32Array(rate * seconds);
  let brown = 0;
  let low = 0;
  let crackleEnv = 0;
  for (let i = 0; i < data.length; i += 1) {
    const w = white(i, 11);
    brown = (brown + 0.018 * w) / 1.018;
    low = 0.995 * low + 0.005 * w;
    if (hashNoise(i, 29) > 0.9991) {
      crackleEnv = 0.08 + hashNoise(i, 31) * 0.07;
    }
    crackleEnv *= 0.994;
    const roar = brown * 0.22 + low * 0.14;
    const hiss = w * 0.02;
    data[i] = roar + hiss + w * crackleEnv;
  }
  normalize(data, 0.05);
  crossfade(data, Math.floor(rate * 0.18));
  return data;
}

function roomTone() {
  const data = new Float32Array(rate * seconds);
  let brown = 0;
  let low = 0;
  for (let i = 0; i < data.length; i += 1) {
    const w = white(i, 71);
    brown = (brown + 0.01 * w) / 1.01;
    low = 0.997 * low + 0.003 * w;
    data[i] = brown * 0.65 + low * 0.35;
  }
  normalize(data, 0.08);
  crossfade(data, Math.floor(rate * 0.2));
  return data;
}

function trafficRoad() {
  const data = new Float32Array(rate * seconds);
  let brown = 0;
  let low = 0;
  for (let i = 0; i < data.length; i += 1) {
    const t = i / rate;
    const w = white(i, 101);
    brown = (brown + 0.02 * w) / 1.02;
    low = 0.994 * low + 0.006 * w;
    const whoosh = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.07 * t + 0.4 * Math.sin(2 * Math.PI * 0.023 * t));
    const pass = 0.12 * Math.sin(2 * Math.PI * 0.19 * t) * w;
    data[i] = (low * 0.72 + brown * 0.28) * whoosh + pass;
  }
  normalize(data, 0.16);
  crossfade(data, Math.floor(rate * 0.16));
  return data;
}

function writeWav(fileName, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    buf.writeInt16LE((Math.max(-1, Math.min(1, samples[i])) * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(path.join(outDir, fileName), buf);
}

writeWav('fire_crackle.wav', fireCrackle());
writeWav('room_tone.wav', roomTone());
writeWav('traffic_road.wav', trafficRoad());
console.log('ambience assets written', outDir);
