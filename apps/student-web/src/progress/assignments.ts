import { SCENARIOS } from '../data/scenarios';

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

function writeStore(store: AssignmentStore): void {
  if (!canUseStorage()) {
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(store));
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
      writeStore(fallback);
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<AssignmentStore>;
    const ids = Array.isArray(parsed.scenarioIds)
      ? parsed.scenarioIds.filter((id) => typeof id === 'string')
      : [];
    if (ids.length === 0 && !raw.includes('"scenarioIds"')) {
      writeStore(fallback);
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

export function assignedScenarioIds(_login?: string): string[] {
  return readAssignments().scenarioIds;
}

export function assignScenario(id: string, teacherLogin = 'petrov'): void {
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
