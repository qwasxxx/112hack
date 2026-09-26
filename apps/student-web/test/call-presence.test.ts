import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FIRST_SILENCE_MS,
  HOLD_SILENCE_MS,
  MAX_PROBES,
  SECOND_SILENCE_MS,
  holdRequested,
  operatorMayEndCall,
  presenceDecision,
  soundsLikeFarewell,
  type PresenceSnapshot,
} from '../src/lib/call-presence.ts';

function snap(patch: Partial<PresenceSnapshot> = {}): PresenceSnapshot {
  return {
    now: 100_000,
    callActive: true,
    userBusy: false,
    lastHumanAt: 100_000 - FIRST_SILENCE_MS,
    probes: 0,
    probeAudioEndedAt: null,
    hold: false,
    closeArmed: false,
    farewellAudioReady: false,
    operatorText: '',
    assistantText: '',
    role: 'victim',
    askedStay: false,
    ...patch,
  };
}

test('no probe while the user, model, or audio is busy', () => {
  assert.equal(presenceDecision(snap({ userBusy: true })).kind, 'idle');
  assert.equal(presenceDecision(snap({ callActive: false })).kind, 'idle');
  assert.equal(presenceDecision(snap({ now: FIRST_SILENCE_MS - 1, lastHumanAt: 0 })).kind, 'idle');
});

test('first probe waits about 11 seconds and a hold waits longer', () => {
  const first = presenceDecision(snap());
  assert.equal(first.kind, 'probe');
  if (first.kind === 'probe') {
    assert.equal(first.intent, 'hear');
  }
  assert.equal(
    presenceDecision(snap({ hold: true, now: HOLD_SILENCE_MS - 1, lastHumanAt: 0 })).kind,
    'idle',
  );
  const held = presenceDecision(snap({ hold: true, operatorText: 'Подождите', now: HOLD_SILENCE_MS, lastHumanAt: 0 }));
  assert.equal(held.kind, 'probe');
  if (held.kind === 'probe') {
    assert.equal(held.intent, 'wait');
  }
});

test('second probe waits after the first playback and then stops', () => {
  const early = presenceDecision(snap({ probes: 1, probeAudioEndedAt: 100_000 - SECOND_SILENCE_MS + 1 }));
  assert.equal(early.kind, 'idle');
  const second = presenceDecision(snap({ probes: 1, probeAudioEndedAt: 100_000 - SECOND_SILENCE_MS }));
  assert.equal(second.kind, 'probe');
  assert.equal(presenceDecision(snap({ probes: MAX_PROBES })).kind, 'idle');
});

test('thanks is not a hangup, stay-on-the-line is not an ending', () => {
  assert.equal(operatorMayEndCall('Спасибо'), false);
  assert.equal(operatorMayEndCall('Хорошо'), false);
  assert.equal(operatorMayEndCall('Помощь едет'), false);
  assert.equal(holdRequested('Не кладите трубку'), true);
  assert.equal(operatorMayEndCall('Не кладите трубку, до свидания'), false);
  assert.equal(operatorMayEndCall('До свидания'), true);
  assert.equal(soundsLikeFarewell('До свидания, ждите.'), true);
  const stay = presenceDecision(snap({ operatorText: 'Спасибо' }));
  assert.equal(stay.kind, 'probe');
  if (stay.kind === 'probe') {
    assert.equal(stay.intent, 'stay');
  }
  assert.equal(presenceDecision(snap({ farewellAudioReady: true })).kind, 'hangup');
  assert.equal(presenceDecision(snap({ farewellAudioReady: true, userBusy: true })).kind, 'idle');
});

test('urgent and eta hints follow known facts', () => {
  const urgent = presenceDecision(snap({ assistantText: 'Тут пожар' }));
  assert.equal(urgent.kind, 'probe');
  if (urgent.kind === 'probe') {
    assert.equal(urgent.intent, 'urgent');
  }
  const light = presenceDecision(snap({ assistantText: 'Горит уличное освещение' }));
  if (light.kind === 'probe') {
    assert.equal(light.intent, 'hear');
  }
  const eta = presenceDecision(snap({ operatorText: 'Бригада выехала' }));
  if (eta.kind === 'probe') {
    assert.equal(eta.intent, 'eta');
  }
  const timed = presenceDecision(snap({ operatorText: 'Бригада выехала, через 10 минут' }));
  if (timed.kind === 'probe') {
    assert.notEqual(timed.intent, 'eta');
  }
});
