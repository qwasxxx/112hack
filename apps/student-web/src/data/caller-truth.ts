import type { ServiceKind, TrainingScenario } from './scenarios';
import {
  addressParts,
  callerStatusFrom,
  extractPhoneDigits,
  namesFromTicket,
  parseInjured,
  pickFragment,
  situationCore,
} from '../progress/ticket-parse';
import {
  buildFactPriority,
  buildVictimFacts,
  formatFactPriorityBlock,
  formatOpeningFactsLine,
  formatPlaceLine,
  formatVictimLine,
  locationFactsFrom,
  locationHumanTraceable,
  openingFactSet,
  sourceLooksLikeWater,
  type FactPriorityBundle,
  type LocationFactModel,
  type OpeningFactSet,
  type VictimFactModel,
} from './fact-priority';

export type { CallerFact, FactPriorityBundle, FactPriorityLevel, FireFactProfile, TrafficFactProfile, WaterFactProfile, MedicalFactProfile, GasFactProfile, ViolenceFactProfile, VictimFactModel, LocationFactModel, OpeningFactSet } from './fact-priority';
export { factTraceableToTicket, hasCriticalTopic, hasImportantTopic, formatFactPriorityBlock, pickOpeningExtra, locationHumanTraceable } from './fact-priority';

export type IncidentClass =
  | 'fire'
  | 'traffic_accident'
  | 'medical'
  | 'violence'
  | 'gas'
  | 'water'
  | 'infrastructure'
  | 'other';

export type CallerStress = 'calm' | 'anxious' | 'scared' | 'panic';
export type CallerUrgency = 'low' | 'medium' | 'high';

export type CallerEmotionProfile = {
  stress: CallerStress;
  urgency: CallerUrgency;
  speechStyle: string;
};

export type IncidentClassification = {
  class: IncidentClass;
  confident: boolean;
};

/** Ticket-derived facts the caller is allowed to know. Null means missing — never invent. */
export type CallerTruth = {
  scenarioId: string;
  ticketNo: number | null;
  situationNo: number | null;
  incident: string;
  incidentClass: IncidentClass;
  incidentClassConfident: boolean;
  address: string | null;
  street: string | null;
  house: string | null;
  corpus: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  locationDetails: string | null;
  callerName: string | null;
  callerRole: string | null;
  callerPhone: string | null;
  callerStatus: string | null;
  injuredCount: number | null;
  injuredIdentity: string | null;
  injuredCondition: string | null;
  hasInjured: boolean | null;
  vehicle: string | null;
  immediateDanger: string | null;
  knownServices: ServiceKind[];
  unknownFields: string[];
  childInvolved: boolean;
  victim: VictimFactModel;
  location: LocationFactModel;
  openingFacts: OpeningFactSet;
  facts: FactPriorityBundle;
  opening: string;
  emotion: CallerEmotionProfile;
};

export type CallerTruthSource = {
  id?: string;
  ticketNo?: number;
  situationNo?: number;
  situation?: string;
  address?: string;
  services?: ServiceKind[];
  summary?: string;
};

type OpeningKey =
  | 'fire'
  | 'smoke'
  | 'fire_alarm'
  | 'traffic'
  | 'hit_pedestrian'
  | 'medical'
  | 'unconscious'
  | 'breathing'
  | 'trapped'
  | 'childbirth'
  | 'fight'
  | 'assault'
  | 'assault_beat'
  | 'abduction'
  | 'gas'
  | 'gas_hiss'
  | 'lighting'
  | 'drowning'
  | 'ice'
  | 'car_in_water'
  | 'person_water'
  | 'lost_child'
  | 'theft'
  | 'ticking'
  | 'suspicious'
  | 'suicide'
  | 'help_cry'
  | 'noise'
  | 'quarrel'
  | 'tile'
  | 'sign'
  | 'drunk'
  | 'locked_door'
  | 'loiter'
  | 'help';

const OPENINGS: Record<OpeningKey, readonly string[]> = {
  fire: ['Алло, помогите, пожар!', 'Алло, здесь пожар!', 'Алло, горит!'],
  smoke: ['Алло, здесь задымление!', 'Алло, сильный дым!'],
  fire_alarm: ['Алло, сработала сигнализация!'],
  traffic: ['Алло, тут авария!', 'Алло, здесь ДТП!'],
  hit_pedestrian: ['Алло, сбили человека!'],
  medical: ['Алло, человеку плохо!', 'Алло, нужна помощь!'],
  unconscious: ['Алло, человек без сознания!'],
  breathing: ['Алло, человек задыхается!', 'Алло, трудно дышать!'],
  trapped: ['Алло, человека зажало!', 'Алло, человек заблокирован!'],
  childbirth: ['Алло, роды начались!'],
  fight: ['Алло, здесь драка!', 'Алло, тут дерутся!'],
  assault: ['Алло, тут нападение!'],
  assault_beat: ['Алло, человека избили!'],
  abduction: ['Алло, человека затащили!'],
  gas: ['Алло, здесь пахнет газом!', 'Алло, запах газа!'],
  gas_hiss: ['Алло, свистит газовая труба!'],
  lighting: ['Алло, горят фонари!', 'Алло, освещение не гаснет!'],
  drowning: ['Алло, человек тонет!'],
  ice: ['Алло, люди на льдине!'],
  car_in_water: ['Алло, машина в воде!'],
  person_water: ['Алло, человек в воде!'],
  lost_child: ['Алло, ребёнок потерялся!'],
  theft: ['Алло, угнали машину!'],
  ticking: ['Алло, что-то тикает!'],
  suspicious: ['Алло, тут подозрительный предмет!'],
  suicide: ['Алло, человек в беде!'],
  help_cry: ['Алло, кричат о помощи!'],
  noise: ['Алло, очень громкая музыка!'],
  quarrel: ['Алло, во дворе ссора!'],
  tile: ['Алло, в квартире трещина!'],
  sign: ['Алло, табло сейчас упадёт!'],
  drunk: ['Алло, тут пьяный буянит!'],
  locked_door: ['Алло, дверь не открывают!'],
  loiter: ['Алло, у подъезда подозрительный!'],
  help: ['Алло, нужна помощь!', 'Алло, помогите!'],
};

const ADDRESS_STOP = new Set([
  'москва',
  'московская',
  'область',
  'улица',
  'дом',
  'город',
  'поселок',
  'посёлок',
  'район',
  'проспект',
  'переулок',
  'шоссе',
  'набережная',
  'сторона',
]);

export function isStreetLightingText(text: string): boolean {
  const t = text.toLowerCase();
  return /уличн[а-яё]*\s+освещен|горит\s+уличн/.test(t);
}

function looksLikeFire(text: string): boolean {
  const t = text.toLowerCase();
  if (isStreetLightingText(t)) {
    return false;
  }
  return (
    /пожар|задымл|возгоран|открыт\w*\s+плам|столб черного|что горит не знает|мусоропровод/.test(t) ||
    (/сигнализац/.test(t) && /пожарн/.test(t)) ||
    /горит/.test(t)
  );
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[0]?.trim() || null;
}

function known(value: string | undefined | null): string | null {
  const text = value?.trim() ?? '';
  return text ? text : null;
}

function openingSeed(source: CallerTruthSource): number {
  return (source.ticketNo ?? 0) * 3 + (source.situationNo ?? 1);
}

function pickVariant(seed: number, variants: readonly string[]): string {
  const index = ((seed % variants.length) + variants.length) % variants.length;
  return variants[index] ?? variants[0] ?? 'Алло, нужна помощь!';
}

function blobOf(source: CallerTruthSource): string {
  return `${source.situation ?? source.summary ?? ''} ${source.address ?? ''}`.replace(/\u00a0/g, ' ');
}

function situationOf(source: CallerTruthSource): string {
  return (source.situation ?? source.summary ?? '').replace(/\u00a0/g, ' ');
}

function openingKeyFrom(text: string): OpeningKey {
  const t = text.toLowerCase();
  if (isStreetLightingText(t)) {
    return 'lighting';
  }
  if (/свист от газов|свист от газовой/.test(t)) {
    return 'gas_hiss';
  }
  if (/запах газа|газовой труб|газ магистральн|(?:^|[^а-яё])газ(?:[^а-яё]|$)/.test(t)) {
    return 'gas';
  }
  if (/тонет/.test(t)) {
    return 'drowning';
  }
  if (/льдин/.test(t)) {
    return 'ice';
  }
  if (/падение автомашины в воду/.test(t)) {
    return 'car_in_water';
  }
  if (/упал с моста в воду|не умеет плавать/.test(t)) {
    return 'drowning';
  }
  if (/нырн/.test(t)) {
    return 'person_water';
  }
  if (/наезд на пешехода/.test(t)) {
    return 'hit_pedestrian';
  }
  if (/дтп/.test(t)) {
    return 'traffic';
  }
  if (/сигнализац/.test(t) && /дыма и возгорания нет|возгорания нет/.test(t)) {
    return 'fire_alarm';
  }
  if (looksLikeFire(t) && /задымл/.test(t) && !/пожар|открыт\w*\s+плам|горит/.test(t)) {
    return 'smoke';
  }
  if (looksLikeFire(t)) {
    return 'fire';
  }
  if (/рожает|отошли воды/.test(t)) {
    return 'childbirth';
  }
  if (/без сознания|потеря(?:ла)? сознания|потеря сознания|теряет сознание|не может разбудить/.test(t)) {
    return 'unconscious';
  }
  if (/дерут|драк/.test(t)) {
    return 'fight';
  }
  if (/затащил/.test(t)) {
    return 'abduction';
  }
  if (/избит/.test(t)) {
    return 'assault_beat';
  }
  if (/изнасил|нож|угрожает взорвать/.test(t)) {
    return 'assault';
  }
  if (/потерял.*ребен|потерялся ребенок/.test(t)) {
    return 'lost_child';
  }
  if (/повесит|суицид/.test(t)) {
    return 'suicide';
  }
  if (/кричат о помощи|крики о помощи|просит о помощи/.test(t)) {
    return 'help_cry';
  }
  if (/угон|завладен/.test(t)) {
    return 'theft';
  }
  if (/тикает/.test(t)) {
    return 'ticking';
  }
  if (/подозрительн|коробка с проводами/.test(t)) {
    return 'suspicious';
  }
  if (/громко играет музыка|мегафон/.test(t)) {
    return 'noise';
  }
  if (/ссора во дворе|скандал/.test(t)) {
    return 'quarrel';
  }
  if (/отлетела плитк|трещин/.test(t)) {
    return 'tile';
  }
  if (/крепления на табло|угроза падения/.test(t)) {
    return 'sign';
  }
  if (/нетрезв/.test(t)) {
    return 'drunk';
  }
  if (/открыть дверь в квартиру|не открывает дверь/.test(t)) {
    return 'locked_door';
  }
  if (/у домофона|старшей по подъезду/.test(t)) {
    return 'loiter';
  }
  if (
    /плохо|астма|судорог|головн|сердц|отек|отёк|упал|травм|кровоточ|укусила|снотворн|рожает|задыха|ожог/.test(
      t,
    )
  ) {
    return 'medical';
  }
  return 'help';
}

function classFromOpeningKey(key: OpeningKey): IncidentClass {
  switch (key) {
    case 'fire':
    case 'smoke':
      return 'fire';
    case 'traffic':
    case 'hit_pedestrian':
      return 'traffic_accident';
    case 'drowning':
    case 'ice':
    case 'car_in_water':
    case 'person_water':
      return 'water';
    case 'medical':
    case 'unconscious':
    case 'breathing':
    case 'childbirth':
      return 'medical';
    case 'trapped':
      return 'other';
    case 'fight':
    case 'assault':
    case 'assault_beat':
    case 'abduction':
      return 'violence';
    case 'gas':
    case 'gas_hiss':
      return 'gas';
    case 'lighting':
    case 'noise':
    case 'quarrel':
    case 'tile':
    case 'sign':
    case 'drunk':
    case 'locked_door':
    case 'loiter':
    case 'fire_alarm':
      return 'infrastructure';
    default:
      return 'other';
  }
}

function competingClasses(text: string): number {
  const t = text.toLowerCase();
  let n = 0;
  if (sourceLooksLikeWater(t)) n += 1;
  if (looksLikeFire(t)) n += 1;
  if (/дтп|наезд на пешехода/.test(t)) n += 1;
  if (/запах газа|газовой труб|свист от газов/.test(t)) n += 1;
  if (/дерут|драк|избит|изнасил/.test(t)) n += 1;
  if (
    /без сознания|плохо|астма|судорог|рожает|упал|головн/.test(t) &&
    !looksLikeFire(t) &&
    !/дтп/.test(t)
  ) {
    n += 1;
  }
  return n;
}

export function classifyIncident(source: CallerTruthSource): IncidentClassification {
  const text = situationOf(source);
  if (sourceLooksLikeWater(text)) {
    const overlap = competingClasses(text);
    return { class: 'water', confident: overlap <= 1 };
  }
  const key = openingKeyFrom(text);
  const incidentClass = classFromOpeningKey(key);
  const overlap = competingClasses(text);
  const confident = overlap <= 1;
  return { class: incidentClass, confident };
}

export function callerOpeningFrom(source: CallerTruthSource): string {
  const text = situationOf(source);
  const t = text.toLowerCase();
  const key = openingKeyFrom(text);
  const threat = t.match(/угрожает\s+взорвать\s+([а-яё]+)/);
  if (threat) {
    return `Алло, угрожают взорвать ${threat[1]}!`;
  }
  const trapped =
    /зажат|заблокирован|двери заблокировались/.test(t) && !/не\s+блокирован/.test(t);
  if (trapped && (key === 'help' || key === 'medical')) {
    if (/зажат/.test(t)) {
      return 'Алло, человека зажало!';
    }
    if (/реб[её]н/.test(t) && /а\/м|машин|автомоб/.test(t)) {
      return 'Алло, ребёнок заперт в машине!';
    }
    return 'Алло, человек заблокирован!';
  }
  if (key === 'noise' && !/музык/.test(t)) {
    return 'Алло, тут ссора!';
  }
  if (key === 'quarrel' && !/во\s+двор/.test(t)) {
    return 'Алло, тут скандал!';
  }
  if (/задыха|тяжело дыш|затруднен[оа]\s+дыхани|не дышит/.test(t) && key === 'medical') {
    return pickVariant(openingSeed(source), OPENINGS.breathing);
  }
  if (key === 'fire') {
    let specific = '';
    if (/мусорн\w*\s+контейнер|контейнер/i.test(t)) {
      specific = 'Алло, горит мусорный контейнер!';
    } else if (/крыш/i.test(t)) {
      specific = 'Алло, горит крыша!';
    } else if (/балкон/i.test(t)) {
      specific = 'Алло, горит балкон!';
    } else if (/мусоропровод/i.test(t)) {
      specific = 'Алло, дым из мусоропровода!';
    }
    if (specific && !openingLeaksAddress(specific, source.address)) {
      return specific;
    }
  }
  return pickVariant(openingSeed(source), OPENINGS[key]);
}

const CALLER_FIO = /[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}/g;

function nameIsVictimBound(situation: string, fio: string): boolean {
  if (!fio) {
    return false;
  }
  const at = situation.lastIndexOf(fio);
  if (at < 0) {
    return false;
  }
  const before = situation.slice(Math.max(0, at - 48), at).toLowerCase().replace(/ё/g, 'е');
  return /(?:заблокирован\w*|зажат\w*)\s*$/.test(before);
}

function nameAfterCallerVerb(situation: string): string {
  const match = situation.match(
    /вызывает\s+(?:подруга|прохожий|прохожая|кассир(?:\s+магазина)?|администратор|муж|отец|мама|супруг|соседк\w*|сосед\w*)[, ]+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,2})/i,
  );
  return match?.[1]?.trim() ?? '';
}

/** Prompt identity. Does not treat a victim-bound name as the speaker. */
export function promptCallerIdentity(situation: string): { who: string; victim: string; others: string } {
  const people = namesFromTicket(situation);
  const role = people.callerRole.trim();
  let name = people.callerFio.trim();
  const bound = nameIsVictimBound(situation, name);
  if (bound && !role) {
    name = '';
  }
  const namedCaller = nameAfterCallerVerb(situation);
  const witness = situation.match(
    /([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,2})\s*\(\s*очевидец\s*\)/,
  );
  if (namedCaller && namedCaller !== people.injuredName) {
    name = namedCaller;
  } else if (witness && !role) {
    name = witness[1].trim();
  }
  let victim =
    people.injuredName && people.injuredName !== name
      ? people.injuredName
      : bound
        ? people.callerFio.trim()
        : '';
  if (!victim) {
    const described = situation.match(
      /(?:женщин[аеуы]|мужчина|ребёнок|ребенок|мальчик|девочка)\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,2})/,
    );
    const describedName = described?.[1]?.trim() ?? '';
    if (describedName && describedName !== name) {
      victim = describedName;
    }
  }
  let who = '';
  if (role && name) {
    who = `${role}, ${name}`;
  } else if (role) {
    who = `${role}. Своего имени в билете нет — не выдумывай имя и не бери фамилию другого человека`;
  } else if (name) {
    who = name;
  } else {
    who = 'в билете прямо не сказано, кто говорит. Говори нейтрально, не представляйся чужим именем и не выдумывай родство';
  }
  const otherLine = [...new Set(situation.match(CALLER_FIO) ?? [])]
    .filter((item) => item !== name && item !== victim)
    .join('; ');
  return { who, victim, others: otherLine };
}

export function callerEmotionProfile(source: CallerTruthSource): CallerEmotionProfile {
  const t = blobOf(source).toLowerCase();
  const key = openingKeyFrom(t);
  const severe =
    /открыт\w*\s+плам|тонет|без сознания|не может разбудить|хрип|тикает|взорвать|нож|изнасил|кричат о помощи|задыха|течет бензин|огонь подходит|повесит/.test(
      t,
    );
  const activeDanger =
    looksLikeFire(t) ||
    /запах газа|свист от газов|дерут|драк|наезд|дтп/.test(t) ||
    key === 'assault' ||
    key === 'assault_beat' ||
    key === 'abduction' ||
    key === 'drowning';
  const minor =
    key === 'lighting' ||
    key === 'noise' ||
    key === 'tile' ||
    key === 'sign' ||
    key === 'fire_alarm' ||
    key === 'quarrel' ||
    key === 'loiter';

  if (severe) {
    return { stress: 'panic', urgency: 'high', speechStyle: 'короткие фразы, сбивчиво' };
  }
  if (activeDanger) {
    return { stress: 'scared', urgency: 'high', speechStyle: 'сжато, голос напряжён' };
  }
  if (minor) {
    return { stress: 'calm', urgency: 'low', speechStyle: 'ровно, по делу' };
  }
  return { stress: 'anxious', urgency: 'medium', speechStyle: 'быстро, но связно' };
}

function extractVehicle(situation: string): string | null {
  return firstMatch(
    situation,
    /(?:а\/м|автомашин[аыеу]?|ваз[-\s]*\d+|тойота[^,.]{0,40}|фольксваген[^,.]{0,40}|пежо[^,.]{0,24}|мерседес[^,.]{0,40}|форд[^,.]{0,40}|мазда-?\d*[^,.]{0,40}|троллейбус[^,.]{0,48}|автобус[^,.]{0,48})/i,
  );
}

function extractInjuredCondition(situation: string): string | null {
  const found: string[] = [];
  const patterns = [
    /без сознания/i,
    /потеря(?:ла)? сознания/i,
    /теряет сознание/i,
    /отек\s+\w+(?:\s+и\s+\w+)?/i,
    /отёк\s+\w+(?:\s+и\s+\w+)?/i,
    /ожог[^,.]{0,32}/i,
    /кровотечени[ея][^,.]{0,24}/i,
    /травм[аыеу][^,.]{0,28}/i,
    /в сознании/i,
    /задыха\w*/i,
    /астма/i,
    /судорог\w*/i,
    /пена изо рта/i,
    /не умеет плавать/i,
    /лицо перекошено/i,
    /хрип\w*/i,
  ];
  for (const pattern of patterns) {
    const hit = firstMatch(situation, pattern);
    if (hit && !found.some((item) => item.toLowerCase() === hit.toLowerCase())) {
      found.push(hit);
    }
  }
  return found.length ? found.join(', ') : null;
}

function extractImmediateDanger(situation: string): string | null {
  return firstMatch(
    situation,
    /открыт(?:ое)?\s+пламя|тонет|течет бензин|кричат о помощи|крики о помощи|запах газа|тикает|огонь подходит|не умеет плавать|угрожает взорвать|задыха\w*/i,
  );
}

function extractLocationDetails(address: string, situation: string): string | null {
  const paren = pickFragment(address, /\(([^)]+)\)/);
  if (paren) {
    return paren;
  }
  const landmark =
    /(?:около|напротив|рядом с|недалеко от|у входа|во дворе)[^,.]{3,60}/i;
  return firstMatch(address, landmark) || firstMatch(situation, landmark);
}

function scenarioIdFrom(source: CallerTruthSource): string {
  if (source.id) {
    return source.id;
  }
  if (source.ticketNo != null && source.situationNo != null) {
    return `ags-${String(source.ticketNo).padStart(2, '0')}-${source.situationNo}`;
  }
  return '';
}

function unknownList(
  truth: Omit<
    CallerTruth,
    'unknownFields' | 'opening' | 'emotion' | 'facts' | 'childInvolved' | 'victim' | 'location' | 'openingFacts'
  >,
): string[] {
  const unknown: string[] = [];
  if (truth.callerName == null) unknown.push('callerName');
  if (truth.callerPhone == null) unknown.push('callerPhone');
  if (truth.injuredCount == null) unknown.push('injuredCount');
  if (truth.injuredIdentity == null) unknown.push('injuredIdentity');
  if (truth.injuredCondition == null) unknown.push('injuredCondition');
  if (truth.hasInjured == null) unknown.push('hasInjured');
  if (truth.floor == null) unknown.push('floor');
  if (truth.entrance == null) unknown.push('entrance');
  if (truth.street == null) unknown.push('street');
  if (truth.house == null) unknown.push('house');
  if (truth.vehicle == null) unknown.push('vehicle');
  if (truth.apartment == null) unknown.push('apartment');
  if (truth.locationDetails == null) unknown.push('locationDetails');
  return unknown;
}

/** Facts the caller may know and reveal for this scenario. Missing values stay null. */
export function callerTruthFrom(source: CallerTruthSource | TrainingScenario): CallerTruth {
  const situation = situationOf(source);
  const address = source.address?.trim() || '';
  const phone = extractPhoneDigits(situation);
  const people = namesFromTicket(situation);
  const injured = parseInjured(situation);
  const parts = addressParts(address, situation);
  const classified = classifyIncident(source);
  const vehicle = extractVehicle(situation);
  const injuredCondition = extractInjuredCondition(situation);
  const immediateDanger = extractImmediateDanger(situation);
  const locationDetails = extractLocationDetails(address, situation);
  const base = {
    scenarioId: scenarioIdFrom(source),
    ticketNo: source.ticketNo ?? null,
    situationNo: source.situationNo ?? null,
    incident: situationCore(situation, people.injuredName || people.callerFio, phone),
    incidentClass: classified.class,
    incidentClassConfident: classified.confident,
    address: known(address),
    street: known(parts.street),
    house: known(parts.house),
    corpus: known(parts.corpus),
    apartment: known(parts.apartment),
    entrance: known(parts.entrance),
    floor: known(parts.floor),
    locationDetails,
    callerName: known(people.callerFio),
    callerRole: known(people.callerRole),
    callerPhone: known(phone),
    callerStatus: known(callerStatusFrom(situation)),
    injuredCount: injured.count,
    injuredIdentity: known(people.injuredName),
    injuredCondition,
    hasInjured: injured.hasInjured,
    vehicle,
    immediateDanger,
    knownServices: [...(source.services ?? [])],
  };
  const unknownFields = unknownList(base);
  const prioritized = buildFactPriority({
    situation,
    address,
    incidentClass: classified.class,
    callerName: base.callerName,
    callerRole: base.callerRole,
    callerPhone: base.callerPhone,
    callerStatus: base.callerStatus,
    addressLine: base.address,
    street: base.street,
    house: base.house,
    corpus: base.corpus,
    apartment: base.apartment,
    entrance: base.entrance,
    floor: base.floor,
    locationDetails: base.locationDetails,
    injuredCount: base.injuredCount,
    injuredIdentity: base.injuredIdentity,
    injuredCondition: base.injuredCondition,
    hasInjured: base.hasInjured,
    vehicle: base.vehicle,
    unknownFields,
  });
  const victim = buildVictimFacts({
    hasInjured: base.hasInjured,
    injuredCount: base.injuredCount,
    injuredIdentity: base.injuredIdentity,
    injuredCondition: base.injuredCondition,
    childInvolved: prioritized.childInvolved,
    criticalNow: prioritized.bundle.criticalNow,
    situation,
  });
  const location = locationFactsFrom(base.address, locationDetails);
  const openingFacts = openingFactSet(base.incident, prioritized.bundle.criticalNow);
  return {
    ...base,
    unknownFields: prioritized.bundle.unknownTopics,
    childInvolved: prioritized.childInvolved,
    victim,
    location,
    openingFacts,
    facts: prioritized.bundle,
    opening: callerOpeningFrom(source),
    emotion: callerEmotionProfile(source),
  };
}

export function openingWordCount(opening: string): number {
  return opening
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function openingLeaksAddress(opening: string, address: string | null | undefined): boolean {
  const line = opening.toLowerCase().replace(/ё/g, 'е');
  const raw = (address ?? '').trim();
  if (!raw) {
    return false;
  }
  if (raw.length >= 12 && line.includes(raw.toLowerCase().replace(/ё/g, 'е'))) {
    return true;
  }
  const tokens = raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^а-я0-9]+/)
    .filter((word) => word.length >= 5 && !ADDRESS_STOP.has(word));
  return tokens.some((word) => line.includes(word));
}

export function formatCallerTruthBlock(truth: CallerTruth, spokenAddress: string, spokenSituation: string): string {
  const incident = truth.incident || spokenSituation;
  const knownLines = [
    `ЧТО СЛУЧИЛОСЬ: ${incident}`,
    incident ? `ФАКТЫ БИЛЕТА ЦЕЛИКОМ: ${incident}` : '',
    formatOpeningFactsLine(truth.openingFacts),
    formatVictimLine(truth.victim),
    formatPlaceLine(truth.location),
    spokenAddress ? `АДРЕС (назови, только если спросили): ${spokenAddress}` : 'АДРЕС: неизвестен — не выдумывай улицу, дом, квартиру.',
    truth.callerName ? `ФИО ЗАЯВИТЕЛЯ: ${truth.callerName}` : 'ФИО ЗАЯВИТЕЛЯ: неизвестно — не выдумывай имя.',
    truth.callerRole ? `РОЛЬ ЗАЯВИТЕЛЯ: ${truth.callerRole}` : '',
    truth.injuredIdentity
      ? `ПОСТРАДАВШИЙ (это не ты; назови только если спросили): ${truth.injuredIdentity}`
      : '',
    truth.callerPhone ? `ТЕЛЕФОН (назови, только если спросили): ${truth.callerPhone}` : 'ТЕЛЕФОН: неизвестен — не выдумывай номер.',
    truth.floor ? `ЭТАЖ: ${truth.floor}` : '',
    truth.entrance ? `ПОДЪЕЗД: ${truth.entrance}` : '',
    truth.vehicle ? `ТРАНСПОРТ (только если спросили): ${truth.vehicle}` : '',
    truth.injuredCondition ? `СОСТОЯНИЕ (только если спросили): ${truth.injuredCondition}` : '',
    truth.hasInjured === false ? 'ПОСТРАДАВШИХ НЕТ — не выдумывай раненых.' : '',
    truth.hasInjured === true && truth.injuredCount != null ? `ЧИСЛО ПОСТРАДАВШИХ: ${truth.injuredCount}` : '',
    truth.immediateDanger ? `УГРОЗА ИЗ БИЛЕТА: ${truth.immediateDanger}` : '',
    formatFactPriorityBlock(truth.facts),
  ].filter(Boolean);
  return knownLines.join('\n');
}

export function validateCallerTruth(truth: CallerTruth, situation: string, address: string): string[] {
  const errors: string[] = [];
  if (!truth.scenarioId) errors.push('missing scenarioId');
  if (!String(truth.incident || '').trim()) errors.push('missing incident');
  if (!truth.facts) errors.push('missing facts');
  const admin = new Set(['address', 'caller_name', 'caller_phone', 'caller_role', 'caller_status', 'street', 'house', 'corpus', 'apartment', 'entrance', 'floor']);
  for (const fact of truth.facts.criticalNow) {
    if (admin.has(fact.topic)) errors.push(`admin in critical_now: ${fact.topic}`);
    if (fact.priority !== 'critical_now') errors.push(`bad critical priority ${fact.topic}`);
  }
  if (truth.openingFacts.extra && truth.openingFacts.extra.priority !== 'critical_now') {
    errors.push('opening extra is not critical_now');
  }
  if (truth.location.human && !locationHumanTraceable(truth.location.human, address || '')) {
    errors.push('location.human not in address');
  }
  if (truth.victim.exists === true && truth.hasInjured !== true) {
    errors.push('victim.exists true without hasInjured');
  }
  if (truth.victim.count != null && truth.injuredCount !== truth.victim.count) {
    errors.push('victim.count mismatch');
  }
  if (truth.callerPhone && !situation.replace(/\D/g, '').includes(truth.callerPhone)) {
    errors.push('phone not in ticket');
  }
  return errors;
}
