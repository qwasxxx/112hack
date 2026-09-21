import { SCENARIOS, type TrainingScenario } from './data/scenarios';

export type DdsLaneId = 'all' | 'gas' | 'zhkh' | 'gormost' | 'vodokanal' | 'uprava';

export const DDS_LANES: Array<{ id: DdsLaneId; label: string; workplace: string; hint: string }> = [
  {
    id: 'all',
    label: 'Все службы ДДС',
    workplace: 'Единая ДДС',
    hint: 'Проверьте карточки оператора 112 и направьте нужные службы.',
  },
  {
    id: 'gas',
    label: 'Газ / Мосгаз',
    workplace: 'ДДС Мосгаз',
    hint: 'Ваш профиль — запах газа, утечка, взрыв бытового газа. Чужие карточки передайте, свою бригаду на них не направляйте.',
  },
  {
    id: 'zhkh',
    label: 'ЖКХ',
    workplace: 'ДДС ЖКХ',
    hint: 'Профиль — отопление, лифт, подъезд, крыша, мусоропровод. Остальное передайте в профильную ДДС.',
  },
  {
    id: 'gormost',
    label: 'Гормост',
    workplace: 'ДДС Гормост',
    hint: 'Профиль — мосты, эстакады, МКАД, проезжая часть, набережные.',
  },
  {
    id: 'vodokanal',
    label: 'Мосводоканал',
    workplace: 'ДДС Мосводоканал',
    hint: 'Профиль — вода, затопление, канализация, водоём.',
  },
  {
    id: 'uprava',
    label: 'Управы / районы',
    workplace: 'ДДС управы',
    hint: 'Районные происшествия без газа и воды. Профильные аварии передайте в Мосгаз, ЖКХ или Водоканал.',
  },
];

const KEY = 'sys112.ddsLane';

export function readDdsLane(): DdsLaneId {
  if (typeof localStorage === 'undefined') {
    return 'all';
  }
  try {
    const value = localStorage.getItem(KEY);
    return DDS_LANES.some((item) => item.id === value) ? (value as DdsLaneId) : 'all';
  } catch {
    return 'all';
  }
}

export function writeDdsLane(lane: DdsLaneId): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(KEY, lane);
}

export function ddsLaneLabel(lane: DdsLaneId): string {
  return DDS_LANES.find((item) => item.id === lane)?.label ?? 'ДДС';
}

export function ddsWorkplaceName(lane: DdsLaneId): string {
  return DDS_LANES.find((item) => item.id === lane)?.workplace ?? 'ДДС';
}

export function ddsWorkplaceHint(lane: DdsLaneId): string {
  return DDS_LANES.find((item) => item.id === lane)?.hint ?? '';
}

export function scenarioMatchesDdsLane(scenario: TrainingScenario, lane: DdsLaneId): boolean {
  if (lane === 'all') {
    return true;
  }
  const t = `${scenario.situation ?? ''} ${scenario.address ?? ''} ${scenario.title}`.toLowerCase();
  if (lane === 'gas') {
    return scenario.services.includes('gas') || /\bгаз/.test(t);
  }
  if (lane === 'zhkh') {
    return /жкх|отопл|лифт|мусоропровод|домофон|подъезд|крыш|балкон/.test(t);
  }
  if (lane === 'gormost') {
    return /мост|мкад|набережн|эстакад|путепровод|тротуар|проезж|шоссе/.test(t);
  }
  if (lane === 'vodokanal') {
    return /вод[аыеу]|тонет|пруд|озер|река|затопле|канализа|льдин/.test(t);
  }
  return scenario.services.includes('police') && !scenario.services.includes('gas');
}

function pickOther(pool: TrainingScenario[], used: Set<string>, offset: number): TrainingScenario | null {
  if (pool.length === 0) {
    return null;
  }
  for (let step = 0; step < pool.length; step += 1) {
    const item = pool[(offset + step) % pool.length];
    if (!used.has(item.id)) {
      return item;
    }
  }
  return null;
}

export type DdsShiftRole = 'own' | 'foreign';
export type DdsShiftSource = '112' | 'lane' | 'foreign';

export type DdsShiftTicket = {
  scenario: TrainingScenario;
  role: DdsShiftRole;
  source: DdsShiftSource;
};

/** Очередь смены: выбранный билет + ещё свой + чужой (если выбрана профильная лента). */
export function buildDdsShift(primary: TrainingScenario, lane: DdsLaneId): DdsShiftTicket[] {
  const used = new Set([primary.id]);
  const seed = (primary.ticketNo ?? 1) * 17 + (primary.situationNo ?? 1);
  const ownLane = lane === 'all' ? null : lane;
  const same = SCENARIOS.filter((item) => item.id !== primary.id && scenarioMatchesDdsLane(item, ownLane ?? 'all'));
  const foreignPool = ownLane
    ? SCENARIOS.filter((item) => item.id !== primary.id && !scenarioMatchesDdsLane(item, ownLane))
    : [];
  const extraOwn = pickOther(same.length ? same : SCENARIOS.filter((item) => item.id !== primary.id), used, seed);
  if (extraOwn) {
    used.add(extraOwn.id);
  }
  const foreign = ownLane ? pickOther(foreignPool, used, seed + 11) : null;
  const tickets: DdsShiftTicket[] = [{ scenario: primary, role: 'own', source: '112' }];
  if (extraOwn) {
    tickets.push({ scenario: extraOwn, role: 'own', source: 'lane' });
  }
  if (foreign) {
    tickets.push({ scenario: foreign, role: 'foreign', source: 'foreign' });
  }
  return tickets;
}
