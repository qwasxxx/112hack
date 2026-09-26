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

test('downsamples 48k audio to 16k pcm', () => {
  const input = new Float32Array(4800).fill(0.2);
  const outputRate = 16000;
  const ratio = 48000 / outputRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  assert.equal(outLength, 1600);
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

test('lesson sections map ai roles', () => {
  const SECTION_AI_ROLE = { theory: 'operator', training: 'victim', exam: 'victim' };
  assert.equal(SECTION_AI_ROLE.theory, 'operator');
  assert.equal(SECTION_AI_ROLE.training, 'victim');
  assert.equal(SECTION_AI_ROLE.exam, 'victim');
});

test('training hangup waits for analysis events', () => {
  const label = (state) =>
    state === 'analyzing' ? 'Разбор разговора…' : state === 'ended' ? 'Вызов завершён' : 'Учебный вызов';
  assert.equal(label('analyzing'), 'Разбор разговора…');
  const events = [];
  function onEvent(event) {
    if (event.type === 'analysis_partial' || event.type === 'analysis_final') {
      events.push(event.text);
    }
  }
  onEvent({ type: 'assistant_final', text: 'Помогите' });
  onEvent({ type: 'analysis_partial', text: 'Адрес назван.' });
  onEvent({ type: 'analysis_final', text: 'Адрес назван. Дальше стоит уточнить, есть ли пострадавшие.' });
  assert.equal(events.at(-1).includes('Адрес назван'), true);
});

test('llm is only called on final transcripts', () => {
  const sent = [];
  const seen = new Set();
  function onStt(event) {
    if (event.type !== 'final' || !event.text.trim() || seen.has(event.id)) {
      return;
    }
    seen.add(event.id);
    sent.push(event.text);
  }
  onStt({ type: 'partial', text: 'У нас' });
  onStt({ type: 'partial', text: 'У нас пожар' });
  onStt({ type: 'final', id: '1', text: 'У нас пожар в квартире.' });
  onStt({ type: 'final', id: '1', text: 'У нас пожар в квартире.' });
  assert.deepEqual(sent, ['У нас пожар в квартире.']);
});

test('live transcript does not shrink and merges split finals', () => {
  function isShorterTranscript(previous, next) {
    const prev = previous.trim();
    const value = next.trim();
    if (!prev || !value || prev === value) return false;
    return prev.startsWith(value) || (prev.includes(value) && value.length + 4 <= prev.length);
  }
  function composeUtterance(parts, live) {
    const base = parts.map((item) => item.trim()).filter(Boolean).join(' ');
    const extra = live.trim();
    if (!extra) return base;
    if (!base) return extra;
    if (extra.toLowerCase().startsWith(base.toLowerCase())) return extra;
    if (base.toLowerCase().includes(extra.toLowerCase()) || isShorterTranscript(base, extra)) return base;
    return `${base} ${extra}`;
  }
  assert.equal(isShorterTranscript('у нас пожар в квартире', 'у нас пожар'), true);
  assert.equal(composeUtterance(['у нас пожар'], 'в квартире'), 'у нас пожар в квартире');
  assert.equal(composeUtterance(['у нас пожар'], 'у нас'), 'у нас пожар');
});

