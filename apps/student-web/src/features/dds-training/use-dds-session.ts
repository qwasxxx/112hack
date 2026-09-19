import { useMemo, useState } from 'react';
import type { ServiceKind, TrainingScenario } from '../../data/scenarios';
import { fromDdsExercise } from '../arm112-simulator/model/learning-result';
import { buildIncoming, cardFromDraft, incidentFromViewModel } from './adapter';
import { scoreDds, type DdsDraft } from './incoming-card';
import type { DdsLoggedAction, DdsQueueItemState } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

export type DdsCheckResult = {
  servicesOk: boolean;
  injuredOk: boolean;
  phoneOk: boolean;
  extra: ServiceKind[];
  missing: ServiceKind[];
  elapsedMs: number;
};

export function useDdsSession(scenario: TrainingScenario) {
  const startedAt = useMemo(() => nowIso(), []);
  const exerciseId = useMemo(() => crypto.randomUUID(), [scenario.id]);
  const incoming = useMemo(() => buildIncoming(scenario), [scenario]);
  const [draft, setDraft] = useState<DdsDraft>(incoming.draft);
  const [state, setState] = useState<DdsQueueItemState>('queued');
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [actions, setActions] = useState<DdsLoggedAction[]>([]);
  const [result, setResult] = useState<DdsCheckResult | null>(null);
  const [learning, setLearning] = useState<ReturnType<typeof fromDdsExercise> | null>(null);

  const card = useMemo(
    () => cardFromDraft(scenario, draft, incoming.card.number, incoming.card.createdAt),
    [draft, incoming.card.createdAt, incoming.card.number, scenario],
  );

  function log(type: DdsLoggedAction['type'], detail: string) {
    setActions((current) => [...current, { at: nowIso(), cardId: card.id, type, detail }]);
  }

  function patch(next: Partial<DdsDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function toggleService(kind: ServiceKind) {
    setDraft((current) => {
      const selected = current.services.includes(kind)
        ? current.services.filter((item) => item !== kind)
        : [...current.services, kind];
      return { ...current, services: selected };
    });
    log('status_change', kind);
  }

  function openCard() {
    if (!openedAt) {
      setOpenedAt(nowIso());
    }
    setState('selected');
    log('open_card', card.number);
  }

  function closeCard() {
    if (result) {
      return;
    }
    setState('queued');
    log('close_card', card.number);
  }

  function dispatchCard() {
    const finishedAt = nowIso();
    const opened = openedAt ?? startedAt;
    const check = {
      ...scoreDds(draft, incoming.facts),
      elapsedMs: Math.max(0, Date.parse(finishedAt) - Date.parse(opened)),
    };
    setResult(check);
    setState('completed');
    log('complete_card', check.servicesOk ? 'направлены верно' : 'ошибка служб');
    setLearning(
      fromDdsExercise({
        scenarioId: scenario.id,
        startedAt,
        finishedAt,
        elapsedMs: check.elapsedMs,
        actions: actions.map((item) => ({ at: item.at, type: item.type, detail: item.detail })),
        cards: [incidentFromViewModel(card)],
      }),
    );
  }

  return {
    exerciseId,
    card,
    draft,
    facts: incoming.facts,
    defects: incoming.defects,
    state,
    view: (state === 'queued' ? 'journal' : 'card') as 'journal' | 'card',
    result,
    learning,
    allDone: Boolean(result),
    patch,
    toggleService,
    openCard,
    closeCard,
    dispatchCard,
    startedAt,
    items: [{ card, state }],
  };
}
