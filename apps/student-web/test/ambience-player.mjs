import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

function rms(data) {
  if (!data.length) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

function createFakeContext(initialState = 'running') {
  const sources = [];
  const buffers = [];
  const listeners = new Map();
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: initialState,
    destination: {},
    async resume() {
      ctx.state = 'running';
      for (const fn of listeners.get('statechange') ?? []) {
        fn();
      }
    },
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((item) => item !== fn),
      );
    },
    createGain() {
      return {
        gain: {
          value: 0,
          cancelScheduledValues() {},
          setValueAtTime(value) {
            this.value = value;
          },
          linearRampToValueAtTime(value) {
            this.value = value;
          },
        },
        connect() {},
        disconnect() {},
      };
    },
    createBuffer(_channels, length, sampleRate) {
      const data = new Float32Array(length);
      const buffer = {
        duration: length / sampleRate,
        length,
        sampleRate,
        numberOfChannels: 1,
        getChannelData: () => data,
      };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const source = {
        started: 0,
        stopped: 0,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        connect() {},
        start() {
          this.started += 1;
        },
        stop() {
          this.stopped += 1;
        },
        disconnect() {},
      };
      sources.push(source);
      return source;
    },
    decodeAudioData() {
      return Promise.reject(new Error('asset missing'));
    },
  };
  return { ctx, sources, buffers };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

try {
  const playerMod = await vite.ssrLoadModule('/src/lib/ambience-player.ts');
  const profileMod = await vite.ssrLoadModule('/src/lib/ambience-profile.ts');
  const { ambienceEngineState, configureAmbience, resetAmbienceForTests, startCallAmbience, stopCallAmbience } =
    playerMod;
  const { ambienceProfileForIncident, profileForType } = profileMod;

  function installHarness(fetchAsset, initialState = 'running') {
    const fake = createFakeContext(initialState);
    let voiceListener;
    configureAmbience({
      getContext: () => fake.ctx,
      fadeOutSec: 0,
      fetchAsset:
        fetchAsset ??
        (async () => {
          throw new Error('no asset');
        }),
      connectRecording() {},
      disconnectRecording() {},
      listenVoiceActivity(listener) {
        voiceListener = listener;
      },
    });
    return { fake, voice: () => voiceListener };
  }

  resetAmbienceForTests();
  let harness = installHarness();
  startCallAmbience(profileForType('FIRE', 1));
  await settle();
  let state = ambienceEngineState();
  assert.equal(state.startCount, 1, 'D: exactly one start');
  assert.equal(state.running, true, 'D: running');
  assert.equal(state.type, 'FIRE', 'D: fire type');
  assert.equal(state.instanceCount, 1, 'D: one ambience instance');
  assert.ok(state.sourceCount >= 1, 'D: at least one source');
  assert.equal(state.sourceCount, 4, 'D: fire scene has fire, people, siren, and voices');
  assert.equal(harness.fake.sources.filter((item) => item.started && !item.stopped).length, state.sourceCount);
  assert.ok(harness.fake.sources.some((item) => item.loop), 'D: loop started');
  const fireBuffer = harness.fake.buffers.find((item) => rms(item.getChannelData(0)) > 0.03);
  assert.ok(fireBuffer, 'fire procedural buffer is audible');
  assert.ok(rms(fireBuffer.getChannelData(0)) > 0.03, 'fire RMS is not near silence');

  const before = ambienceEngineState();
  harness.voice()?.(true);
  harness.voice()?.(true);
  harness.voice()?.(false);
  harness.voice()?.(true);
  const after = ambienceEngineState();
  assert.equal(before.startCount, 1, 'E: startCount unchanged');
  assert.equal(after.startCount, 1, 'E: TTS chunks do not restart');
  assert.equal(after.generation, before.generation, 'E: same generation');
  assert.equal(after.instanceCount, 1, 'E: still one instance');

  stopCallAmbience();
  state = ambienceEngineState();
  assert.equal(state.running, false, 'F: stopped');
  assert.equal(state.sourceCount, 0, 'F: no sources');
  assert.ok(harness.fake.sources.every((item) => item.stopped >= 1), 'F: sources stopped');

  resetAmbienceForTests();
  harness = installHarness();
  startCallAmbience(profileForType('FIRE', 4));
  await settle();
  const firstGen = ambienceEngineState().generation;
  startCallAmbience(profileForType('TRAFFIC_ACCIDENT', 5));
  await settle();
  state = ambienceEngineState();
  assert.equal(state.startCount, 2, 'G: second call starts a new engine');
  assert.ok(state.generation > firstGen, 'G: generation advanced');
  assert.equal(state.type, 'TRAFFIC_ACCIDENT', 'G: new profile');
  assert.equal(state.instanceCount, 1, 'G: only the new instance remains');
  assert.equal(harness.fake.sources.filter((item) => item.started && item.stopped === 0).length, state.sourceCount);

  resetAmbienceForTests();
  installHarness(async () => {
    throw new Error('404');
  });
  startCallAmbience(ambienceProfileForIncident('fire', { situation: 'Горит крыша частного дома' }));
  await settle();
  state = ambienceEngineState();
  assert.equal(state.running, true, 'H: fallback still runs');
  assert.equal(state.type, 'FIRE', 'H: fire fallback');
  assert.ok(state.sourceCount >= 1, 'H: source exists after asset failure');

  resetAmbienceForTests();
  harness = installHarness(async () => {
    throw new Error('blocked');
  }, 'suspended');
  startCallAmbience(profileForType('FIRE', 2));
  await settle();
  assert.equal(harness.fake.ctx.state, 'running', 'I: AudioContext resumed after start');
  state = ambienceEngineState();
  assert.equal(state.running, true, 'I: runs after resume');
  assert.ok(state.sourceCount >= 1, 'I: sources start after resume');

  const page = readFileSync(path.join(root, 'src/pages/call-page.tsx'), 'utf8');
  const tts = readFileSync(path.join(root, 'src/lib/tts-player.ts'), 'utf8');
  const profile = readFileSync(path.join(root, 'src/lib/ambience-profile.ts'), 'utf8');
  const ambience = readFileSync(path.join(root, 'src/lib/ambience-player.ts'), 'utf8');
  const pipeline = readFileSync(path.join(root, 'src/lib/speech-pipeline.ts'), 'utf8');
  assert.match(page, /if \(!armed\) \{[\s\S]*stopCallAmbience\(\)/, 'unmount stops ambience');
  assert.match(page, /stopTtsAudio\(\);\s*stopCallAmbience\(\)/, 'paired with TTS stop');
  assert.equal((page.match(/startCallAmbience\(/g) ?? []).length, 1, 'one start site');
  assert.match(page, /async function startCall[\s\S]*startCallAmbience/);
  assert.match(page, /async function hangup[\s\S]*stopCallAmbience/);
  assert.match(page, /classifyIncident\(props\.scenario\)/);
  assert.match(page, /frontend_handoff_ms/);
  assert.match(page, /seenFinalsRef\.current\.has\(last\.id\)/);
  assert.match(page, /repeatsSent\(text, lastSentRef\.current\)/);
  assert.doesNotMatch(page, /setTimeout\(flushUtterance,\s*1000\)/, 'J: no 1000ms flush');
  assert.match(pipeline, /USER_FLUSH_COALESCE_MS = 16/);
  assert.doesNotMatch(tts, /startCallAmbience/);
  assert.doesNotMatch(tts, /stopCallAmbience/);

  const fetchBody = tts.slice(tts.indexOf('body: JSON.stringify'), tts.indexOf('signal: abort.signal'));
  assert.doesNotMatch(fetchBody, /ambient_type/, 'no ambient_type on Fish request');
  assert.doesNotMatch(tts, /createBiquadFilter|createConvolver|telephone_effect|mixer\.py/);
  assert.match(tts, /source\.connect\(ctx\.destination\)/);
  assert.match(tts, /source\.connect\(callerPhoneInput\(ctx\)\)/, 'caller voice goes through phone line');
  const phone = readFileSync(path.join(root, 'src/lib/caller-phone-voice.ts'), 'utf8');
  assert.doesNotMatch(phone, /ambience|decodeAudioData|fetch\(/, 'phone line is playback-only and voice-only');
  assert.doesNotMatch(ambience, /callerPhoneInput|caller-phone-voice/, 'ambience bypasses phone line');
  assert.doesNotMatch(profile, /ttsVoice|voice_id|reference_id|FISH_/);
  assert.doesNotMatch(ambience, /source\.buffer = tts|mix\(.*voice|decodeAudioData\(voice/);
  const playBuffer = tts.slice(tts.indexOf('async function playBuffer'), tts.indexOf('async function playBlob'));
  assert.doesNotMatch(playBuffer, /ambience|createGain\(\)/, 'playBuffer does not mix ambience');
  assert.match(tts, /export async function playTtsAudio/);
  assert.match(tts, /export function enqueueTtsAudio/);
  assert.match(tts, /export function beginCallRecording/);

  resetAmbienceForTests();
  harness = installHarness();
  for (let i = 0; i < 20; i += 1) {
    startCallAmbience(profileForType(i % 2 === 0 ? 'FIRE' : 'MEDICAL', i + 1));
    await settle();
    stopCallAmbience();
    await settle();
  }
  state = ambienceEngineState();
  assert.equal(state.running, false, '20-call: stopped');
  assert.equal(state.sourceCount, 0, '20-call: no leftover sources');
  assert.equal(state.instanceCount, 0, '20-call: no leftover graphs');
  assert.ok(harness.fake.sources.every((item) => item.stopped >= 1), '20-call: every source stopped');
} finally {
  await vite.close();
}

console.log('ambience-player lifecycle ok');
