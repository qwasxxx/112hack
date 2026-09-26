import assert from 'node:assert/strict';
import test from 'node:test';

import type { TrainingScenario } from '../src/data/scenarios.ts';
import { createEmptyIncidentCard } from '../src/features/arm112-simulator/model/factories.ts';
import type { Arm112PracticalResult } from '../src/features/arm112-simulator/model/training-result.ts';
import { addressOverlap } from '../src/progress/address-match.ts';
import { scoreDdsCard } from '../src/progress/score-dds.ts';
import { scoreCard50 } from '../src/progress/score-card.ts';
import { incidentEssence } from '../src/progress/ticket-parse.ts';

const FOREST =
  'Владимирская обл, Кольчугинский район, дер. Барыкино (при уточнении адреса дер Барыкино, не доезжая пос. Бавлены), лес за деревней.';
const SAID = 'я нахожусь в лесу за деревней Барыкино, не доезжая поселка Бавлены.';

test('spoken forest place matches the ticket without the region', () => {
  const overlap = addressOverlap(FOREST, SAID);
  assert.equal(overlap.ratio, 1);
  assert.equal(overlap.missing.some((token) => /барыкин|бавлен|лес/.test(token)), false);
});

test('what happened keeps the event and drops ticket notes', () => {
  const essence = incidentEssence(
    'Женщина собирала грибы, заблудилась. , 63 г, зарядка 10% на телефоне, 03 не треб. Звонит сама,',
  );
  assert.match(essence, /грибы/);
  assert.match(essence, /заблудилась/);
  assert.doesNotMatch(essence, /зарядка|63|треб/);
});

test('card with the spoken place, the event, and 102 gets address, story, and police', () => {
  const card = createEmptyIncidentCard();
  card.address.descriptiveAddress = SAID;
  card.descriptionFromCaller = 'женщина собирала грибы, заблудилась';
  card.caller.familyNameAndGivenName = 'Тимофеева Маргарита';
  card.injured = { hasInjured: false, count: 0 };
  card.classification.classifier.matchedNumbers = ['102'];
  card.classification.selectedTypes = ['102'];
  const result = {
    card,
    classifier: {
      selectedTypes: ['102'],
      groupCode: null,
      priznak1: null,
      priznak2: [],
      priznak3: [],
      extraTags: [],
      matched: [],
      expected: { number: '17020103', finalType: 'Поиск в лесу', groupCode: '', priznak1: '' },
    },
    services: [],
  } as unknown as Arm112PracticalResult;
  const scenario = {
    id: 'ags-11-3',
    situation:
      'Женщина собирала грибы, заблудилась. Тимофеева Маргарита Михайловна, 63 г, зарядка 10% на телефоне, 03 не треб. Звонит сама, 916 896 3254',
    address: FOREST,
    services: ['police'],
  } as TrainingScenario;
  const scored = scoreCard50(result, scenario);
  const byId = Object.fromEntries(scored.checks.map((item) => [item.id, item]));
  assert.equal(byId.address.points, byId.address.max);
  assert.equal(byId.address.state, 'match');
  assert.equal(byId.what.points, byId.what.max);
  assert.equal(byId.what.state, 'match');
  assert.equal(byId.services.points, byId.services.max);
  assert.match(byId.services.got, /102/);
  assert.equal(byId.classifier.points, 3);
  assert.equal(byId.classifier.state, 'partial');
});

test('skipping the service call costs most of the DDS score', () => {
  const facts = {
    callerName: 'Тимофеева Маргарита',
    callerPhone: '9168963254',
    address: 'Барыкино',
    description: 'заблудилась',
    injured: 'Нет',
    services: ['police' as const],
  };
  const draft = { ...facts, services: ['police' as const] };
  const scenario = { id: 'b72', code: 'Б7.2' } as TrainingScenario;
  const base = {
    scenario,
    draft,
    facts,
    role: 'own' as const,
    decision: 'dispatch' as const,
    elapsedMs: 20_000,
    naryad: '12',
    workplaceStatus: 'Работы завершены',
  };
  const silent = scoreDdsCard(base);
  assert.equal(silent.parts.call, 0);
  assert.ok(silent.points < 70);
  const called = scoreDdsCard({
    ...base,
    contacts: [{ service: 'Служба 102', said: 'направьте наряд в лес за Барыкино' }],
  });
  assert.equal(called.parts.call, 55);
  assert.ok(called.points - silent.points >= 40);
});
