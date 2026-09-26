import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { applySttEvent, emptyTranscript } from '../src/lib/stt-protocol.ts';
import { gateRussianOperatorText, polishOperatorTranscript } from '../src/lib/russian-transcript.ts';
import { floatToPcm16, resampleToPcm16, StreamingPcmResampler, STT_CAPTURE_RATE } from '../src/lib/pcm.ts';
import { OPERATOR_STT_CORPUS, OPERATOR_STT_MIXED, OPERATOR_STT_REJECTED } from '../src/lib/operator-stt-corpus.ts';

test('wire capture is 16 kHz 20 ms frames, not telephony 8 kHz', async () => {
  const source = await readFile(new URL('../src/lib/stt-stream.ts', import.meta.url), 'utf8');
  assert.equal(STT_CAPTURE_RATE, 16000);
  assert.match(source, /STT_FRAME_SAMPLES = 320/);
  assert.match(source, /sampleRate: \{ ideal: 1 \}|channelCount: \{ ideal: 1 \}/);
  assert.match(source, /echoCancellation: true/);
  assert.match(source, /noiseSuppression: false/);
  assert.match(source, /autoGainControl: false/);
  assert.doesNotMatch(source, /sampleRate: TARGET_RATE|sampleRate: 8000/);
});

test('operator corpus stays Russian after the gate', () => {
  for (const phrase of OPERATOR_STT_CORPUS) {
    assert.equal(gateRussianOperatorText(phrase), phrase, phrase);
  }
});

test('English-only operator hypotheses are rejected', () => {
  for (const phrase of OPERATOR_STT_REJECTED) {
    assert.equal(gateRussianOperatorText(phrase), '');
  }
});

test('mixed-language hypotheses keep only Russian', () => {
  for (const [heard, expected] of OPERATOR_STT_MIXED) {
    assert.equal(gateRussianOperatorText(heard), expected);
  }
});

test('short Russian answers and numbers are kept', () => {
  for (const phrase of ['Да.', 'Нет.', 'Адрес?', '112', 'дом 15', 'квартира 27', 'МЧС', 'ДТП']) {
    assert.equal(gateRussianOperatorText(phrase), phrase);
  }
});

test('stale partial cannot overwrite a final', () => {
  let state = emptyTranscript();
  state = applySttEvent(state, { type: 'partial', text: 'Thank you', utt_id: 1 });
  assert.equal(state.partial, '');
  state = applySttEvent(state, { type: 'final', text: 'Что случилось?', utt_id: 1 });
  assert.equal(state.finals.at(-1)?.text, 'Что случилось?');
  state = applySttEvent(state, { type: 'partial', text: 'Hello', utt_id: 1 });
  assert.equal(state.partial, '');
  assert.equal(state.finals.at(-1)?.text, 'Что случилось?');
});

test('duplicate finals are ignored', () => {
  let state = emptyTranscript();
  state = applySttEvent(state, { type: 'final', text: 'Да.', utt_id: 2 });
  state = applySttEvent(state, { type: 'final', text: 'Да.', utt_id: 2 });
  assert.equal(state.finals.length, 1);
});

test('cancelled older utt partial is ignored after a newer final', () => {
  let state = emptyTranscript();
  state = applySttEvent(state, { type: 'final', text: 'Нет.', utt_id: 4 });
  state = applySttEvent(state, { type: 'partial', text: 'Can you hear me?', utt_id: 3 });
  assert.equal(state.partial, '');
  assert.equal(state.finals[0]?.text, 'Нет.');
});

test('resampler 48 kHz to 16 kHz has no clipping and expected length', () => {
  const input = new Float32Array(4800);
  for (let i = 0; i < input.length; i += 1) {
    input[i] = Math.sin((2 * Math.PI * 220 * i) / 48000);
  }
  const out = resampleToPcm16(input, 48000, 16000);
  assert.ok(out.length >= 1590 && out.length <= 1610);
  for (const sample of out) {
    assert.ok(sample >= -32768 && sample <= 32767);
  }
});

test('streaming resampler does not drop chunk boundaries', () => {
  const resampler = new StreamingPcmResampler(16000);
  const first = new Float32Array(1024).fill(0.25);
  const second = new Float32Array(1024).fill(0.25);
  const a = resampler.push(first, 48000);
  const b = resampler.push(second, 48000);
  const total = a.length + b.length;
  assert.ok(total >= 680 && total <= 690);
});

test('pcm conversion clamps overflow', () => {
  assert.equal(floatToPcm16(2), 32767);
  assert.equal(floatToPcm16(-2), -32768);
  assert.equal(floatToPcm16(0), 0);
});

test('phonetic English and crowd hallucinations are rejected', () => {
  assert.equal(polishOperatorTranscript('Сэньтью.'), '');
  assert.equal(polishOperatorTranscript('Фондюши.'), '');
  assert.equal(polishOperatorTranscript('Он дышит?'), 'Он дышит?');
});

test('short fire near-misses repair to Нет', () => {
  assert.equal(polishOperatorTranscript('Низ.'), 'Нет.');
  assert.equal(polishOperatorTranscript('Неж'), 'Нет');
  assert.equal(polishOperatorTranscript('Газ'), 'Газ');
});

test('hold and reconnect stay on the capture path', async () => {
  const source = await readFile(new URL('../src/lib/stt-stream.ts', import.meta.url), 'utf8');
  assert.match(source, /sendControl\('hold'\)/);
  assert.match(source, /sendControl\('resume'\)/);
  assert.match(source, /scheduleReconnect/);
  assert.match(source, /reacquireMic/);
});

test('same-rate conversion stays 1:1', () => {
  const input = new Float32Array([0.1, -0.2, 0.3]);
  const out = resampleToPcm16(input, 16000, 16000);
  assert.equal(out.length, 3);
});
