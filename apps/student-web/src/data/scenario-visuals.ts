import heroCrash from '../assets/scenarios/hero-crash.webp';
import heroFire from '../assets/scenarios/hero-fire.webp';
import heroGas from '../assets/scenarios/hero-gas.webp';
import heroHousehold from '../assets/scenarios/hero-household.webp';
import heroMedical from '../assets/scenarios/hero-medical.webp';
import heroPolice from '../assets/scenarios/hero-police.webp';
import heroSearch from '../assets/scenarios/hero-search.webp';
import heroTheft from '../assets/scenarios/hero-theft.webp';
import heroThreat from '../assets/scenarios/hero-threat.webp';
import heroWater from '../assets/scenarios/hero-water.webp';
import iconCrash from '../assets/scenarios/icon-crash.webp';
import iconFire from '../assets/scenarios/icon-fire.webp';
import iconGas from '../assets/scenarios/icon-gas.webp';
import iconHousehold from '../assets/scenarios/icon-household.webp';
import iconMedical from '../assets/scenarios/icon-medical.webp';
import iconPolice from '../assets/scenarios/icon-police.webp';
import iconSearch from '../assets/scenarios/icon-search.webp';
import iconTheft from '../assets/scenarios/icon-theft.webp';
import iconThreat from '../assets/scenarios/icon-threat.webp';
import iconWater from '../assets/scenarios/icon-water.webp';
import type { ServiceKind, TrainingScenario } from './scenarios';

export type ScenarioVisualKind =
  | 'fire'
  | 'medical'
  | 'police'
  | 'household'
  | 'water'
  | 'search'
  | 'crash'
  | 'threat'
  | 'theft'
  | 'gas';

export type ScenarioHeroVisual = {
  src: string;
  position: string;
};

export type ScenarioPictogramVisual = {
  src: string;
  kind: ScenarioVisualKind;
};

type ScenarioVisualRef = Pick<TrainingScenario, 'code' | 'id' | 'summary' | 'services'> & {
  situation?: string;
};

const HERO_BY_KIND: Record<ScenarioVisualKind, ScenarioHeroVisual> = {
  fire: { src: heroFire, position: '84% 40%' },
  medical: { src: heroMedical, position: '82% 48%' },
  police: { src: heroPolice, position: '80% 46%' },
  household: { src: heroHousehold, position: '82% 42%' },
  water: { src: heroWater, position: '84% 48%' },
  search: { src: heroSearch, position: '80% 46%' },
  crash: { src: heroCrash, position: '82% 48%' },
  threat: { src: heroThreat, position: '84% 50%' },
  theft: { src: heroTheft, position: '82% 48%' },
  gas: { src: heroGas, position: '84% 48%' },
};

const ICON_BY_KIND: Record<ScenarioVisualKind, string> = {
  fire: iconFire,
  medical: iconMedical,
  police: iconPolice,
  household: iconHousehold,
  water: iconWater,
  search: iconSearch,
  crash: iconCrash,
  threat: iconThreat,
  theft: iconTheft,
  gas: iconGas,
};

const TICKET_OVERRIDES: Partial<Record<string, ScenarioVisualKind>> = {};

export function inferVisualKind(situation: string, services: ServiceKind[]): ScenarioVisualKind {
  const t = situation.toLowerCase();
  if (/тонет|льдин|в воду|нырнул|плывут|не умеет плавать/.test(t)) {
    return 'water';
  }
  if (/дтп|наезд|на машину упало|упало бревно/.test(t)) {
    return 'crash';
  }
  if (/запах газа|газовой труб|свист от газов|\bгаз магистральн|\bгаз\b/.test(t)) {
    return 'gas';
  }
  if (
    /пожар|горит|задымл|дым|возгоран|сигнализац|столб черного|мусоропровод|открытое пламя|открытый огонь/.test(
      t,
    )
  ) {
    return 'fire';
  }
  if (/тик|взорвать|коробк.*провод|подозрительн/.test(t)) {
    return 'threat';
  }
  if (/угон|завладен/.test(t)) {
    return 'theft';
  }
  if (/потерялся|потерял(?:а|и)? ребенка|заблудил|не вернул|потерей памят/.test(t)) {
    return 'search';
  }
  if (
    /мегафон|громко играет музык|ссора во дворе|отлетела плитк|освещен|крепления на табло|соседи делают ремонт/.test(
      t,
    )
  ) {
    return 'household';
  }
  if (/у домофона/.test(t) && /ждет|не пояснил/.test(t)) {
    return 'police';
  }
  if (/у домофона/.test(t)) {
    return 'household';
  }
  if (/дерут|драк|избит|труп|затащил|изнасил|попрошайн|битами/.test(t)) {
    return 'police';
  }
  if (
    /сознан|травм|головн|упал|ожог|рожает|отошли воды|беременност|астма|судорог|инсульт|задыха|кровотеч|лекарств|хрип|снотворн|укусила|топором|рвота|перекошен|не может разбудить|вызывает себе/.test(
      t,
    )
  ) {
    return 'medical';
  }
  if (services.includes('ambulance')) {
    return 'medical';
  }
  return 'police';
}

export function visualKindFor(scenario: ScenarioVisualRef): ScenarioVisualKind {
  const override = TICKET_OVERRIDES[scenario.code] ?? TICKET_OVERRIDES[scenario.id];
  if (override) {
    return override;
  }
  return inferVisualKind(scenario.situation ?? scenario.summary, scenario.services);
}

export function heroVisualFor(scenario: ScenarioVisualRef): ScenarioHeroVisual {
  return HERO_BY_KIND[visualKindFor(scenario)];
}

export function pictogramVisualFor(scenario: ScenarioVisualRef): ScenarioPictogramVisual {
  const kind = visualKindFor(scenario);
  return { src: ICON_BY_KIND[kind], kind };
}
