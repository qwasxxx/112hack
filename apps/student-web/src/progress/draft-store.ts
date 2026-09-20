import type { CallSession, IncidentCard } from '../features/arm112-simulator/model/arm112-models';

export type ArmDraft = {
  scenarioId: string;
  savedAt: string;
  phase: CallSession['phase'];
  card: IncidentCard;
  incomingAcceptedAt: string | null;
  telephonyStatus: CallSession['telephonyStatus'];
};

const keyFor = (login: string, scenarioId: string) => `sys112.draft.arm.v1.${login}.${scenarioId}`;

export function readArmDraft(login: string, scenarioId: string): ArmDraft | null {
  if (typeof localStorage === 'undefined' || !login) {
    return null;
  }
  try {
    const raw = localStorage.getItem(keyFor(login, scenarioId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ArmDraft;
    if (parsed.scenarioId !== scenarioId) {
      return null;
    }
    if (parsed.phase === 'завершена' || parsed.phase === 'просмотр карточки') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeArmDraft(login: string, draft: ArmDraft) {
  if (typeof localStorage === 'undefined' || !login) {
    return;
  }
  localStorage.setItem(keyFor(login, draft.scenarioId), JSON.stringify(draft));
}

export function clearArmDraft(login: string, scenarioId: string) {
  if (typeof localStorage === 'undefined' || !login) {
    return;
  }
  localStorage.removeItem(keyFor(login, scenarioId));
}
