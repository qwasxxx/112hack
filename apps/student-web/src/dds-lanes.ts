import type { TrainingScenario } from './data/scenarios';

export type DdsLaneId = 'all' | 'gas' | 'zhkh' | 'gormost' | 'vodokanal' | 'uprava';

export const DDS_LANES: Array<{ id: DdsLaneId; label: string }> = [
  { id: 'all', label: 'Все службы ДДС' },
  { id: 'gas', label: 'Газ / Мосгаз' },
  { id: 'zhkh', label: 'ЖКХ' },
  { id: 'gormost', label: 'Гормост' },
  { id: 'vodokanal', label: 'Мосводоканал' },
  { id: 'uprava', label: 'Управы / районы' },
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
