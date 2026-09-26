import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tts = readFileSync(join(root, 'src/lib/tts-player.ts'), 'utf8');

test('F: TTS consume starts immediately, playback stays ordered', () => {
  assert.match(tts, /const consume = consumeTtsResponse/);
  assert.match(tts, /await playGate\(gate, token, hooks, trimmed[,)]/);
  assert.match(tts, /onChunkPlaybackStart/);
  assert.match(tts, /onPlaybackCancelled/);
  assert.match(tts, /scheduleAudible/);
  assert.match(tts, /contextOutputDelay/);
  assert.match(tts, /complete: true/);
  assert.match(tts, /source\.start\(when\)/);
  assert.match(tts, /nextStart = when \+ duration/);
  assert.doesNotMatch(tts, /const pending = fetchTtsResponse[\s\S]*playChain\.then\(async \(\) => \{[\s\S]*const response = await pending/);
});

test('I: stopTtsAudio aborts in-flight Fish work', () => {
  assert.match(tts, /export function stopTtsAudio/);
  assert.match(tts, /abortControllers/);
  assert.match(tts, /playToken \+= 1/);
  assert.match(tts, /abort\.abort\(\)/);
  const stop = tts.slice(tts.indexOf('export function stopTtsAudio'), tts.indexOf('async function fetchTtsResponse'));
  assert.doesNotMatch(stop, /fetchInFlight = 0/);
  assert.match(tts, /createStallWatch/);
});

test('playback timeline is reserved on one lock after resume', () => {
  const body = tts.slice(tts.indexOf('async function reserveSlot'), tts.indexOf('async function playBuffer'));
  const resume = body.indexOf('await ctx.resume()');
  const reserve = body.indexOf('nextStart = when + duration');
  assert.ok(resume > 0);
  assert.ok(reserve > resume);
  assert.match(tts, /reserveLock = Promise\.resolve\(\)/);
});

test('captions follow audible start and never gate source.start', () => {
  const body = tts.slice(tts.indexOf('async function playBuffer'), tts.indexOf('async function playBlob'));
  assert.ok(body.indexOf('source.start(when)') > 0);
  assert.ok(body.indexOf('source.start(when)') < body.indexOf('scheduleAudible'));
  assert.match(body, /onFirstPlayback/);
  assert.match(tts, /onFirstAudible/);
  assert.match(tts, /first\?\.onFirstAudible/);
  assert.doesNotMatch(body, /await .*startChunk/);
});
