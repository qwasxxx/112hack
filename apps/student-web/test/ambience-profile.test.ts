import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ambienceProfileForIncident,
  ambienceTypeForIncident,
  effectiveAmbienceGain,
  hashSeed,
  profileForType,
} from '../src/lib/ambience-profile.ts';

test('A: fire scenario maps to FIRE ambience profile', () => {
  const source = {
    id: 'fire-1',
    situation: 'Возгорание мусорного контейнера, пострадавших нет',
    address: 'Москва, Депо, около ст. Москва-Пассажирская Киевская',
  };
  const profile = ambienceProfileForIncident('fire', source);
  assert.equal(ambienceTypeForIncident('fire', source), 'FIRE');
  assert.equal(profile.type, 'FIRE');
  assert.ok(profile.gain > 0.12 && profile.gain < 0.22);
  assert.ok(profile.layers.some((layer) => layer.kind === 'fire_crackle'));
  assert.ok(profile.layers.some((layer) => layer.kind === 'crowd' && layer.gain < 0.4));
  assert.ok(profile.layers.some((layer) => layer.kind === 'siren_distant' && layer.gain < 0.22));
  assert.ok(profile.assetUrl?.includes('fire_loop'));
  const otherVoices = profile.layers.find((layer) => layer.id === 'voices');
  assert.ok(otherVoices);
  assert.equal(otherVoices?.kind, 'bystander');
  assert.equal(otherVoices?.gain, 0.496);
});

test('ticket 1.1 fire adds real bystander voices behind the caller', () => {
  const source = {
    id: 'ags-01-1',
    ticketNo: 1,
    situationNo: 1,
    situation: 'Возгорание мусорного контейнера, пострадавших нет',
    address: 'Москва, Депо, около ст. Москва-Пассажирская Киевская',
  };
  const profile = ambienceProfileForIncident('fire', source);
  assert.equal(profile.type, 'FIRE');
  const voices = profile.layers.find((layer) => layer.id === 'voices');
  assert.ok(voices);
  assert.equal(voices?.kind, 'bystander');
  assert.ok(voices?.assetUrl?.includes('fire_voices_loop'));
  assert.ok(voices && voices.gain === 0.62);
});

test('B: traffic accident maps to TRAFFIC_ACCIDENT ambience profile', () => {
  const source = {
    id: 'dtp-1',
    situation: 'ДТП, Б/П, Б/Р, пежо + фольксваген',
    address: 'Москва, МКАД, от Варшавского шоссе в сторону Каширского',
  };
  const profile = ambienceProfileForIncident('traffic_accident', source);
  assert.equal(profile.type, 'TRAFFIC_ACCIDENT');
  assert.ok(profile.layers.some((layer) => layer.kind === 'traffic_road'));
  assert.ok(profile.layers.some((layer) => layer.kind === 'impact' && !layer.loop));
  assert.ok(profile.gain > 0.2 && profile.gain < 0.5);
  const trafficVoices = profile.layers.find((layer) => layer.id === 'voices');
  assert.equal(trafficVoices?.kind, 'bystander');
  assert.equal(trafficVoices?.gain, 0.496);
});

test('C: medical scenario does not use crash or fire ambience', () => {
  const indoor = {
    id: 'med-1',
    situation: 'Сильная головная, А/Д 150/80, вызывает себе',
    address: 'Рязань, дом 15 ч/дом',
  };
  const profile = ambienceProfileForIncident('medical', indoor);
  assert.equal(profile.type, 'MEDICAL');
  assert.notEqual(profile.type, 'FIRE');
  assert.notEqual(profile.type, 'TRAFFIC_ACCIDENT');
  assert.notEqual(profile.type, 'POLICE_OR_FIGHT');
  assert.ok(profile.layers.every((layer) => layer.kind === 'room' || layer.kind === 'street' || layer.kind === 'bystander'));
  assert.ok(profile.gain > 0.12 && profile.gain < 0.28);
  const medicalVoices = profile.layers.find((layer) => layer.id === 'voices');
  assert.equal(medicalVoices?.gain, 0.496);
});

test('remaining Wave 1 incident classes map to fitting ambience', () => {
  assert.equal(ambienceTypeForIncident('violence', { situation: 'Дерутся 10-15 человек' }), 'POLICE_OR_FIGHT');
  assert.equal(ambienceTypeForIncident('gas', { situation: 'В частном доме запах газа' }), 'GAS');
  assert.equal(ambienceTypeForIncident('infrastructure', { situation: 'Громко играет музыка во дворе' }), 'INFRASTRUCTURE');
  assert.equal(ambienceTypeForIncident('other', { situation: 'Женщина собирала грибы, заблудилась' }), 'GENERIC_EMERGENCY');
  assert.equal(profileForType('QUIET').type, 'QUIET');
  assert.ok(!profileForType('QUIET').layers.some((layer) => layer.id === 'voices'));
  assert.equal(profileForType('POLICE_OR_FIGHT').layers.find((layer) => layer.id === 'voices')?.gain, 0.496);
  assert.equal(ambienceTypeForIncident('other', { situation: 'Тонет человек в настоящее время' }), 'WATER_FLOOD');
  assert.equal(ambienceTypeForIncident('other', { situation: 'После взрыва в подъезде дым' }), 'EXPLOSION_AFTERMATH');
});

test('profile variation is deterministic and small', () => {
  const source = { id: 'seed-a', situation: 'Горит крыша частного дома, пострадавших нет' };
  const first = ambienceProfileForIncident('fire', source);
  const second = ambienceProfileForIncident('fire', source);
  assert.deepEqual(first, second);
  assert.equal(hashSeed('seed-a'), hashSeed('seed-a'));
  assert.ok(Math.abs(first.variation.gainScale - 1) <= 0.05);
  const ducked = effectiveAmbienceGain(first, true);
  const open = effectiveAmbienceGain(first, false);
  assert.ok(ducked > 0.015);
  assert.ok(ducked < open);
});
