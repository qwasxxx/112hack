import { AGS_SCENARIOS, classifierNumberFor, publicTheme, ticketToScenario } from './ags-tickets';
import type { ServiceKind, TrainingScenario } from './scenarios';
import { pushCatalog } from '../progress/remote';

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
  hidden: string[];
};

export type CatalogImportResult = {
  added: number;
  updated: number;
};

const KEY = 'sys112.tickets.v1';

const emptyStore = (): CatalogStore => ({ overlays: {}, custom: [], hidden: [] });

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
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((item) => typeof item === 'string') : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: CatalogStore, sync = true): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(store));
  if (sync) {
    pushCatalog(store);
  }
}

export function replaceCatalogStore(store: { overlays?: unknown; custom?: unknown; hidden?: unknown }): void {
  writeStore(
    {
      overlays:
        store.overlays && typeof store.overlays === 'object' ? (store.overlays as CatalogStore['overlays']) : {},
      custom: Array.isArray(store.custom) ? (store.custom as TrainingScenario[]) : [],
      hidden: Array.isArray(store.hidden) ? store.hidden.filter((item) => typeof item === 'string') : [],
    },
    false,
  );
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
    classifierNumber: patch.classifierNumber?.trim() || classifierNumberFor(services, situation, address),
    checklist: patch.checklist?.length ? patch.checklist : rebuilt.checklist,
    difficulty: patch.difficulty || rebuilt.difficulty,
    ttsVoice: base.ttsVoice,
    summary: `Тренировка оператора 112. ${publicTheme(situation, services)}. Обстановку выясняете на линии.`,
  };
}

export function buildCatalog(): TrainingScenario[] {
  const store = readStore();
  const hidden = new Set(store.hidden);
  const ags = AGS_SCENARIOS.map((item) => {
    const patch = store.overlays[item.id];
    return patch ? applyTicketPatch(item, patch) : { ...item };
  });
  return [...ags, ...store.custom].filter((item) => !hidden.has(item.id));
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

export function deleteTicket(id: string): void {
  const store = readStore();
  store.custom = store.custom.filter((item) => item.id !== id);
  delete store.overlays[id];
  if (!store.hidden.includes(id)) {
    store.hidden = [...store.hidden, id];
  }
  writeStore(store);
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

const SERVICE_IDS: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];

function asServices(value: unknown): ServiceKind[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is ServiceKind => SERVICE_IDS.includes(item as ServiceKind));
}

function asPatch(item: Record<string, unknown>): TicketPatch | null {
  const situation = String(item.situation ?? item.description ?? '').trim();
  const address = String(item.address ?? item.location ?? '').trim();
  if (!situation && !address) {
    return null;
  }
  const difficulty = item.difficulty;
  return {
    title: String(item.title ?? '').trim() || undefined,
    code: String(item.code ?? '').trim() || undefined,
    situation,
    address,
    services: asServices(item.services),
    callerOpening: String(item.callerOpening ?? item.opening ?? '').trim() || undefined,
    classifierNumber: String(item.classifierNumber ?? item.classifier ?? '').trim() || undefined,
    difficulty:
      difficulty === 'базовый' || difficulty === 'стандарт' || difficulty === 'сложный' ? difficulty : undefined,
    checklist: Array.isArray(item.checklist)
      ? item.checklist.filter((row): row is string => typeof row === 'string')
      : undefined,
  };
}

export function parseCatalogImport(raw: string): { overlays: Record<string, TicketPatch>; tickets: Array<TicketPatch & { id?: string }> } {
  const parsed: unknown = JSON.parse(raw);
  const overlays: Record<string, TicketPatch> = {};
  const tickets: Array<TicketPatch & { id?: string }> = [];
  const bag = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  const overlaySrc =
    bag && bag.overlays && typeof bag.overlays === 'object' ? (bag.overlays as Record<string, unknown>) : {};
  for (const [id, value] of Object.entries(overlaySrc)) {
    if (value && typeof value === 'object') {
      const patch = asPatch(value as Record<string, unknown>);
      if (patch) {
        overlays[id] = patch;
      }
    }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(bag?.custom)
      ? bag.custom
      : Array.isArray(bag?.tickets)
        ? bag.tickets
        : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const rec = row as Record<string, unknown>;
    const patch = asPatch(rec);
    if (!patch) {
      continue;
    }
    tickets.push({ ...patch, id: typeof rec.id === 'string' ? rec.id : undefined });
  }
  return { overlays, tickets };
}

export function applyCatalogImport(raw: string): CatalogImportResult {
  const parsed = parseCatalogImport(raw);
  const store = readStore();
  let updated = 0;
  let added = 0;
  for (const [id, patch] of Object.entries(parsed.overlays)) {
    store.overlays[id] = patch;
    updated += 1;
  }
  for (const ticket of parsed.tickets) {
    if (ticket.id && (AGS_SCENARIOS.some((item) => item.id === ticket.id) || store.custom.some((item) => item.id === ticket.id))) {
      if (store.custom.some((item) => item.id === ticket.id)) {
        const base = store.custom.find((item) => item.id === ticket.id);
        if (base) {
          store.custom = store.custom.map((item) => (item.id === ticket.id ? applyTicketPatch(item, ticket) : item));
          updated += 1;
        }
      } else {
        store.overlays[ticket.id] = ticket;
        updated += 1;
      }
      continue;
    }
    const n = store.custom.length + 1;
    const created = applyTicketPatch(
      ticketToScenario({ ticket: 90, n, situation: ticket.situation, address: ticket.address }),
      { ...ticket, code: ticket.code?.trim() || `К.${n}` },
    );
    created.id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    store.custom = [...store.custom, created];
    added += 1;
  }
  writeStore(store);
  return { added, updated };
}

export function exportCatalogJson(): string {
  return JSON.stringify(readStore(), null, 2);
}
