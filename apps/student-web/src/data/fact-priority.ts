/** Fact-priority layer on top of callerTruthFrom. Does not invent values. */

export type FactPriorityLevel = 'critical_now' | 'important_if_relevant' | 'private_if_asked' | 'unknown';

export type CallerFact = {
  topic: string;
  value: string | number | boolean;
  priority: FactPriorityLevel;
  /** Matched ticket fragment or field name — why this fact exists. */
  source: string;
};

export type FireFactProfile = {
  present: boolean;
  smoke: boolean;
  peopleNearby: boolean;
  trapped: boolean;
  injured: boolean;
  child: boolean;
  respiratory: boolean;
};

export type TrafficFactProfile = {
  vehicleCount: number | null;
  injuredCount: number | null;
  trappedOccupant: boolean;
  pedestrianInvolved: boolean;
  visibleInjury: boolean;
  roadObstruction: boolean;
  ongoingDanger: boolean;
};

export type WaterFactProfile = {
  present: boolean;
  vehicleInWater: boolean;
  personInWater: boolean;
  drowning: boolean;
  ice: boolean;
};

export type MedicalFactProfile = {
  present: boolean;
  unconscious: boolean;
  notBreathing: boolean;
  breathingDifficulty: boolean;
  injury: boolean;
};

export type GasFactProfile = {
  present: boolean;
  smell: boolean;
  leak: boolean;
  peopleAffected: boolean;
};

export type ViolenceFactProfile = {
  present: boolean;
  active: boolean;
  weapon: boolean | null;
  injured: boolean;
};

/** Structured victim fields. Null means the ticket does not say. */
export type VictimFactModel = {
  exists: boolean | null;
  count: number | null;
  child: boolean | null;
  adult: boolean | null;
  conscious: boolean | null;
  breathing: boolean | null;
  breathingDifficulty: boolean | null;
  trapped: boolean | null;
  injury: string | null;
};

/** Human vs exact location, both copied from source (never invented). */
export type LocationFactModel = {
  exact: string | null;
  human: string | null;
};

/** Facts for a natural opening — not a prewritten sentence. */
export type OpeningFactSet = {
  incident: string;
  extra: CallerFact | null;
};

export type FactPriorityBundle = {
  criticalNow: CallerFact[];
  importantFacts: CallerFact[];
  askOnlyFacts: CallerFact[];
  unknownTopics: string[];
  fire: FireFactProfile | null;
  traffic: TrafficFactProfile | null;
  water: WaterFactProfile | null;
  medical: MedicalFactProfile | null;
  gas: GasFactProfile | null;
  violence: ViolenceFactProfile | null;
};

const OPENING_CRITICAL_ORDER = [
  'not_breathing',
  'unconscious',
  'person_in_water',
  'drowning',
  'child_in_danger',
  'trapped',
  'severe_bleeding',
  'breathing_difficulty',
  'people_nearby',
  'spreading_fire',
  'active_violence',
  'vehicle_in_water',
  'gas_danger',
  'gas_leak',
  'gas_smell',
  'ice_hazard',
  'multiple_injured',
  'pedestrian_involved',
  'ongoing_danger',
  'ongoing_threat',
] as const;

export type FactPriorityInput = {
  situation: string;
  address: string;
  incidentClass: string;
  callerName: string | null;
  callerRole: string | null;
  callerPhone: string | null;
  callerStatus: string | null;
  addressLine: string | null;
  street: string | null;
  house: string | null;
  corpus: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  locationDetails: string | null;
  injuredCount: number | null;
  injuredIdentity: string | null;
  injuredCondition: string | null;
  hasInjured: boolean | null;
  vehicle: string | null;
  unknownFields: string[];
};

const ASK_ONLY_NEVER_CRITICAL = new Set([
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

function lower(text: string): string {
  return text.replace(/\u00a0/g, ' ').toLowerCase();
}

function clip(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start), Math.min(text.length, end)).replace(/\s+/g, ' ').trim();
}

function fragmentFor(haystack: string, pattern: RegExp): string | null {
  const match = haystack.match(pattern);
  if (!match) {
    return null;
  }
  const idx = match.index ?? 0;
  return clip(haystack, idx, idx + match[0].length);
}

function isLighting(t: string): boolean {
  return /уличн[а-яё]*\s+освещен|горит\s+уличн/.test(t);
}

export function sourceLooksLikeFire(text: string): boolean {
  const t = lower(text);
  if (isLighting(t)) {
    return false;
  }
  if (/сигнализац/.test(t) && /дыма и возгорания нет|возгорания нет/.test(t)) {
    return false;
  }
  return (
    /пожар|задымл|возгоран|открыт\w*\s+плам|столб черного|что горит не знает|мусоропровод/.test(t) ||
    (/сигнализац/.test(t) && /пожарн/.test(t)) ||
    /горит/.test(t)
  );
}

export function sourceLooksLikeTraffic(text: string): boolean {
  const t = lower(text);
  return /дтп|наезд на пешехода/.test(t);
}

export function sourceLooksLikeWater(text: string): boolean {
  const t = lower(text);
  return /тонет|льдин|утоп|нырн|упал с моста в воду|падение автомашины в воду|плывут на льдин|не умеет плавать/.test(
    t,
  );
}

function deniedBy(t: string, negatives: RegExp[]): boolean {
  return negatives.some((pattern) => pattern.test(t));
}

function childMention(situation: string): { involved: boolean; fragment: string | null } {
  const t = situation;
  const word = fragmentFor(t, /реб[её]н(?:ок|ка|ке|ком)|дети|младен(?:ец|цем|ца)|подросток/i);
  if (word) {
    return { involved: true, fragment: word };
  }
  const age = fragmentFor(t, /(?:^|[^\d])(?:[1-9]|1[0-2])\s*(?:лет|года)(?=[^\d]|$)/i);
  if (age) {
    return { involved: true, fragment: age };
  }
  return { involved: false, fragment: null };
}

function trappedFragment(t: string, situation: string): string | null {
  if (/не\s+блокирован/.test(t)) {
    return null;
  }
  return (
    fragmentFor(situation, /зажат[а-яё]*/i) ||
    fragmentFor(situation, /заблокирован[а-яё]*/i) ||
    fragmentFor(situation, /двери заблокировались/i) ||
    fragmentFor(situation, /не может выйти/i)
  );
}

function vehicleCountFrom(situation: string, t: string): { count: number; source: string } | null {
  if (!/дтп|наезд/.test(t) && !/троллейбус/.test(t)) {
    return null;
  }
  const pair =
    fragmentFor(situation, /пежо\s*\+\s*фольксваген/i) ||
    fragmentFor(situation, /троллейбус[^.]+?\+\s*ваз[^\s,]*/i) ||
    fragmentFor(situation, /[а-яa-z0-9/]+\s*,?\s*\+\s*[а-яa-z0-9/]+/i);
  if (pair && (/дтп/.test(t) || /троллейбус/.test(t))) {
    return { count: 2, source: pair };
  }
  return null;
}

function participantCountFrom(situation: string): { value: string; source: string } | null {
  const match = situation.match(/(\d+\s*-\s*\d+|\d+)\s*человек/i);
  if (!match) {
    return null;
  }
  return { value: match[1].replace(/\s+/g, ''), source: match[0] };
}

function pushFact(
  facts: CallerFact[],
  topic: string,
  value: string | number | boolean,
  priority: FactPriorityLevel,
  source: string,
): void {
  if (ASK_ONLY_NEVER_CRITICAL.has(topic) && priority === 'critical_now') {
    return;
  }
  if (facts.some((item) => item.topic === topic && item.priority === priority)) {
    return;
  }
  facts.push({ topic, value, priority, source });
}

export function childInvolvedFrom(situation: string): boolean {
  return childMention(situation).involved;
}

export function buildFactPriority(input: FactPriorityInput): { bundle: FactPriorityBundle; childInvolved: boolean } {
  const situation = input.situation.replace(/\u00a0/g, ' ');
  const t = lower(situation);
  const critical: CallerFact[] = [];
  const important: CallerFact[] = [];
  const askOnly: CallerFact[] = [];
  const child = childMention(situation);
  const fireLike = sourceLooksLikeFire(situation);
  const corpse = /труп/.test(t);
  const trapped = trappedFragment(t, situation);

  const unconscious = /в сознании/.test(t)
    ? null
    : fragmentFor(situation, /без сознания/i) ||
      fragmentFor(situation, /потеря(?:ла)? сознания/i) ||
      fragmentFor(situation, /потеря сознания/i) ||
      fragmentFor(situation, /теряет сознание/i);
  const unresponsive = fragmentFor(situation, /не отвечает/i) || fragmentFor(situation, /не может разбудить/i);
  const notBreathing = fragmentFor(situation, /не дышит/i);
  const breathing =
    fragmentFor(situation, /тяжело дыш[а-яё]*/i) ||
    fragmentFor(situation, /затруднен[оа]\s+дыхани[ея]/i) ||
    fragmentFor(situation, /задыха[а-яё]*/i) ||
    fragmentFor(situation, /хрип[а-яё]*/i);
  const bleedingDenied = deniedBy(t, [/кровотечени[ея]\s+нет/, /видимых травм и кровотечений нет/]);
  const severeBleeding =
    !bleedingDenied &&
    !corpse &&
    (fragmentFor(situation, /кровотечени[ея]/i) || fragmentFor(situation, /рвота с кров/i));
  const visibleInjuryDenied = /видимых травм и кровотечений нет/.test(t);
  const visibleInjury = visibleInjuryDenied
    ? null
    : fragmentFor(situation, /окровавлен[а-яё]*/i) ||
      fragmentFor(situation, /в крови/i) ||
      fragmentFor(situation, /травм[аыеу][^,.]{0,24}/i) ||
      fragmentFor(situation, /ожог[^,.]{0,32}/i);
  const drowning =
    fragmentFor(situation, /тонет/i) ||
    fragmentFor(situation, /не умеет плавать/i) ||
    fragmentFor(situation, /утоп/i);
  const vehicleInWater = fragmentFor(situation, /падение автомашины в воду/i) || fragmentFor(situation, /машин[аыу]\s+в\s+воде/i);
  const personInWater =
    fragmentFor(situation, /тонет человек|человек тонет/i) ||
    fragmentFor(situation, /упал с моста в воду/i) ||
    fragmentFor(situation, /нырн[а-яё]*/i) ||
    fragmentFor(situation, /не умеет плавать/i);
  const iceHazard = fragmentFor(situation, /льдин/i);
  const peopleNearbyFire =
    fireLike &&
    (fragmentFor(situation, /кричат о помощи/i) ||
      fragmentFor(situation, /на балконе[^,.]{0,40}люд/i) ||
      fragmentFor(situation, /люд(?:и|ей) кричат/i));
  const spreadingFire = fireLike ? fragmentFor(situation, /огонь подходит/i) : null;
  const smoke =
    fireLike || /задымл|столб черного дыма/.test(t)
      ? fragmentFor(situation, /задымл[а-яё]*/i) || fragmentFor(situation, /столб черного дыма/i)
      : null;
  const openFlame = fireLike ? fragmentFor(situation, /открыт(?:ое|ый)?\s+плам[а-яё]*/i) || fragmentFor(situation, /открытый огонь/i) : null;
  const activeFire = fireLike ? fragmentFor(situation, /пожар|возгоран|горит|огонь|плам/i) : null;
  const gasSmell = fragmentFor(situation, /запах газа/i);
  const gasLeak =
    fragmentFor(situation, /свист от газовой трубы/i) ||
    fragmentFor(situation, /свист от газов/i) ||
    fragmentFor(situation, /газ магистральн[а-яё]*/i) ||
    fragmentFor(situation, /шум в трубе/i);
  const activeFight = fragmentFor(situation, /дерут(?:ся)?/i) || fragmentFor(situation, /драк[аеиу]/i);
  const quarrelOnly = /ссора во дворе|скандал/.test(t) && !activeFight;
  const weaponDenied = /без оружия/.test(t);
  const accidentalAxe = /ударила топором себя/.test(t);
  const weapon = weaponDenied
    ? null
    : accidentalAxe
      ? null
      : fragmentFor(situation, /нож(?:ом)?/i) ||
        fragmentFor(situation, /палками/i) ||
        fragmentFor(situation, /прутами/i) ||
        fragmentFor(situation, /битами/i);
  const ticking = fragmentFor(situation, /тикает/i);
  const bombThreat = fragmentFor(situation, /угрожает взорвать/i);
  const gasoline = fragmentFor(situation, /течет бензин/i);
  const pedestrian = fragmentFor(situation, /наезд на пешехода/i);
  const cannotLeave =
    fragmentFor(situation, /не может выйти/i) ||
    (peopleNearbyFire ? peopleNearbyFire : null) ||
    (trapped && /а\/м|автомоб|машин/.test(t) ? trapped : null);
  const missingChild = child.involved
    ? fragmentFor(situation, /потерял(?:ся|ась)?[^.]{0,24}реб[её]н/i) || fragmentFor(situation, /потерялся ребенок/i)
    : null;
  const lockedChildCar = child.involved && /один в а\/м|двери заблокировались/.test(t) ? trapped || child.fragment : null;
  const conscious = fragmentFor(situation, /в сознании/i);

  if (unconscious) pushFact(critical, 'unconscious', true, 'critical_now', unconscious);
  if (unresponsive) pushFact(critical, 'unresponsive', true, 'critical_now', unresponsive);
  if (notBreathing) pushFact(critical, 'not_breathing', true, 'critical_now', notBreathing);
  if (breathing) pushFact(critical, 'breathing_difficulty', true, 'critical_now', breathing);
  if (severeBleeding) pushFact(critical, 'severe_bleeding', true, 'critical_now', severeBleeding);
  if (trapped) pushFact(critical, 'trapped', true, 'critical_now', trapped);
  if (cannotLeave && cannotLeave !== trapped) pushFact(critical, 'cannot_leave', true, 'critical_now', cannotLeave);
  if (peopleNearbyFire) pushFact(critical, 'people_nearby', true, 'critical_now', peopleNearbyFire);
  if (spreadingFire) pushFact(critical, 'spreading_fire', true, 'critical_now', spreadingFire);
  if (drowning) pushFact(critical, 'drowning', true, 'critical_now', drowning);
  if (personInWater) pushFact(critical, 'person_in_water', true, 'critical_now', personInWater);
  if (vehicleInWater) pushFact(critical, 'vehicle_in_water', true, 'critical_now', vehicleInWater);
  if (iceHazard) pushFact(critical, 'ice_hazard', true, 'critical_now', iceHazard);
  if (gasSmell) pushFact(critical, 'gas_smell', true, 'critical_now', gasSmell);
  if (gasLeak) pushFact(critical, 'gas_leak', true, 'critical_now', gasLeak);
  if (gasSmell || gasLeak) {
    pushFact(critical, 'gas_danger', true, 'critical_now', gasSmell || gasLeak || 'газ');
  }
  if (activeFight) pushFact(critical, 'active_violence', true, 'critical_now', activeFight);
  if (weapon && (activeFight || /избит|изнасил|затащил|ударил ножом/.test(t))) {
    pushFact(critical, 'weapon', weapon, 'critical_now', weapon);
  } else if (weapon) {
    pushFact(important, 'weapon', weapon, 'important_if_relevant', weapon);
  }
  if (weaponDenied) pushFact(important, 'weapon', false, 'important_if_relevant', 'без оружия');
  if (ticking) pushFact(critical, 'ongoing_danger', true, 'critical_now', ticking);
  if (bombThreat) pushFact(critical, 'ongoing_threat', true, 'critical_now', bombThreat);
  if (gasoline) pushFact(critical, 'ongoing_danger', true, 'critical_now', gasoline);
  if (pedestrian) pushFact(critical, 'pedestrian_involved', true, 'critical_now', pedestrian);
  if (lockedChildCar) {
    pushFact(critical, 'child_in_danger', true, 'critical_now', lockedChildCar);
  }

  const childDanger =
    child.involved &&
    Boolean(unconscious || unresponsive || notBreathing || breathing || severeBleeding || trapped || drowning || lockedChildCar);
  if (childDanger && !lockedChildCar) {
    pushFact(critical, 'child_in_danger', true, 'critical_now', child.fragment || 'ребёнок');
  }

  if (input.injuredCount != null && input.injuredCount >= 2) {
    pushFact(critical, 'multiple_injured', input.injuredCount, 'critical_now', `${input.injuredCount} пострадавших`);
  } else if (input.injuredCount != null && input.injuredCount > 0) {
    pushFact(important, 'injured_count', input.injuredCount, 'important_if_relevant', `${input.injuredCount} пострадавших`);
  } else if (input.injuredCount === 0) {
    pushFact(important, 'injured_count', 0, 'important_if_relevant', 'пострадавших нет');
  }

  if (input.hasInjured === false) {
    pushFact(important, 'has_injured', false, 'important_if_relevant', 'пострадавших нет');
  } else if (input.hasInjured === true) {
    const injSrc = input.injuredCondition || fragmentFor(situation, /пострадал[а-яё]*/i) || 'пострадал';
    if (fireLike) {
      pushFact(important, 'fire_injured', true, 'important_if_relevant', injSrc);
    }
    if (input.injuredCount == null || input.injuredCount < 2) {
      pushFact(important, 'has_injured', true, 'important_if_relevant', injSrc);
    }
  }

  if (input.injuredIdentity) {
    pushFact(important, 'injured_identity', input.injuredIdentity, 'important_if_relevant', input.injuredIdentity);
  }
  if (input.injuredCondition) {
    pushFact(important, 'injured_condition', input.injuredCondition, 'important_if_relevant', input.injuredCondition);
  }
  if (visibleInjury && !severeBleeding) {
    pushFact(important, 'visible_injury', visibleInjury, 'important_if_relevant', visibleInjury);
  } else if (visibleInjury && severeBleeding) {
    pushFact(important, 'visible_injury', visibleInjury, 'important_if_relevant', visibleInjury);
  }
  if (conscious) pushFact(important, 'conscious', true, 'important_if_relevant', conscious);
  if (child.involved) {
    pushFact(important, 'child_involved', true, 'important_if_relevant', child.fragment || 'ребёнок');
  }
  if (missingChild) {
    pushFact(important, 'missing_child', true, 'important_if_relevant', missingChild);
  }
  if (input.vehicle) {
    pushFact(important, 'vehicle', input.vehicle, 'important_if_relevant', input.vehicle);
  }
  const vCount = vehicleCountFrom(situation, t);
  if (vCount) {
    pushFact(important, 'vehicle_count', vCount.count, 'important_if_relevant', vCount.source);
  }
  if (smoke) pushFact(important, 'smoke', true, 'important_if_relevant', smoke);
  if (activeFire) pushFact(important, 'active_fire', true, 'important_if_relevant', activeFire);
  if (openFlame) pushFact(important, 'open_flame', true, 'important_if_relevant', openFlame);
  if (input.locationDetails) {
    pushFact(important, 'location_details', input.locationDetails, 'important_if_relevant', input.locationDetails);
  }
  const participants = participantCountFrom(situation);
  if (participants) {
    pushFact(important, 'participant_count', participants.value, 'important_if_relevant', participants.source);
  }
  if (/перегородили проезд|бросили на проезжей части/.test(t)) {
    pushFact(
      important,
      'road_obstruction',
      true,
      'important_if_relevant',
      fragmentFor(situation, /перегородили проезд|бросили на проезжей части/i) || 'проезжая часть',
    );
  }
  if (quarrelOnly) {
    pushFact(important, 'quarrel', true, 'important_if_relevant', fragmentFor(situation, /ссора во дворе|скандал/i) || 'ссора');
  }

  const admin: Array<[string, string | null]> = [
    ['address', input.addressLine],
    ['caller_name', input.callerName],
    ['caller_phone', input.callerPhone],
    ['caller_role', input.callerRole],
    ['caller_status', input.callerStatus],
    ['street', input.street],
    ['house', input.house],
    ['corpus', input.corpus],
    ['apartment', input.apartment],
    ['entrance', input.entrance],
    ['floor', input.floor],
  ];
  for (const [topic, value] of admin) {
    if (value) {
      pushFact(askOnly, topic, value, 'private_if_asked', topic);
    }
  }

  const fire: FireFactProfile | null = fireLike
    ? {
        present: true,
        smoke: Boolean(smoke) || /задымл|столб черного/.test(t),
        peopleNearby: Boolean(peopleNearbyFire),
        trapped: Boolean(trapped),
        injured: input.hasInjured === true,
        child: child.involved,
        respiratory: Boolean(breathing),
      }
    : null;

  const trafficLike =
    (sourceLooksLikeTraffic(situation) || Boolean(pedestrian) || /водитель заблокирован/.test(t)) &&
    !sourceLooksLikeWater(situation);
  const traffic: TrafficFactProfile | null = trafficLike
    ? {
        vehicleCount: vCount?.count ?? null,
        injuredCount: input.injuredCount,
        trappedOccupant: Boolean(trapped) && !/не\s+блокирован/.test(t),
        pedestrianInvolved: Boolean(pedestrian),
        visibleInjury: Boolean(visibleInjury || unconscious || input.hasInjured === true),
        roadObstruction: /перегородили проезд|бросили на проезжей части|течет бензин/.test(t),
        ongoingDanger: Boolean(gasoline || ticking),
      }
    : null;

  const waterLike = sourceLooksLikeWater(situation);
  const water: WaterFactProfile | null = waterLike
    ? {
        present: true,
        vehicleInWater: Boolean(vehicleInWater),
        personInWater: Boolean(personInWater),
        drowning: Boolean(drowning),
        ice: Boolean(iceHazard),
      }
    : null;

  const medicalLike =
    Boolean(unconscious || unresponsive || notBreathing || breathing || input.injuredCondition) ||
    input.incidentClass === 'medical';
  const medical: MedicalFactProfile | null = medicalLike
    ? {
        present: true,
        unconscious: Boolean(unconscious || unresponsive),
        notBreathing: Boolean(notBreathing),
        breathingDifficulty: Boolean(breathing),
        injury: Boolean(visibleInjury || severeBleeding || input.injuredCondition),
      }
    : null;

  const gasLike = Boolean(gasSmell || gasLeak) || input.incidentClass === 'gas';
  const gas: GasFactProfile | null = gasLike
    ? {
        present: true,
        smell: Boolean(gasSmell),
        leak: Boolean(gasLeak),
        peopleAffected: input.hasInjured === true,
      }
    : null;

  const violenceLike = Boolean(activeFight) || input.incidentClass === 'violence';
  const violence: ViolenceFactProfile | null = violenceLike
    ? {
        present: true,
        active: Boolean(activeFight),
        weapon: weaponDenied ? false : weapon ? true : null,
        injured: input.hasInjured === true || (input.injuredCount != null && input.injuredCount > 0),
      }
    : null;

  const unknownTopics = [...input.unknownFields];
  if ((input.incidentClass === 'violence' || Boolean(activeFight)) && !weapon && !weaponDenied) {
    if (!unknownTopics.includes('weapon')) unknownTopics.push('weapon');
  }
  if (!unconscious && !unresponsive && !conscious && /плохо/.test(t)) {
    if (!unknownTopics.includes('consciousness')) unknownTopics.push('consciousness');
  }

  return {
    childInvolved: child.involved,
    bundle: {
      criticalNow: critical,
      importantFacts: important,
      askOnlyFacts: askOnly,
      unknownTopics,
      fire,
      traffic,
      water,
      medical,
      gas,
      violence,
    },
  };
}

export function formatFact(fact: CallerFact): string {
  return `${fact.topic}=${String(fact.value)}`;
}

export function formatFactPriorityBlock(bundle: FactPriorityBundle): string {
  const lines: string[] = [];
  if (bundle.criticalNow.length) {
    lines.push(`СРОЧНО (critical_now): ${bundle.criticalNow.map(formatFact).join('; ')}`);
  }
  if (bundle.importantFacts.length) {
    lines.push(`ВАЖНО ПО ДЕЛУ (important_if_relevant): ${bundle.importantFacts.map(formatFact).join('; ')}`);
  }
  if (bundle.askOnlyFacts.length) {
    lines.push(`ТОЛЬКО ЕСЛИ СПРОСИЛИ (private_if_asked): ${bundle.askOnlyFacts.map((item) => item.topic).join(', ')}`);
  }
  if (bundle.unknownTopics.length) {
    lines.push(
      `НЕИЗВЕСТНО (unknown; если спросили — «не знаю», ничего не придумывай): ${bundle.unknownTopics.join(', ')}`,
    );
  }
  if (bundle.fire) {
    lines.push(
      `ПОЖАР-ПРОФИЛЬ: fire=${bundle.fire.present}; smoke=${bundle.fire.smoke}; people=${bundle.fire.peopleNearby}; trapped=${bundle.fire.trapped}; injured=${bundle.fire.injured}; child=${bundle.fire.child}; respiratory=${bundle.fire.respiratory}`,
    );
  }
  if (bundle.traffic) {
    lines.push(
      `ДТП-ПРОФИЛЬ: vehicles=${bundle.traffic.vehicleCount ?? 'unknown'}; injured=${bundle.traffic.injuredCount ?? 'unknown'}; trapped=${bundle.traffic.trappedOccupant}; pedestrian=${bundle.traffic.pedestrianInvolved}; obstruction=${bundle.traffic.roadObstruction}; danger=${bundle.traffic.ongoingDanger}`,
    );
  }
  if (bundle.water) {
    lines.push(
      `ВОДА-ПРОФИЛЬ: vehicle=${bundle.water.vehicleInWater}; person=${bundle.water.personInWater}; drowning=${bundle.water.drowning}; ice=${bundle.water.ice}`,
    );
  }
  if (bundle.medical) {
    lines.push(
      `МЕД-ПРОФИЛЬ: unconscious=${bundle.medical.unconscious}; breathing=${bundle.medical.breathingDifficulty}; not_breathing=${bundle.medical.notBreathing}; injury=${bundle.medical.injury}`,
    );
  }
  if (bundle.gas) {
    lines.push(
      `ГАЗ-ПРОФИЛЬ: smell=${bundle.gas.smell}; leak=${bundle.gas.leak}; people=${bundle.gas.peopleAffected}`,
    );
  }
  if (bundle.violence) {
    lines.push(
      `НАСИЛИЕ-ПРОФИЛЬ: active=${bundle.violence.active}; weapon=${bundle.violence.weapon ?? 'unknown'}; injured=${bundle.violence.injured}`,
    );
  }
  return lines.join('\n');
}

export function factTraceableToTicket(fact: CallerFact, situation: string, address: string): boolean {
  const blob = `${situation} ${address}`;
  const blobLower = blob.toLowerCase();
  const src = fact.source.toLowerCase();
  if (ASK_ONLY_NEVER_CRITICAL.has(fact.topic)) {
    return true;
  }
  if (src && blobLower.includes(src.slice(0, Math.min(src.length, 24)))) {
    return true;
  }
  if (typeof fact.value === 'string' && fact.value.length >= 3 && blob.includes(String(fact.value))) {
    return true;
  }
  if (typeof fact.value === 'number' && blob.includes(String(fact.value))) {
    return true;
  }
  if (fact.topic === 'has_injured' && fact.value === false) {
    return /пострадавших нет|без пострадавших|б\/п|пострадавших не вид|пострадавших людей нет/.test(blobLower);
  }
  if (fact.topic === 'injured_count' && fact.value === 0) {
    return /пострадавших нет|без пострадавших|б\/п/.test(blobLower);
  }
  if (fact.topic === 'multiple_injured' && typeof fact.value === 'number') {
    return blobLower.includes(`${fact.value} пострадав`) || blob.includes(String(fact.value));
  }
  if (fact.topic === 'vehicle_count') {
    return /\+/.test(blob);
  }
  if (fact.topic === 'weapon' && fact.value === false) {
    return /без оружия/.test(blobLower);
  }
  if (fact.topic === 'child_involved' || fact.topic === 'child_in_danger') {
    return /реб[её]н|младен|подросток|(?:[1-9]|1[0-2])\s*(?:лет|года)/i.test(blob);
  }
  if (fact.topic === 'vehicle_in_water') {
    return /падени[ея] автомашины в воду|машин[аыу]\s+в\s+воде/i.test(blob);
  }
  if (fact.topic === 'person_in_water') {
    return /тонет человек|человек тонет|упал с моста в воду|нырн|не умеет плавать/i.test(blob);
  }
  if (fact.topic === 'ice_hazard') {
    return /льдин/i.test(blob);
  }
  if (typeof fact.value === 'boolean' && fact.value === true) {
    return src.length > 0 && blobLower.includes(src.slice(0, Math.min(8, src.length)));
  }
  return src.length > 0;
}

export function hasCriticalTopic(bundle: FactPriorityBundle, topic: string): boolean {
  return bundle.criticalNow.some((item) => item.topic === topic);
}

export function hasImportantTopic(bundle: FactPriorityBundle, topic: string): boolean {
  return bundle.importantFacts.some((item) => item.topic === topic);
}

export function pickOpeningExtra(criticalNow: CallerFact[]): CallerFact | null {
  for (const topic of OPENING_CRITICAL_ORDER) {
    const hit = criticalNow.find((item) => item.topic === topic);
    if (hit) {
      return hit;
    }
  }
  return criticalNow[0] ?? null;
}

export function openingFactSet(incident: string, criticalNow: CallerFact[]): OpeningFactSet {
  return { incident: incident.trim(), extra: pickOpeningExtra(criticalNow) };
}

function tri(value: boolean | null | undefined): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

export function buildVictimFacts(input: {
  hasInjured: boolean | null;
  injuredCount: number | null;
  injuredIdentity: string | null;
  injuredCondition: string | null;
  childInvolved: boolean;
  criticalNow: CallerFact[];
  situation: string;
}): VictimFactModel {
  const t = lower(input.situation);
  const has = (topic: string) => input.criticalNow.some((item) => item.topic === topic);
  const childVictim =
    input.childInvolved && (input.hasInjured === true || has('child_in_danger') || /реб[её]н|подрост/.test(t))
      ? true
      : input.childInvolved
        ? true
        : null;
  const adultMention = /женщин|мужчин|водитель|кассир|пешеход|пожилая/.test(t);
  const conscious = /в сознании/.test(t) ? true : has('unconscious') || has('unresponsive') ? false : null;
  const notBreathing = has('not_breathing');
  const difficulty = has('breathing_difficulty');
  let breathing: boolean | null = null;
  if (notBreathing) breathing = false;
  else if (difficulty) breathing = true;
  const injury =
    input.injuredCondition ||
    input.criticalNow.find((item) => item.topic === 'severe_bleeding')?.source ||
    null;
  return {
    exists: input.hasInjured,
    count: input.injuredCount,
    child: childVictim,
    adult: adultMention ? true : null,
    conscious,
    breathing,
    breathingDifficulty: difficulty ? true : notBreathing ? false : null,
    trapped: has('trapped') ? true : null,
    injury: injury && String(injury).trim() ? String(injury) : null,
  };
}

export function locationHumanFrom(address: string, locationDetails: string | null): string | null {
  const raw = address.replace(/\u00a0/g, ' ').trim();
  if (!raw && locationDetails) {
    return locationDetails;
  }
  if (!raw) {
    return null;
  }
  const main = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const formalHead =
    /^(?:корп(?:ус)?\.?|кв\.?|квартира|подъезд|под\.|эт(?:аж)?\.?|код|домофон|строение|стр\.)(?:\s|$|\d)/i;
  const kept: string[] = [];
  for (const rawPart of main.split(',')) {
    const part = rawPart.trim();
    if (!part || formalHead.test(part)) {
      continue;
    }
    const cleaned = part
      .replace(/\s+(?:корп(?:ус)?\.?|кв\.?)\s*\S+\s*$/i, '')
      .replace(/\s+(?:подъезд|под\.|эт(?:аж)?\.?|код)\s*\S+\s*$/i, '')
      .trim();
    if (cleaned && !formalHead.test(cleaned)) {
      kept.push(cleaned);
    }
  }
  const human = kept.join(', ');
  return human || locationDetails || main || null;
}

export function locationFactsFrom(address: string | null, locationDetails: string | null): LocationFactModel {
  const exact = address?.trim() || null;
  const human = exact ? locationHumanFrom(exact, locationDetails) : locationDetails;
  return { exact, human: human && human !== exact ? human : human };
}

function flagToken(value: boolean | null | number | undefined, unknown = 'unknown'): string {
  if (value === null || value === undefined) return unknown;
  return String(value);
}

export function formatVictimLine(victim: VictimFactModel): string {
  return (
    `ЛЮДИ-МОДЕЛЬ: exists=${flagToken(victim.exists)}; count=${flagToken(victim.count)}; ` +
    `child=${flagToken(victim.child)}; adult=${flagToken(victim.adult)}; ` +
    `conscious=${flagToken(victim.conscious)}; breathing=${flagToken(victim.breathing)}; ` +
    `trapped=${flagToken(victim.trapped)}; injury=${victim.injury ? 'known' : 'unknown'}`
  );
}

export function formatPlaceLine(location: LocationFactModel): string {
  const human = location.human ? `human=${location.human}` : 'human=unknown';
  return `МЕСТО: ${human}; exact=ask_only`;
}

export function formatOpeningFactsLine(opening: OpeningFactSet): string {
  const extra = opening.extra ? opening.extra.topic : 'none';
  return `ОТКРЫТИЕ-ФАКТЫ: главное=происшествие; доп=${extra}; не больше одного доп.факта`;
}

export function locationHumanTraceable(human: string, address: string): boolean {
  const addr = address.toLowerCase().replace(/ё/g, 'е');
  const words = human
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^а-я0-9]+/)
    .filter((word) => word.length >= 3);
  if (!words.length) {
    return true;
  }
  return words.every((word) => addr.includes(word));
}
