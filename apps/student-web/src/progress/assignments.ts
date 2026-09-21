import { SCENARIOS } from '../data/scenarios';
import { pushAssignments } from './remote';

const KEY = 'sys112.assignments.v1';
const DEMO_COUNT = 8;

export type AssignmentStore = {
  scenarioIds: string[];
  updatedAt: string;
  teacherLogin: string;
};

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
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

export function readAssignments(): AssignmentStore {
  const fallback: AssignmentStore = {
    scenarioIds: SCENARIOS.slice(0, DEMO_COUNT).map((item) => item.id),
    updatedAt: new Date(0).toISOString(),
    teacherLogin: 'petrov',
  };
  if (!canUseStorage()) {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      writeStore(fallback, false);
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<AssignmentStore>;
    const ids = Array.isArray(parsed.scenarioIds)
      ? parsed.scenarioIds.filter((id) => typeof id === 'string')
      : [];
    if (ids.length === 0 && !raw.includes('"scenarioIds"')) {
      writeStore(fallback, false);
      return fallback;
    }
    return {
      scenarioIds: ids,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
      teacherLogin: typeof parsed.teacherLogin === 'string' ? parsed.teacherLogin : fallback.teacherLogin,
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
  writeStore(store, false);
}
