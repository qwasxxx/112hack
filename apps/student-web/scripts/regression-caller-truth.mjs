import assert from 'node:assert/strict';
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

function wordCount(opening) {
  return opening
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function assertNoFabrication(truth, situation, address) {
  const blob = `${situation} ${address}`;
  if (truth.callerPhone) {
    assert.ok(blob.replace(/\D/g, '').includes(truth.callerPhone), `phone must come from ticket: ${truth.scenarioId}`);
    assert.notEqual(truth.callerPhone.startsWith('7999') && truth.callerPhone.length === 11, true);
  }
  if (truth.callerName) {
    assert.ok(situation.includes(truth.callerName), `caller name must come from ticket: ${truth.scenarioId}`);
  }
  if (truth.injuredIdentity) {
    assert.ok(situation.includes(truth.injuredIdentity), `injured name must come from ticket: ${truth.scenarioId}`);
  }
  if (truth.vehicle) {
    assert.ok(situation.toLowerCase().includes(truth.vehicle.toLowerCase().slice(0, 8)), `vehicle must come from ticket: ${truth.scenarioId}`);
  }
  if (truth.floor) {
    assert.ok(`${situation} ${address}`.includes(truth.floor), `floor must come from ticket: ${truth.scenarioId}`);
  }
  if (truth.entrance) {
    assert.ok(address.includes(truth.entrance), `entrance must come from ticket: ${truth.scenarioId}`);
  }
}

function assertOpeningSafe(scenario, truth) {
  const opening = scenario.callerOpening;
  assert.ok(opening && opening.length >= 8, `opening missing: ${scenario.id}`);
  assert.ok(opening.length <= 72, `opening too long: ${scenario.id} «${opening}»`);
  const words = wordCount(opening);
  // Anlam esas: eski 2–8 kelime tavanı doğal açılışı kesmesin.
  assert.ok(words >= 2 && words <= 12, `opening word count ${words}: ${scenario.id} «${opening}»`);
  assert.match(opening, /^Алло,/);
  assert.doesNotMatch(opening, /пожарн(ые|ая)|скорая|полици|классификатор|\b10[1-4]\b/i);
  const phone = truth.callerPhone;
  if (phone && phone.length >= 6) {
    assert.ok(!opening.includes(phone), `opening leaks phone: ${scenario.id}`);
    assert.ok(!opening.replace(/\D/g, '').includes(phone.slice(-6)), `opening leaks phone digits: ${scenario.id}`);
  }
  if (truth.callerName) {
    const surname = truth.callerName.split(/\s+/)[0];
    if (surname && surname.length >= 4) {
      assert.ok(!opening.toLowerCase().includes(surname.toLowerCase()), `opening leaks FIO: ${scenario.id}`);
    }
  }
  assert.equal(
    truthMod.openingLeaksAddress(opening, scenario.address),
    false,
    `opening leaks address: ${scenario.id} «${opening}» / ${scenario.address}`,
  );
}

let truthMod;
try {
  const ticketsMod = await vite.ssrLoadModule('/src/data/ags-tickets.ts');
  truthMod = await vite.ssrLoadModule('/src/data/caller-truth.ts');
  const factsMod = await vite.ssrLoadModule('/src/progress/ticket-facts.ts');

  const { AGS_TICKETS, AGS_SCENARIOS, ticketToScenario, buildLessonSystemPrompt } = ticketsMod;
  const { callerTruthFrom, classifyIncident, openingWordCount, callerOpeningFrom, validateCallerTruth } = truthMod;
  const { ticketFactsFrom } = factsMod;

  assert.equal(AGS_TICKETS.length, 96, 'raw catalog must have 96 tickets');
  assert.equal(AGS_SCENARIOS.length, 96, 'runtime catalog must have 96 scenarios');

  const ids = new Set();
  for (const ticket of AGS_TICKETS) {
    const id = `ags-${String(ticket.ticket).padStart(2, '0')}-${ticket.n}`;
    const scenario = AGS_SCENARIOS.find((item) => item.id === id);
    assert.ok(scenario, `missing runtime scenario for ${id}`);
    assert.equal(scenario.ticketNo, ticket.ticket);
    assert.equal(scenario.situationNo, ticket.n);
    assert.equal(scenario.situation, ticket.situation);
    assert.equal(scenario.address, ticket.address);
    assert.ok(String(scenario.situation).trim().length > 0, `empty situation ${id}`);
    assert.ok(!ids.has(scenario.id), `duplicate id ${scenario.id}`);
    ids.add(scenario.id);

    const truth = callerTruthFrom(scenario);
    const facts = ticketFactsFrom(scenario);
    assert.equal(truth.scenarioId, scenario.id);
    assert.equal(truth.opening, scenario.callerOpening);
    assert.equal(truth.address, scenario.address);
    assert.equal(facts.phone, truth.callerPhone ?? '');
    assert.equal(facts.callerFio, truth.callerName ?? '');
    assert.equal(facts.injuredCount, truth.injuredCount);
    assert.equal(facts.hasInjured, truth.hasInjured);
    assert.equal(facts.what, truth.incident);
    assertOpeningSafe(scenario, truth);
    assertNoFabrication(truth, ticket.situation, ticket.address);
    assert.equal(openingWordCount(scenario.callerOpening), wordCount(scenario.callerOpening));
  }
  assert.equal(ids.size, 96);

  const representative = {
    fire: 'ags-01-1',
    traffic_accident: 'ags-25-2',
    medical: 'ags-04-2',
    violence: 'ags-01-2',
    gas: 'ags-31-3',
    water: 'ags-08-3',
    infrastructure: 'ags-32-3',
  };
  const expectedClass = {
    'ags-01-1': 'fire',
    'ags-25-2': 'traffic_accident',
    'ags-04-2': 'medical',
    'ags-01-2': 'violence',
    'ags-31-3': 'gas',
    'ags-08-3': 'water',
    'ags-32-3': 'infrastructure',
  };

  for (const [label, id] of Object.entries(representative)) {
    const scenario = AGS_SCENARIOS.find((item) => item.id === id);
    assert.ok(scenario, `representative ${label} missing`);
    const truth = callerTruthFrom(scenario);
    const classified = classifyIncident(scenario);
    assert.equal(classified.class, expectedClass[id], `${id} class`);
    assert.equal(truth.incidentClass, expectedClass[id]);
    assert.equal(scenario.id, id);
    assertOpeningSafe(scenario, truth);
    if (label === 'fire') {
      assert.match(scenario.callerOpening, /пожар|горит/i);
    }
    if (label === 'traffic_accident') {
      assert.match(scenario.callerOpening, /авари|дтп/i);
    }
    if (label === 'medical') {
      assert.match(scenario.callerOpening, /плохо|сознан|помощ/i);
    }
    if (label === 'violence') {
      assert.match(scenario.callerOpening, /драка|дерут/i);
    }
    if (label === 'gas') {
      assert.match(scenario.callerOpening, /газ/i);
    }
    if (label === 'water') {
      assert.match(scenario.callerOpening, /тонет|вод|льдин/i);
    }
    assert.ok(['calm', 'anxious', 'scared', 'panic'].includes(truth.emotion.stress), `${id} emotion`);
  }

  const missing = ticketToScenario({
    ticket: 90,
    n: 1,
    situation: 'Горит балкон, пострадавших нет',
    address: 'Москва',
  });
  const missingTruth = callerTruthFrom(missing);
  assert.equal(missingTruth.callerPhone, null);
  assert.equal(missingTruth.callerName, null);
  assert.ok(missingTruth.unknownFields.includes('callerPhone'));
  assert.ok(missingTruth.unknownFields.includes('callerName'));
  assert.equal(missingTruth.hasInjured, false);
  assert.equal(missingTruth.injuredCount, 0);
  assert.ok(missingTruth.facts);
  assert.equal(missingTruth.childInvolved, false);
  assert.ok(missingTruth.facts.askOnlyFacts.every((item) => item.topic !== 'caller_phone' || missingTruth.callerPhone));
  assert.doesNotMatch(missing.callerOpening, /Иван|999|дом 12|Москва/i);
  assert.equal(missing.id, 'ags-90-1');

  const lighting = AGS_SCENARIOS.find((item) => item.id === 'ags-32-3');
  assert.ok(lighting);
  const lightingTruth = callerTruthFrom(lighting);
  assert.equal(lightingTruth.incidentClass, 'infrastructure');
  assert.doesNotMatch(lighting.callerOpening, /пожар/i);

  const rebuilt = callerOpeningFrom({
    situation: lighting.situation,
    address: lighting.address,
    ticketNo: lighting.ticketNo,
    situationNo: lighting.situationNo,
    services: lighting.services,
  });
  assert.equal(rebuilt, lighting.callerOpening);

  const ADMIN_CRITICAL = new Set([
    'address',
    'caller_name',
    'caller_phone',
    'caller_role',
    'caller_status',
    'street',
    'house',
    'corpus',
    'apartment',
    'entrance',
    'floor',
  ]);

  const { factTraceableToTicket, hasCriticalTopic, hasImportantTopic, formatFactPriorityBlock, formatCallerTruthBlock } =
    truthMod;

  let processed = 0;
  const classCounts = {};
  let extraChars = 0;
  let extraMax = 0;
  const PRIORITY_LEVELS = new Set(['critical_now', 'important_if_relevant', 'private_if_asked', 'unknown']);
  for (const scenario of AGS_SCENARIOS) {
    processed += 1;
    const truth = callerTruthFrom(scenario);
    const errors = validateCallerTruth(truth, scenario.situation, scenario.address);
    assert.deepEqual(errors, [], `${scenario.id} truth errors: ${errors.join('; ')}`);
    const facts = truth.facts;
    assert.ok(facts, `facts missing ${scenario.id}`);
    assert.ok(Array.isArray(facts.criticalNow), `criticalNow ${scenario.id}`);
    assert.ok(Array.isArray(facts.importantFacts), `important ${scenario.id}`);
    assert.ok(Array.isArray(facts.askOnlyFacts), `askOnly ${scenario.id}`);
    assert.ok(Array.isArray(facts.unknownTopics), `unknown ${scenario.id}`);
    assert.equal(typeof truth.childInvolved, 'boolean', `childInvolved ${scenario.id}`);
    assert.ok(truth.incident && String(truth.incident).trim().length > 0, `incident ${scenario.id}`);
    assert.ok(truth.victim, `victim ${scenario.id}`);
    assert.ok(truth.location, `location ${scenario.id}`);
    assert.ok(truth.openingFacts && truth.openingFacts.incident, `openingFacts ${scenario.id}`);
    classCounts[truth.incidentClass] = (classCounts[truth.incidentClass] || 0) + 1;

    for (const fact of [...facts.criticalNow, ...facts.importantFacts, ...facts.askOnlyFacts]) {
      assert.ok(PRIORITY_LEVELS.has(fact.priority), `bad priority ${scenario.id} ${fact.topic}`);
      assert.ok(fact.topic && fact.source != null, `fact shape ${scenario.id} ${fact.topic}`);
    }
    for (const fact of facts.criticalNow) {
      assert.equal(fact.priority, 'critical_now', `${scenario.id} ${fact.topic}`);
      assert.ok(!ADMIN_CRITICAL.has(fact.topic), `admin fact in critical_now: ${scenario.id} ${fact.topic}`);
      assert.ok(
        factTraceableToTicket(fact, scenario.situation, scenario.address),
        `untraceable critical ${scenario.id} ${fact.topic}=${fact.value} source=${fact.source}`,
      );
    }
    const askTopics = new Set(facts.askOnlyFacts.map((item) => item.topic));
    if (truth.address) {
      assert.ok(askTopics.has('address'), `address should be ask-only ${scenario.id}`);
    }
    if (truth.callerPhone) {
      assert.ok(askTopics.has('caller_phone'), `phone should be ask-only ${scenario.id}`);
    }
    if (truth.callerName) {
      assert.ok(askTopics.has('caller_name'), `FIO should be ask-only ${scenario.id}`);
    }
    if (!truth.callerPhone) {
      assert.ok(facts.unknownTopics.includes('callerPhone') || facts.unknownTopics.includes('caller_phone'));
    }
    if (truth.victim.count != null) {
      assert.equal(truth.victim.count, truth.injuredCount, `victim.count ${scenario.id}`);
    }
    if (truth.location.human) {
      assert.ok(
        truthMod.locationHumanTraceable(truth.location.human, scenario.address),
        `human location not in address ${scenario.id}`,
      );
    }
    const prompt = formatCallerTruthBlock(truth, scenario.address, scenario.situation);
    extraChars += prompt.length;
    extraMax = Math.max(extraMax, prompt.length);
    assert.ok(prompt.length < 4000, `extra too large ${scenario.id} ${prompt.length}`);
    assert.doesNotMatch(prompt, /^\s*[{[]/, `json dump ${scenario.id}`);
    assert.match(prompt, /ФАКТЫ БИЛЕТА ЦЕЛИКОМ/);
    assert.match(prompt, /ОТКРЫТИЕ-ФАКТЫ/);
    assert.match(prompt, /ЛЮДИ-МОДЕЛЬ/);
    assert.match(prompt, /МЕСТО:/);
    assert.doesNotMatch(prompt, /Алло,/, `spoken opening leaked into truth ${scenario.id}`);
    if (facts.criticalNow.length) {
      assert.match(prompt, /critical_now/);
    }
    assert.equal(typeof formatFactPriorityBlock(facts), 'string');
  }
  assert.equal(processed, 96, 'every scenario must be processed');
  assert.ok(classCounts.fire >= 1 && classCounts.medical >= 1 && classCounts.traffic_accident >= 1);
  assert.ok(classCounts.violence >= 1 && classCounts.gas >= 1 && classCounts.water >= 1);
  assert.ok(classCounts.infrastructure >= 1);
  assert.ok(extraChars / 96 < 2800, `mean extra too large ${extraChars / 96}`);
  console.log('class counts', classCounts, 'mean extra', Math.round(extraChars / 96), 'max extra', extraMax);

  const byId = (id) => {
    const scenario = AGS_SCENARIOS.find((item) => item.id === id);
    assert.ok(scenario, `missing ${id}`);
    return scenario;
  };

  const fireOnlyTruth = callerTruthFrom(byId('ags-01-1'));
  assert.ok(fireOnlyTruth.facts.fire);
  assert.equal(fireOnlyTruth.facts.fire.present, true);
  assert.equal(fireOnlyTruth.facts.fire.peopleNearby, false);
  assert.equal(fireOnlyTruth.facts.fire.trapped, false);
  assert.equal(fireOnlyTruth.facts.fire.injured, false);
  assert.equal(fireOnlyTruth.facts.fire.child, false);
  assert.equal(fireOnlyTruth.facts.fire.respiratory, false);
  assert.equal(hasCriticalTopic(fireOnlyTruth.facts, 'people_nearby'), false);

  const firePeopleTruth = callerTruthFrom(byId('ags-05-1'));
  assert.equal(firePeopleTruth.facts.fire.peopleNearby, true);
  assert.ok(hasCriticalTopic(firePeopleTruth.facts, 'people_nearby'));

  const fireSmokeTruth = callerTruthFrom(byId('ags-02-1'));
  assert.equal(fireSmokeTruth.facts.fire.smoke, true);
  assert.equal(fireSmokeTruth.facts.fire.injured, false);
  assert.ok(hasImportantTopic(fireSmokeTruth.facts, 'smoke'));

  const fireSpreadTruth = callerTruthFrom(byId('ags-14-1'));
  assert.ok(hasCriticalTopic(fireSpreadTruth.facts, 'spreading_fire'));

  const trafficClearTruth = callerTruthFrom(byId('ags-25-2'));
  assert.ok(trafficClearTruth.facts.traffic);
  assert.equal(trafficClearTruth.facts.traffic.injuredCount, 0);
  assert.equal(trafficClearTruth.facts.traffic.trappedOccupant, false);
  assert.equal(trafficClearTruth.facts.traffic.vehicleCount, 2);
  assert.equal(hasCriticalTopic(trafficClearTruth.facts, 'trapped'), false);

  const trafficTrapTruth = callerTruthFrom(byId('ags-03-3'));
  assert.ok(hasCriticalTopic(trafficTrapTruth.facts, 'trapped'));

  const trafficPedTruth = callerTruthFrom(byId('ags-30-2'));
  assert.ok(hasCriticalTopic(trafficPedTruth.facts, 'pedestrian_involved'));
  assert.ok(hasCriticalTopic(trafficPedTruth.facts, 'unconscious'));

  const trafficFuelTruth = callerTruthFrom(byId('ags-32-2'));
  assert.ok(hasCriticalTopic(trafficFuelTruth.facts, 'multiple_injured'));
  assert.ok(hasCriticalTopic(trafficFuelTruth.facts, 'ongoing_danger'));
  assert.equal(hasCriticalTopic(trafficFuelTruth.facts, 'trapped'), false);
  assert.equal(trafficFuelTruth.facts.traffic.trappedOccupant, false);

  const medicalUncTruth = callerTruthFrom(byId('ags-04-2'));
  assert.ok(hasCriticalTopic(medicalUncTruth.facts, 'unconscious'));
  assert.equal(hasCriticalTopic(medicalUncTruth.facts, 'not_breathing'), false);
  assert.ok(!medicalUncTruth.facts.criticalNow.some((item) => /инфаркт|heart/i.test(String(item.topic))));

  const medicalVagueTruth = callerTruthFrom(byId('ags-06-2'));
  assert.equal(hasCriticalTopic(medicalVagueTruth.facts, 'unconscious'), false);
  assert.ok(medicalVagueTruth.facts.unknownTopics.includes('consciousness'));

  const medicalChildTruth = callerTruthFrom(byId('ags-14-2'));
  assert.equal(medicalChildTruth.childInvolved, true);
  assert.ok(hasCriticalTopic(medicalChildTruth.facts, 'breathing_difficulty'));
  assert.ok(hasCriticalTopic(medicalChildTruth.facts, 'child_in_danger'));

  const fightTruth = callerTruthFrom(byId('ags-01-2'));
  assert.ok(hasCriticalTopic(fightTruth.facts, 'active_violence'));
  assert.ok(hasCriticalTopic(fightTruth.facts, 'multiple_injured'));
  assert.ok(hasCriticalTopic(fightTruth.facts, 'weapon'));

  const quarrelTruth = callerTruthFrom(byId('ags-24-1'));
  assert.equal(hasCriticalTopic(quarrelTruth.facts, 'active_violence'), false);
  assert.equal(hasCriticalTopic(quarrelTruth.facts, 'weapon'), false);

  const gasHissTruth = callerTruthFrom(byId('ags-31-3'));
  assert.ok(hasCriticalTopic(gasHissTruth.facts, 'gas_leak') || hasCriticalTopic(gasHissTruth.facts, 'gas_danger'));
  assert.ok(!gasHissTruth.facts.criticalNow.some((item) => item.topic === 'explosion_risk'));

  const gasSmellTruth = callerTruthFrom(byId('ags-30-3'));
  assert.ok(hasCriticalTopic(gasSmellTruth.facts, 'gas_smell') || hasCriticalTopic(gasSmellTruth.facts, 'gas_danger'));

  const infraTruth = callerTruthFrom(byId('ags-32-3'));
  assert.equal(infraTruth.incidentClass, 'infrastructure');
  assert.equal(infraTruth.facts.fire, null);
  assert.equal(hasCriticalTopic(infraTruth.facts, 'active_fire'), false);

  const bikeTruth = callerTruthFrom(byId('ags-01-3'));
  assert.equal(bikeTruth.childInvolved, true);
  assert.ok(hasImportantTopic(bikeTruth.facts, 'child_involved'));
  assert.equal(hasCriticalTopic(bikeTruth.facts, 'child_in_danger'), false);
  assert.equal(hasCriticalTopic(bikeTruth.facts, 'unconscious'), false);

  const lockedTruth = callerTruthFrom(byId('ags-21-3'));
  assert.equal(lockedTruth.childInvolved, true);
  assert.ok(hasCriticalTopic(lockedTruth.facts, 'child_in_danger'));
  assert.ok(hasCriticalTopic(lockedTruth.facts, 'trapped'));

  const waterDrownTruth = callerTruthFrom(byId('ags-08-3'));
  assert.equal(waterDrownTruth.incidentClass, 'water');
  assert.ok(waterDrownTruth.facts.water);
  assert.equal(waterDrownTruth.facts.water.drowning, true);
  assert.equal(waterDrownTruth.facts.water.personInWater, true);
  assert.ok(hasCriticalTopic(waterDrownTruth.facts, 'drowning'));
  assert.ok(hasCriticalTopic(waterDrownTruth.facts, 'person_in_water'));
  assert.equal(hasCriticalTopic(waterDrownTruth.facts, 'vehicle_in_water'), false);

  const carWaterTruth = callerTruthFrom(byId('ags-02-3'));
  assert.equal(carWaterTruth.incidentClass, 'water');
  assert.ok(carWaterTruth.facts.water);
  assert.equal(carWaterTruth.facts.water.vehicleInWater, true);
  assert.equal(carWaterTruth.facts.water.personInWater, false);
  assert.equal(carWaterTruth.facts.water.drowning, false);
  assert.ok(hasCriticalTopic(carWaterTruth.facts, 'vehicle_in_water'));
  assert.equal(hasCriticalTopic(carWaterTruth.facts, 'person_in_water'), false);
  assert.equal(hasCriticalTopic(carWaterTruth.facts, 'drowning'), false);
  assert.ok(carWaterTruth.openingFacts.incident);
  assert.notEqual(carWaterTruth.openingFacts.extra?.topic, 'person_in_water');

  const iceTruth = callerTruthFrom(byId('ags-06-3'));
  assert.equal(iceTruth.incidentClass, 'water');
  assert.ok(iceTruth.facts.water.ice);
  assert.ok(hasCriticalTopic(iceTruth.facts, 'ice_hazard'));

  const bridgeTruth = callerTruthFrom(byId('ags-09-3'));
  assert.equal(bridgeTruth.incidentClass, 'water');
  assert.ok(hasCriticalTopic(bridgeTruth.facts, 'person_in_water'));
  assert.ok(hasCriticalTopic(bridgeTruth.facts, 'drowning'));

  const diveTruth = callerTruthFrom(byId('ags-15-2'));
  assert.equal(diveTruth.incidentClass, 'water');
  assert.ok(hasCriticalTopic(diveTruth.facts, 'person_in_water'));
  assert.equal(hasCriticalTopic(diveTruth.facts, 'drowning'), false);
  assert.ok(hasCriticalTopic(diveTruth.facts, 'severe_bleeding') || hasImportantTopic(diveTruth.facts, 'injured_condition'));
  assert.equal(diveTruth.victim.conscious, true);

  const containerTruth = callerTruthFrom(byId('ags-01-1'));
  assert.equal(containerTruth.incidentClass, 'fire');
  assert.ok(containerTruth.facts.fire);
  assert.equal(hasCriticalTopic(containerTruth.facts, 'people_nearby'), false);
  assert.ok(hasImportantTopic(containerTruth.facts, 'active_fire') || containerTruth.facts.fire.present);
  assert.equal(containerTruth.victim.exists, false);

  let promptChars = 0;
  let promptMax = 0;
  const lineOf = (prompt, label) => {
    const line = prompt.split('\n').find((item) => item.startsWith(label));
    assert.ok(line, `missing ${label}`);
    return line;
  };
  for (const scenario of AGS_SCENARIOS) {
    const prompt = buildLessonSystemPrompt(scenario, 'call');
    promptChars += prompt.length;
    promptMax = Math.max(promptMax, prompt.length);
    assert.match(prompt, /ЧТО СЛУЧИЛОСЬ:/);
    assert.match(prompt, /АДРЕС|МЕСТО:/);
    assert.match(prompt, /КТО ЗВОНИТ:/);
    assert.match(prompt, /Уже сказано вслух:/);
    assert.ok(prompt.includes(scenario.callerOpening), `opening missing from prompt ${scenario.id}`);
    assert.doesNotMatch(prompt, /Чего нет в этих строках/);
    assert.doesNotMatch(prompt, /хорошо» или «жду/);
    assert.doesNotMatch(prompt, /Если времени нет/);
    assert.doesNotMatch(prompt, /Я \+ фамил/);
    assert.equal((prompt.match(/Билет /g) || []).length, 1, `one ticket label ${scenario.id}`);
    assert.ok(prompt.startsWith(`Билет ${scenario.ticketNo}, ситуация ${scenario.situationNo}`), scenario.id);
  }
  console.log('live prompt mean', Math.round(promptChars / 96), 'max', promptMax);

  const firePrompt = buildLessonSystemPrompt(byId('ags-01-1'), 'call');
  assert.match(lineOf(firePrompt, 'КТО ЗВОНИТ:'), /Сидоров/);
  assert.match(lineOf(firePrompt, 'ЧТО СЛУЧИЛОСЬ:'), /контейнер/i);
  assert.match(byId('ags-01-1').callerOpening, /контейнер/i);
  assert.doesNotMatch(firePrompt, /Иванова|Волоколам|Симферополь/i);

  const policePrompt = buildLessonSystemPrompt(byId('ags-01-2'), 'call');
  assert.match(lineOf(policePrompt, 'ЧТО СЛУЧИЛОСЬ:'), /дерут|драк|нож/i);
  assert.doesNotMatch(policePrompt, /мусорн\w* контейнер/i);

  const medicalPrompt = buildLessonSystemPrompt(byId('ags-04-2'), 'call');
  assert.match(lineOf(medicalPrompt, 'ЧТО СЛУЧИЛОСЬ:'), /сознан/i);
  assert.match(medicalPrompt, /не значит «не дышит»/);
  assert.doesNotMatch(lineOf(medicalPrompt, 'СОСТОЯНИЕ:'), /^СОСТОЯНИЕ: не дышит/);

  const trapPrompt = buildLessonSystemPrompt(byId('ags-03-3'), 'call');
  assert.doesNotMatch(lineOf(trapPrompt, 'КТО ЗВОНИТ:'), /Иванова/);
  assert.match(trapPrompt, /ПОСТРАДАВШИЙ/);
  assert.match(trapPrompt, /Иванова/);
  assert.match(lineOf(trapPrompt, 'ЧТО СЛУЧИЛОСЬ:'), /заблокирован|бревн/i);
  assert.match(trapPrompt, /полици/i);

  const gasPrompt = buildLessonSystemPrompt(byId('ags-31-3'), 'call');
  assert.match(lineOf(gasPrompt, 'ЧТО СЛУЧИЛОСЬ:'), /газ/i);
  assert.doesNotMatch(gasPrompt, /мусорн\w* контейнер/i);

  const lightPrompt = buildLessonSystemPrompt(byId('ags-32-3'), 'call');
  assert.match(lineOf(lightPrompt, 'ЧТО СЛУЧИЛОСЬ:'), /Ленинград|Волоколам/i);
  assert.match(lightPrompt, /ЭТО СВЕТ/);
  assert.doesNotMatch(lightPrompt, /Пожара нет/);
  assert.doesNotMatch(lightPrompt, /мусорн\w* контейнер/i);

  const clearTraffic = buildLessonSystemPrompt(byId('ags-25-2'), 'call');
  assert.doesNotMatch(lineOf(clearTraffic, 'ЧТО СЛУЧИЛОСЬ:'), /б\/[пр]/i);
  assert.match(lineOf(clearTraffic, 'ЧТО СЛУЧИЛОСЬ:'), /без пострадавших/i);
  assert.match(lineOf(clearTraffic, 'ПОСТРАДАВШИЕ:'), /нет/);

  const fuelPrompt = buildLessonSystemPrompt(byId('ags-32-2'), 'call');
  assert.match(fuelPrompt, /бензин/i);
  assert.match(lineOf(fuelPrompt, 'ПОСТРАДАВШИЕ:'), /3|три/i);

  const theory = buildLessonSystemPrompt(byId('ags-01-1'), 'theory');
  assert.match(theory, /ЧТО СЛУЧИЛОСЬ:/);
  assert.doesNotMatch(theory, /Уже сказано вслух/);
} finally {
  await vite.close();
}

console.log('caller-truth regression ok: 96 scenarios, openings, unknown facts, fact-priority');
