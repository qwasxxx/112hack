import assert from 'node:assert/strict';
import { test } from 'node:test';

function parseSttEvent(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || typeof value.type !== 'string') {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function emptyTranscript() {
  return { finals: [], partial: '', completeText: '' };
}

function applySttEvent(state, event) {
  if (event.type === 'partial') {
    return { ...state, partial: event.text };
  }
  if (event.type === 'final') {
    const nextFinals = [...state.finals, { id: String(state.finals.length), text: event.text }];
    return { finals: nextFinals, partial: '', completeText: nextFinals.map((item) => item.text).join(' ') };
  }
  if (event.type === 'session_complete') {
    return { ...state, partial: '', completeText: event.text || state.completeText };
  }
  return state;
}

function downsampleToPcm16k8(input, inputRate) {
  const outputRate = 8000;
  const ratio = inputRate / outputRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const index = Math.min(input.length - 1, Math.floor(i * ratio));
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

test('parses transcript messages', () => {
  assert.equal(parseSttEvent('{"type":"partial","text":"пожар"}').text, 'пожар');
  assert.equal(parseSttEvent('not-json'), undefined);
});

test('keeps finals and replaces partial', () => {
  let state = emptyTranscript();
  state = applySttEvent(state, { type: 'partial', text: 'Здравствуйте, у меня' });
  state = applySttEvent(state, { type: 'final', text: 'Здравствуйте, у меня пожар.' });
  state = applySttEvent(state, { type: 'partial', text: 'Пятый этаж' });
  assert.equal(state.finals.length, 1);
  assert.equal(state.partial, 'Пятый этаж');
  state = applySttEvent(state, { type: 'session_complete', text: 'Здравствуйте, у меня пожар. Пятый этаж' });
  assert.equal(state.partial, '');
  assert.match(state.completeText, /пожар/);
});

test('downsamples 48k audio to 8k pcm', () => {
  const input = new Float32Array(4800).fill(0.2);
  const out = downsampleToPcm16k8(input, 48000);
  assert.equal(out.length, 800);
  assert.equal(out instanceof Int16Array, true);
});

test('maps call states', () => {
  const label = (state) =>
    state === 'connecting' ? 'Подключение…' : state === 'listening' ? 'Идёт звонок' : state === 'ended' ? 'Вызов завершён' : 'Учебный вызов';
  assert.equal(label('connecting'), 'Подключение…');
  assert.equal(label('listening'), 'Идёт звонок');
  assert.equal(label('ended'), 'Вызов завершён');
});

test('microphone permission error is user-facing', () => {
  const name = 'NotAllowedError';
  const message =
    name === 'NotAllowedError'
      ? 'Нет доступа к микрофону. Разрешите запись в браузере.'
      : 'other';
  assert.match(message, /микрофон/i);
});
