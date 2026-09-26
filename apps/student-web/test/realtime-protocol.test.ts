import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStaleAssistantEvent, parseLlmEvent } from '../src/lib/llm-protocol.ts';

test('J: duplicate user_final key is ignored by sendUserFinal contract', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/lib/llm-stream.ts', import.meta.url), 'utf8'),
  );
  assert.match(source, /if \(key === lastUserFinal\)/);
  assert.match(source, /isStaleAssistantEvent/);
});

test('STT PCM frames stay at 20ms so VAD is not 50ms-quantized', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/lib/stt-stream.ts', import.meta.url), 'utf8'),
  );
  assert.match(source, /STT_FRAME_SAMPLES = 320/);
  assert.doesNotMatch(source, /FRAME_SAMPLES = 400/);
});

test('I: cancelled or older gen assistant events are ignored', () => {
  const cancelled = new Set([3]);
  assert.equal(
    isStaleAssistantEvent({ type: 'assistant_partial', text: 'Да.', gen: 3 }, 4, cancelled),
    true,
  );
  assert.equal(
    isStaleAssistantEvent({ type: 'assistant_partial', text: 'Да.', gen: 2 }, 4, new Set()),
    true,
  );
  assert.equal(
    isStaleAssistantEvent({ type: 'assistant_partial', text: 'Нет.', gen: 5 }, 4, cancelled),
    false,
  );
  assert.equal(isStaleAssistantEvent({ type: 'ready', call_id: 'x' }, 4, cancelled), false);
});

test('parses generation_cancelled without treating it as speech', () => {
  const event = parseLlmEvent('{"type":"generation_cancelled","gen":7}');
  assert.equal(event?.type, 'generation_cancelled');
  assert.equal(isStaleAssistantEvent(event!, 7, new Set()), false);
});
