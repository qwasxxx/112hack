import { SCENARIOS } from '../data/scenarios';
import { pushAssignments } from './remote';

const KEY = 'sys112.assignments.v1';
const LEGACY_DEMO = new Set([
  'ags-01-1',
  'ags-01-2',
  'ags-01-3',
  'ags-02-1',
  'ags-02-2',
  'ags-02-3',
  'ags-03-1',
  'ags-03-2',
]);

export type AssignmentStore = {
  scenarioIds: string[];
  updatedAt: string;
  teacherLogin: string;
};

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function allCatalogIds(): string[] {
  return SCENARIOS.map((item) => item.id);
}

function isLegacyDemo(ids: string[]): boolean {
  return ids.length > 0 && ids.length <= 8 && ids.every((id) => LEGACY_DEMO.has(id));
}

function writeStore(store: AssignmentStore, sync = true): void {
  if (!canUseStorage()) {
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(store));
  if (sync) {
    pushAssignments(store);
  }
}

function defaultStore(teacherLogin = 'petrov'): AssignmentStore {
  return {
    scenarioIds: allCatalogIds(),
    updatedAt: new Date(0).toISOString(),
    teacherLogin,
  };
}

export function readAssignments(): AssignmentStore {
  const fallback = defaultStore();
  if (!canUseStorage()) {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      writeStore(fallback, true);
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<AssignmentStore>;
    const ids = Array.isArray(parsed.scenarioIds)
      ? parsed.scenarioIds.filter((id) => typeof id === 'string')
      : [];
    const teacherLogin = typeof parsed.teacherLogin === 'string' ? parsed.teacherLogin : fallback.teacherLogin;
    if (ids.length === 0 || isLegacyDemo(ids)) {
      const migrated = {
        scenarioIds: allCatalogIds(),
        updatedAt: new Date().toISOString(),
        teacherLogin,
      };
      writeStore(migrated, true);
      return migrated;
    }
    return {
      scenarioIds: ids,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
      teacherLogin,
    };
  } catch {
    return fallback;
  }
}

const KNOWN = () => new Set(SCENARIOS.map((item) => item.id));

export function assignedScenarioIds(_login?: string): string[] {
  const known = KNOWN();
  return readAssignments().scenarioIds.filter((id) => known.has(id));
}

export function assignScenario(id: string, teacherLogin = 'petrov'): void {
  if (!KNOWN().has(id)) {
    return;
  }
  const current = readAssignments();
  if (current.scenarioIds.includes(id)) {
    return;
  }
  writeStore({
    scenarioIds: [...current.scenarioIds, id],
    updatedAt: new Date().toISOString(),
    teacherLogin,
  });
}

export function unassignScenario(id: string, teacherLogin = 'petrov'): void {
  const current = readAssignments();
  writeStore({
    scenarioIds: current.scenarioIds.filter((item) => item !== id),
    updatedAt: new Date().toISOString(),
    teacherLogin,
  });
}

export function isScenarioAssigned(id: string): boolean {
  return assignedScenarioIds().includes(id);
}

export function replaceAssignments(store: AssignmentStore): void {
  if (isLegacyDemo(store.scenarioIds) || store.scenarioIds.length === 0) {
    writeStore(defaultStore(store.teacherLogin || 'petrov'), true);
    return;
  }
  writeStore(store, false);
}
