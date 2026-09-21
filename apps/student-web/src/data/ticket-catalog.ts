import { AGS_SCENARIOS, classifierNumberFor, publicTheme, ticketToScenario } from './ags-tickets';
import type { ServiceKind, TrainingScenario } from './scenarios';

export type TicketPatch = {
  title?: string;
  code?: string;
  situation: string;
  address: string;
  services: ServiceKind[];
  callerOpening?: string;
  classifierNumber?: string;
  difficulty?: TrainingScenario['difficulty'];
  checklist?: string[];
};

type CatalogStore = {
  overlays: Record<string, TicketPatch>;
  custom: TrainingScenario[];
};

const KEY = 'sys112.tickets.v1';

const emptyStore = (): CatalogStore => ({ overlays: {}, custom: [] });

function readStore(): CatalogStore {
  if (typeof localStorage === 'undefined') {
    return emptyStore();
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return emptyStore();
    }
    const parsed = JSON.parse(raw) as Partial<CatalogStore>;
    return {
      overlays: parsed.overlays && typeof parsed.overlays === 'object' ? parsed.overlays : {},
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: CatalogStore): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function applyTicketPatch(base: TrainingScenario, patch: TicketPatch): TrainingScenario {
  const situation = patch.situation.trim() || base.situation || '';
  const address = patch.address.trim();
  const services = patch.services.length ? patch.services : base.services;
  const rebuilt = ticketToScenario({
    ticket: base.ticketNo ?? 90,
    n: base.situationNo ?? 1,
    situation,
    address,
  });
  return {
    ...rebuilt,
    id: base.id,
    code: patch.code?.trim() || base.code,
    title: patch.title?.trim() || rebuilt.title,
    services,
    situation,
    address,
    callerOpening: patch.callerOpening?.trim() || rebuilt.callerOpening,
    classifierNumber: patch.classifierNumber?.trim() || classifierNumberFor(services, `${situation} ${address}`),
    checklist: patch.checklist?.length ? patch.checklist : rebuilt.checklist,
    difficulty: patch.difficulty || rebuilt.difficulty,
    ttsVoice: base.ttsVoice,
    summary: `Тренировка оператора 112. ${publicTheme(situation, services)}. Обстановку выясняете на линии.`,
  };
}

export function buildCatalog(): TrainingScenario[] {
  const store = readStore();
  const ags = AGS_SCENARIOS.map((item) => {
    const patch = store.overlays[item.id];
    return patch ? applyTicketPatch(item, patch) : { ...item };
  });
  return [...ags, ...store.custom];
}

export function saveTicketPatch(id: string, patch: TicketPatch): TrainingScenario {
  const store = readStore();
  const base =
    AGS_SCENARIOS.find((item) => item.id === id) ??
    store.custom.find((item) => item.id === id);
  if (!base) {
    throw new Error('Билет не найден');
  }
  const next = applyTicketPatch(base, patch);
  if (store.custom.some((item) => item.id === id)) {
    store.custom = store.custom.map((item) => (item.id === id ? next : item));
  } else {
    store.overlays[id] = patch;
  }
  writeStore(store);
  return next;
}

export function createCustomTicket(patch: TicketPatch): TrainingScenario {
  const store = readStore();
  const n = store.custom.length + 1;
  const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
  const created = applyTicketPatch(
    ticketToScenario({
      ticket: 90,
      n,
      situation: patch.situation,
      address: patch.address,
    }),
    { ...patch, code: patch.code?.trim() || `К.${n}` },
  );
  created.id = id;
  store.custom = [...store.custom, created];
  writeStore(store);
  return created;
}
