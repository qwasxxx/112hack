import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  commitSpokenCaption,
  createSpokenTranscript,
  estimateSpeechDurationMs,
  isShortSpokenUtterance,
  joinSpokenWords,
  revealedWordCount,
  splitSpokenWords,
  upsertSpokenCaption,
  type SpokenCaptionLine,
  type SpokenCaptionState,
} from '../src/lib/spoken-transcript.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fakeClock() {
  let now = 0;
  const pending: Array<{ id: number; fn: () => void }> = [];
  let nextId = 1;
  return {
    now: () => now,
    raf: (fn: () => void) => {
      const id = nextId;
      nextId += 1;
      pending.push({ id, fn });
      return id;
    },
    caf: (id: number) => {
      const index = pending.findIndex((item) => item.id === id);
      if (index >= 0) {
        pending.splice(index, 1);
      }
    },
    advance(ms: number) {
      now += ms;
      const jobs = pending.splice(0);
      for (const job of jobs) {
        job.fn();
      }
    },
  };
}

test('words keep punctuation attached', () => {
  assert.deepEqual(splitSpokenWords('Алло, здесь пожар, помогите!'), [
    'Алло,',
    'здесь',
    'пожар,',
    'помогите!',
  ]);
  assert.equal(joinSpokenWords(splitSpokenWords('пожар, помогите!'), 2), 'пожар, помогите!');
});

test('word reveal is duration-aware and starts with the first word', () => {
  const words = splitSpokenWords('Алло, здесь пожар, помогите!');
  assert.equal(revealedWordCount(words, 1000, 0), 1);
  assert.equal(joinSpokenWords(words, 1), 'Алло,');
  assert.equal(joinSpokenWords(words, 2), 'Алло, здесь');
  assert.equal(joinSpokenWords(words, 3), 'Алло, здесь пожар,');
  assert.equal(joinSpokenWords(words, 4), 'Алло, здесь пожар, помогите!');
  assert.equal(revealedWordCount(words, 1000, 1000), 4);
  assert.ok(revealedWordCount(words, 1000, 400) < 4);
  assert.ok(revealedWordCount(words, 1000, 400) >= 1);
});

test('A: assistant final exists before playback → full text is not visible', () => {
  const clock = fakeClock();
  let last: SpokenCaptionState | undefined;
  const spoken = createSpokenTranscript({
    now: clock.now,
    raf: clock.raf,
    caf: clock.caf,
    onChange: (state) => {
      last = state;
    },
  });
  spoken.beginTurn();
  const lines: SpokenCaptionLine[] = [];
  const painted = upsertSpokenCaption(lines, 'caller', spoken.getVisibleText(), spoken.isSpeaking());
  assert.equal(painted.length, 0);
  assert.equal(spoken.getVisibleText(), '');
  assert.equal(last?.visibleText ?? '', '');
});

test('B: playback start → text begins appearing', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  spoken.startChunk('Автомобиль упал в воду.', 2000);
  assert.equal(spoken.getVisibleText(), 'Автомобиль');
  assert.equal(spoken.isSpeaking(), true);
});

test('C: mid-playback → only corresponding portion visible', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  const text = 'Автомобиль упал в воду внутри есть человек.';
  spoken.startChunk(text, 2000);
  clock.advance(400);
  const mid = spoken.getVisibleText();
  assert.ok(mid.startsWith('Автомобиль'));
  assert.notEqual(mid, text);
  assert.ok(mid.split(/\s+/).length < splitSpokenWords(text).length);
});

test('D: playback end → full spoken chunk visible', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  spoken.startChunk('Автомобиль упал в воду.', 2000);
  spoken.finishChunk();
  assert.equal(spoken.getVisibleText(), 'Автомобиль упал в воду.');
  assert.equal(spoken.isSpeaking(), false);
});

test('E: two TTS chunks → second text does not appear before second audio', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  spoken.startChunk('Горит контейнер.', 800);
  clock.advance(200);
  assert.equal(spoken.getVisibleText().includes('Пострадавших нет.'), false);
  spoken.finishChunk();
  assert.equal(spoken.getVisibleText(), 'Горит контейнер.');
  spoken.startChunk('Пострадавших нет.', 800);
  assert.match(spoken.getVisibleText(), /^Горит контейнер\./);
  assert.ok(spoken.getVisibleText().startsWith('Горит контейнер.'));
  assert.notEqual(spoken.getVisibleText(), 'Горит контейнер. Пострадавших нет.');
});

test('F: one AI turn with two chunks → one coherent caller message', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  spoken.startChunk('Горит контейнер.', 600);
  spoken.finishChunk();
  spoken.startChunk('Пострадавших нет.', 600);
  spoken.finishChunk();
  let lines = upsertSpokenCaption([], 'caller', spoken.getVisibleText(), spoken.isSpeaking());
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.id, 'llm-spoken');
  assert.equal(lines[0]?.text, 'Горит контейнер. Пострадавших нет.');
  lines = commitSpokenCaption(lines);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.live, false);
  assert.equal(lines[0]?.text, 'Горит контейнер. Пострадавших нет.');
});

test('G: Да. appears immediately with short playback', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  assert.equal(isShortSpokenUtterance(splitSpokenWords('Да.')), true);
  spoken.startChunk('Да.', 240);
  assert.equal(spoken.getVisibleText(), 'Да.');
  spoken.startChunk('Не знаю.', 300);
  assert.equal(spoken.getVisibleText().endsWith('Не знаю.'), true);
});

test('H: call cancelled → animation stops', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  spoken.startChunk('Алло, здесь пожар, помогите!', 2000);
  const before = spoken.getVisibleText();
  spoken.cancel();
  clock.advance(1500);
  assert.equal(spoken.getVisibleText(), before);
  assert.equal(spoken.isCancelled(), true);
  spoken.startChunk('Не должно появиться.', 500);
  assert.equal(spoken.getVisibleText(), before);
});

test('I: new call → old reveal cannot update it', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  const previous = spoken.beginTurn();
  spoken.startChunk('Первый вызов.', 800, previous);
  spoken.finishChunk(previous);
  const next = spoken.reset();
  assert.notEqual(next, previous);
  assert.equal(spoken.getVisibleText(), '');
  spoken.startChunk('Утечка с прошлого вызова.', 800, previous);
  assert.equal(spoken.getVisibleText(), '');
  spoken.startChunk('Новый вызов.', 800, next);
  assert.equal(spoken.getVisibleText().includes('Первый'), false);
  assert.equal(spoken.getVisibleText().includes('Утечка'), false);
  assert.match(spoken.getVisibleText(), /Новый/);
});

test('J: TTS fails before start → unsaid text not animated', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  const lines = upsertSpokenCaption([], 'caller', spoken.getVisibleText(), false);
  assert.equal(lines.some((line) => line.text.includes('Ему тяжело дышать.')), false);
  spoken.finishChunk();
  assert.equal(spoken.getVisibleText(), '');
});

test('K: ambience lifecycle is not bound to transcript rendering', () => {
  const page = readFileSync(join(root, 'src/pages/call-page.tsx'), 'utf8');
  const spoken = readFileSync(join(root, 'src/lib/spoken-transcript.ts'), 'utf8');
  const caption = page.slice(page.indexOf('function attachCaptionHooks'), page.indexOf('function commitSpokenLine'));
  assert.doesNotMatch(caption, /startCallAmbience|stopCallAmbience/);
  assert.doesNotMatch(spoken, /startCallAmbience|stopCallAmbience|ambience/i);
  assert.equal(page.split('startCallAmbience(').length - 1, 1);
  assert.match(page, /startCallAmbience\(ambienceProfileForIncident/);
});

test('short first audio buffer does not dump the full sentence', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  const text = 'Автомобиль упал в воду. Внутри есть человек.';
  spoken.startChunk(text, 80);
  clock.advance(80);
  assert.notEqual(spoken.getVisibleText(), text);
  assert.ok(spoken.getVisibleText().split(/\s+/).length < splitSpokenWords(text).length);
  spoken.setChunkDuration(2200, true);
  clock.advance(200);
  assert.notEqual(spoken.getVisibleText(), text);
});

test('Машина упала в воду. reveals by words against audio duration', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  const text = 'Машина упала в воду.';
  const words = splitSpokenWords(text);
  spoken.startChunk(text, 1600);
  spoken.setChunkDuration(1600, true);
  assert.equal(spoken.getVisibleText(), 'Машина');
  clock.advance(420);
  assert.equal(spoken.getVisibleText(), joinSpokenWords(words, revealedWordCount(words, 1600, 420)));
  assert.ok(spoken.getVisibleText().startsWith('Машина'));
  assert.notEqual(spoken.getVisibleText(), text);
  clock.advance(1180);
  assert.equal(spoken.getVisibleText(), text);
});

test('estimated pace does not dump the last word before audio completes', () => {
  const clock = fakeClock();
  const spoken = createSpokenTranscript({ now: clock.now, raf: clock.raf, caf: clock.caf });
  spoken.beginTurn();
  const text = 'Машина упала в воду.';
  spoken.startChunk(text, 80);
  clock.advance(estimateSpeechDurationMs(splitSpokenWords(text)) + 80);
  assert.notEqual(spoken.getVisibleText(), text);
  assert.ok(spoken.getVisibleText().startsWith('Машина'));
  spoken.setChunkDuration(2400, true);
  clock.advance(120);
  assert.notEqual(spoken.getVisibleText(), text);
  spoken.finishChunk();
  assert.equal(spoken.getVisibleText(), text);
});

test('commit keeps revealed caption and clears live speaking state', () => {
  const live = upsertSpokenCaption([], 'caller', 'Да,', true);
  assert.equal(live[0]?.live, true);
  assert.equal(live[0]?.speaking, true);
  const committed = commitSpokenCaption(live);
  assert.equal(committed[0]?.live, false);
  assert.equal(committed[0]?.speaking, false);
  assert.equal(committed[0]?.text, 'Да,');
  assert.notEqual(committed[0]?.id, 'llm-spoken');
  const next = upsertSpokenCaption(committed, 'caller', 'Ему', true);
  const ids = next.map((line) => line.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('estimate is longer for longer Russian phrases', () => {
  const short = estimateSpeechDurationMs(splitSpokenWords('Да.'));
  const long = estimateSpeechDurationMs(splitSpokenWords('Автомобиль упал в воду. Внутри есть человек.'));
  assert.ok(long > short);
  assert.ok(long > 800);
});

test('call-page does not paint assistant text before playback hooks', () => {
  const page = readFileSync(join(root, 'src/pages/call-page.tsx'), 'utf8');
  assert.doesNotMatch(page, /upsertLive\(current, aiRole, event\.text/);
  assert.doesNotMatch(page, /commitLive\(current, aiRole, event\.text/);
  assert.match(page, /ingestPartial\(event\.text\)/);
  assert.match(page, /ingestFinal\(event\.text\)/);
  assert.match(page, /onChunkPlaybackStart/);
  assert.match(page, /startChunk\(info\.text, info\.durationMs, generation\)/);
  assert.match(page, /line-speaking/);
  assert.match(page, /line-speak-pulse/);
});
