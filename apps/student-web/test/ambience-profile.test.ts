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
  assert.ok(!profile.layers.some((layer) => layer.kind === 'crowd'));
  assert.ok(profile.layers.some((layer) => layer.kind === 'siren_distant' && layer.gain < 0.22));
  assert.ok(profile.assetUrl?.includes('fire_loop'));
  assert.equal(profile.layers.find((layer) => layer.id === 'voices'), undefined);
});

test('ticket 1.1 bin fire stays without screaming', () => {
  const source = {
    id: 'ags-01-1',
    ticketNo: 1,
    situationNo: 1,
    situation: 'Возгорание мусорного контейнера, пострадавших нет',
    address: 'Москва, Депо, около ст. Москва-Пассажирская Киевская',
  };
  const profile = ambienceProfileForIncident('fire', source);
  assert.equal(profile.type, 'FIRE');
  assert.equal(profile.layers.find((layer) => layer.id === 'voices'), undefined);
});

test('screaming stays only for a fire or a mass crash with victims', () => {
  const houseFire = ambienceProfileForIncident('fire', {
    id: 'fire-victims',
    situation: 'Пожар в квартире, люди внутри, есть пострадавшие',
    address: 'Москва, ул. Лесная, д. 4',
  });
  const houseVoices = houseFire.layers.find((layer) => layer.id === 'voices');
  assert.equal(houseVoices?.kind, 'bystander');
  assert.ok(houseVoices?.assetUrl?.includes('fire_voices_loop'));
  assert.equal(houseVoices?.gain, 0.42);

  const oneCar = ambienceProfileForIncident('traffic_accident', {
    id: 'dtp-one',
    situation: 'ДТП, один пострадавший, пежо',
    address: 'Москва, МКАД',
  });
  assert.equal(oneCar.layers.find((layer) => layer.id === 'voices'), undefined);

  const mass = ambienceProfileForIncident('traffic_accident', {
    id: 'dtp-mass',
    situation: 'Массовое ДТП, автобус и несколько машин, есть пострадавшие, люди кричат',
    address: 'Москва, МКАД',
  });
  assert.equal(mass.layers.find((layer) => layer.id === 'voices')?.gain, 0.42);
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
  assert.equal(profile.layers.find((layer) => layer.id === 'voices'), undefined);
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
  assert.ok(profile.layers.every((layer) => layer.kind === 'room' || layer.kind === 'street'));
  assert.ok(profile.gain > 0.12 && profile.gain < 0.28);
  assert.equal(profile.layers.find((layer) => layer.id === 'voices'), undefined);
});

test('remaining Wave 1 incident classes map to fitting ambience', () => {
  assert.equal(ambienceTypeForIncident('violence', { situation: 'Дерутся 10-15 человек' }), 'POLICE_OR_FIGHT');
  assert.equal(ambienceTypeForIncident('gas', { situation: 'В частном доме запах газа' }), 'GAS');
  assert.equal(ambienceTypeForIncident('infrastructure', { situation: 'Громко играет музыка во дворе' }), 'INFRASTRUCTURE');
  assert.equal(ambienceTypeForIncident('other', { situation: 'Женщина собирала грибы, заблудилась' }), 'GENERIC_EMERGENCY');
  assert.equal(profileForType('QUIET').type, 'QUIET');
  assert.ok(!profileForType('QUIET').layers.some((layer) => layer.id === 'voices'));
  assert.equal(profileForType('POLICE_OR_FIGHT').layers.find((layer) => layer.id === 'voices'), undefined);
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
