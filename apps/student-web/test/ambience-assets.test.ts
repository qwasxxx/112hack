import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { REQUIRED_AMBIENCE_FILES, requiredFilenamesFromManifest } from '../src/lib/ambience-assets.ts';
import { AMBIENCE_FILES, AMBIENCE_MANIFEST } from '../src/lib/ambience-manifest.ts';
import { AMBIENCE_TYPES } from '../src/lib/ambience-types.ts';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/audio/ambience');

function mp3DurationSec(file: string): number {
  const buf = readFileSync(path.join(dir, file));
  assert.ok(buf.length > 64, `${file} empty`);
  const id3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
  let offset = 0;
  if (id3) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    offset = 10 + size;
  }
  let frames = 0;
  let sampleRate = 0;
  const rates = [44100, 48000, 32000, 22050, 24000, 16000, 11025, 12000, 8000];
  while (offset + 4 < buf.length && frames < 400000) {
    if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const ver = (buf[offset + 1] >> 3) & 3;
    const layer = (buf[offset + 1] >> 1) & 3;
    const srIdx = (buf[offset + 2] >> 2) & 3;
    const pad = (buf[offset + 2] >> 1) & 1;
    const bitrateIdx = (buf[offset + 2] >> 4) & 0x0f;
    const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    const bitrate = (bitrates[bitrateIdx] ?? 0) * 1000;
    const srTable = ver === 3 ? [44100, 48000, 32000] : ver === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    sampleRate = srTable[srIdx] ?? rates[0] ?? 44100;
    if (!bitrate || !sampleRate || layer !== 1) {
      offset += 1;
      continue;
    }
    const samples = ver === 3 ? 1152 : 576;
    const frameSize = Math.floor((samples / 8) * bitrate / sampleRate) + pad;
    if (frameSize <= 0) {
      offset += 1;
      continue;
    }
    frames += 1;
    offset += frameSize;
    if (frames === 1) {
      const totalFramesGuess = Math.max(1, Math.floor((buf.length - (id3 ? 10 : 0)) / frameSize));
      return (totalFramesGuess * samples) / sampleRate;
    }
  }
  assert.ok(sampleRate > 0, `${file} is not a valid mp3`);
  return 0;
}

test('every manifest profile points at existing local audio files', () => {
  for (const type of AMBIENCE_TYPES) {
    const entry = AMBIENCE_MANIFEST[type];
    assert.ok(entry, `${type} missing from manifest`);
    assert.ok(entry.layers.length > 0, `${type} has no layers`);
    assert.ok(entry.gain > 0, `${type} must not be accidental silence`);
    for (const layer of entry.layers) {
      const names = [layer.asset, ...layer.fallbacks].map((id) => AMBIENCE_FILES[id].replace('/audio/ambience/', ''));
      for (const name of names) {
        const full = path.join(dir, name);
        assert.ok(existsSync(full), `missing ${name}`);
        assert.ok(statSync(full).size > 40_000, `${name} too small`);
        assert.ok(name.endsWith('.mp3'));
      }
    }
  }
});

test('local ambience assets exist, are mp3, and have loopable duration', () => {
  const required = new Set([...REQUIRED_AMBIENCE_FILES, ...requiredFilenamesFromManifest()]);
  for (const file of required) {
    const info = statSync(path.join(dir, file));
    assert.ok(info.size > 40_000, `${file} too small`);
    const seconds = mp3DurationSec(file);
    if (file.includes('oneshot')) {
      assert.ok(seconds >= 0.4 && seconds < 20, `${file} oneshot duration ${seconds}`);
    } else {
      assert.ok(seconds >= 20, `${file} loop is too short (${seconds}s)`);
    }
  }
});
