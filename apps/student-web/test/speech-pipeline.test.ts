import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAiSpeechSession,
  formatCallLatency,
  takeSpeechChunks,
  USER_FLUSH_COALESCE_MS,
} from '../src/lib/speech-pipeline.ts';

test('coalesce delay is a tiny event-driven wait, not 1000ms', () => {
  assert.equal(USER_FLUSH_COALESCE_MS, 16);
  assert.ok(USER_FLUSH_COALESCE_MS < 50);
  assert.notEqual(USER_FLUSH_COALESCE_MS, 1000);
});

test('D: very short valid response can be spoken without a 48-char gate', () => {
  const first = takeSpeechChunks('Да.', '');
  assert.deepEqual(first.chunks, ['Да.']);
  const flushed = takeSpeechChunks('Да', '', true);
  assert.deepEqual(flushed.chunks, ['Да']);
});

test('does not split a natural sentence on a comma', () => {
  const { chunks } = takeSpeechChunks('Да, один человек пострадал.', '');
  assert.deepEqual(chunks, ['Да, один человек пострадал.']);
});

test('B: two-sentence response yields ordered chunks', () => {
  const { chunks } = takeSpeechChunks('Да, один человек пострадал. Он в сознании.', '');
  assert.deepEqual(chunks, ['Да, один человек пострадал.', 'Он в сознании.']);
});

test('C: assistant_final after partial does not duplicate spoken text', () => {
  const partial = takeSpeechChunks('Да, один человек пострадал.', '');
  assert.deepEqual(partial.chunks, ['Да, один человек пострадал.']);
  const rest = takeSpeechChunks(
    'Да, один человек пострадал. Он в сознании.',
    partial.spoken,
    true,
  );
  assert.deepEqual(rest.chunks, ['Он в сознании.']);
  const again = takeSpeechChunks(
    'Да, один человек пострадал. Он в сознании.',
    rest.spoken,
    true,
  );
  assert.deepEqual(again.chunks, []);
  const replaced = takeSpeechChunks('Хорошо, жду.', partial.spoken, true);
  assert.deepEqual(replaced.chunks, ['Хорошо, жду.']);
  assert.ok(replaced.spoken.includes('пострадал'));
  assert.ok(replaced.spoken.includes('Хорошо, жду.'));
  const repeated = takeSpeechChunks('Хорошо, жду.', replaced.spoken, true);
  assert.deepEqual(repeated.chunks, []);
});

function mockSession() {
  const enqueued: string[] = [];
  let stopped = 0;
  let busy = false;
  let failAt = -1;
  let clock = 0;
  const session = createAiSpeechSession({
    enqueue: async (text) => {
      enqueued.push(text);
      if (enqueued.length === failAt) {
        throw new Error('tts chunk failed');
      }
    },
    waitQueue: async () => {
      clock += 1;
    },
    stop: () => {
      stopped += 1;
      busy = false;
    },
    isBusy: () => busy,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    watchdogMs: 40,
  });
  return {
    session,
    enqueued,
    get stopped() {
      return stopped;
    },
    setBusy(value: boolean) {
      busy = value;
    },
    failOn(index: number) {
      failAt = index;
    },
  };
}

test('A: one-sentence response starts TTS before a duplicated final path', async () => {
  const mock = mockSession();
  mock.session.beginTurn({ userFinalAt: 0 });
  mock.session.markLlmSent(5);
  const first = mock.session.ingestPartial('Да, один человек.');
  assert.deepEqual(first, ['Да, один человек.']);
  assert.deepEqual(mock.enqueued, ['Да, один человек.']);
  const tail = mock.session.ingestFinal('Да, один человек.');
  assert.deepEqual(tail, []);
  assert.deepEqual(mock.enqueued, ['Да, один человек.']);
});

test('B: two-sentence session enqueues first then second in order', () => {
  const mock = mockSession();
  mock.session.beginTurn();
  mock.session.ingestPartial('Да, один человек пострадал.');
  mock.session.ingestFinal('Да, один человек пострадал. Он в сознании.');
  assert.deepEqual(mock.enqueued, ['Да, один человек пострадал.', 'Он в сознании.']);
});

test('E: LLM failure after first spoken chunk still ends the turn', async () => {
  const mock = mockSession();
  mock.session.beginTurn();
  mock.session.ingestPartial('Да, один человек пострадал.');
  mock.session.failGeneration();
  await mock.session.waitForTurnEnd();
  assert.equal(mock.session.isGenerationOpen(), false);
  assert.equal(mock.session.isCancelled(), false);
  assert.deepEqual(mock.enqueued, ['Да, один человек пострадал.']);
});

test('F: second TTS chunk failure still lets the session finish (mic can recover)', async () => {
  const mock = mockSession();
  mock.failOn(2);
  mock.session.beginTurn();
  mock.session.ingestFinal('Да, один человек пострадал. Он в сознании.');
  await mock.session.waitForTurnEnd();
  assert.equal(mock.session.isGenerationOpen(), false);
  assert.equal(mock.enqueued.length, 2);
});

test('G: call end during playback stops audio', async () => {
  const mock = mockSession();
  mock.setBusy(true);
  mock.session.beginTurn();
  mock.session.ingestPartial('Помогите, пожалуйста.');
  mock.session.cancel();
  await mock.session.waitForTurnEnd();
  assert.ok(mock.stopped >= 1);
  assert.equal(mock.session.isCancelled(), true);
});

test('H: next call has no stale spoken/audio state', () => {
  const mock = mockSession();
  mock.session.beginTurn();
  mock.session.ingestFinal('Первый вызов.');
  assert.equal(mock.session.getSpoken().includes('Первый'), true);
  mock.session.resetForNewCall();
  assert.equal(mock.session.getSpoken(), '');
  assert.equal(mock.session.isCancelled(), false);
  mock.enqueued.length = 0;
  mock.session.beginTurn();
  mock.session.ingestFinal('Новый вызов.');
  assert.deepEqual(mock.enqueued, ['Новый вызов.']);
});

test('latency log is compact and has no secret-looking fields', () => {
  const line = formatCallLatency({
    userFinalAt: 100,
    llmSentAt: 150,
    firstPartialAt: 400,
    firstSentenceAt: 420,
    ttsRequestAt: 430,
    ttsFirstByteAt: 700,
    ttsDecodedAt: 740,
    ttsPlaybackAt: 760,
  });
  assert.match(line, /^\[VOICE LATENCY\]/);
  assert.match(line, /flush=50/);
  assert.match(line, /llm_ttft=300/);
  assert.match(line, /safe_phrase=320/);
  assert.match(line, /operator_to_audio=660/);
  assert.doesNotMatch(line, /api[_-]?key/i);
  assert.doesNotMatch(line, /token=/i);
});

test('A: Да. reaches TTS without a length gate', () => {
  const mock = mockSession();
  mock.session.beginTurn();
  mock.session.ingestFinal('Да.');
  assert.deepEqual(mock.enqueued, ['Да.']);
});

test('C: first sentence can start while the second is still incomplete', () => {
  const mock = mockSession();
  mock.session.beginTurn();
  assert.deepEqual(mock.session.ingestPartial('Да, ребёнок. Ему тяжело'), ['Да, ребёнок.']);
  assert.deepEqual(mock.session.ingestFinal('Да, ребёнок. Ему тяжело дышать.'), ['Ему тяжело дышать.']);
  assert.deepEqual(mock.enqueued, ['Да, ребёнок.', 'Ему тяжело дышать.']);
});

test('D: partial plus identical final does not duplicate audio', () => {
  const mock = mockSession();
  mock.session.beginTurn();
  mock.session.ingestPartial('Да, ребёнок.');
  mock.session.ingestFinal('Да, ребёнок. Ему тяжело дышать.');
  assert.deepEqual(mock.enqueued, ['Да, ребёнок.', 'Ему тяжело дышать.']);
});

test('H: cancel during generation ignores later ingest', () => {
  const mock = mockSession();
  mock.session.beginTurn();
  mock.session.cancel();
  assert.deepEqual(mock.session.ingestPartial('Да, ребёнок.'), []);
  assert.deepEqual(mock.session.ingestFinal('Да, ребёнок. Ему тяжело дышать.'), []);
  assert.deepEqual(mock.enqueued, []);
});

test('J: new call after cancel has a clean spoken cursor', () => {
  const mock = mockSession();
  mock.session.beginTurn();
  mock.session.ingestPartial('Да, ребёнок.');
  mock.session.cancel();
  mock.session.resetForNewCall();
  mock.enqueued.length = 0;
  mock.session.beginTurn();
  mock.session.ingestFinal('Назовите адрес.');
  assert.deepEqual(mock.enqueued, ['Назовите адрес.']);
});
