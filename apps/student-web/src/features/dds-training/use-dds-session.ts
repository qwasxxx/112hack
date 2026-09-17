import { useMemo, useState } from 'react';
import type { TrainingScenario } from '../../data/scenarios';
import { buildDdsQueue, incidentFromViewModel } from './adapter';
import { fromDdsExercise } from '../arm112-simulator/model/learning-result';
import {
  DDS_TERMINAL_STATUSES,
  type DdsExerciseResult,
  type DdsIncidentCardViewModel,
  type DdsLoggedAction,
  type DdsQueueItemState,
  type DdsServiceStatus,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function stamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function clockHm(): string {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function action(cardId: string, type: DdsLoggedAction['type'], detail: string): DdsLoggedAction {
  return { at: nowIso(), cardId, type, detail };
}

type CardRuntime = {
  card: DdsIncidentCardViewModel;
  state: DdsQueueItemState;
  openedAt: string | null;
  completedAt: string | null;
  textEntries: string[];
  statusTransitions: Array<{ from: DdsServiceStatus; to: DdsServiceStatus; at: string }>;
  actions: DdsLoggedAction[];
};

export function useDdsSession(scenario: TrainingScenario) {
  const startedAt = useMemo(() => nowIso(), []);
  const exerciseId = useMemo(() => crypto.randomUUID(), []);
  const [items, setItems] = useState<CardRuntime[]>(() =>
    buildDdsQueue(scenario).map((card) => ({
      card,
      state: 'queued',
      openedAt: null,
      completedAt: null,
      textEntries: [],
      statusTransitions: [],
      actions: [],
    })),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DdsServiceStatus>('Принята');
  const [draftComment, setDraftComment] = useState('');
  const [draftNaryad, setDraftNaryad] = useState('');
  const [result, setResult] = useState<DdsExerciseResult | null>(null);
  const [learning, setLearning] = useState<ReturnType<typeof fromDdsExercise> | null>(null);
  const [globalActions, setGlobalActions] = useState<DdsLoggedAction[]>([]);

  const active = items.find((item) => item.card.id === activeId) ?? null;

  function pushGlobal(entries: DdsLoggedAction[]) {
    setGlobalActions((current) => [...current, ...entries]);
  }

  function patchCard(cardId: string, updater: (item: CardRuntime) => CardRuntime) {
    setItems((current) => current.map((item) => (item.card.id === cardId ? updater(item) : item)));
  }

  function editableService(card: DdsIncidentCardViewModel) {
    return card.services.find((item) => item.editable) ?? card.services[0];
  }

  function openCard(cardId: string) {
    const at = nowIso();
    const entry = action(cardId, 'open_card', cardId);
    patchCard(cardId, (item) => {
      const received = item.card.services.map((service) => {
        if (!service.editable || service.history.some((event) => event.status === 'Получена службой')) {
          return service;
        }
        return {
          ...service,
          status: 'Получена службой' as const,
          statusTime: clockHm(),
          history: [
            ...service.history,
            {
              at: stamp(),
              status: 'Получена службой' as const,
              comment: '',
              naryad: '',
              operatorLabel: 'оп. 0',
            },
          ],
        };
      });
      return {
        ...item,
        card: { ...item.card, services: received },
        state: item.state === 'completed' ? 'completed' : 'selected',
        openedAt: item.openedAt ?? at,
        actions: [...item.actions, { ...entry, detail: item.card.number }],
      };
    });
    pushGlobal([{ ...entry, detail: 'open' }]);
    setActiveId(cardId);
    setEditing(false);
    setHistoryOpen(false);
  }

  function closeCard() {
    if (!active) {
      return;
    }
    const entry = action(active.card.id, 'close_card', active.card.number);
    patchCard(active.card.id, (item) => ({
      ...item,
      state: item.state === 'completed' ? 'completed' : 'queued',
      actions: [...item.actions, entry],
    }));
    pushGlobal([entry]);
    setActiveId(null);
    setEditing(false);
    setHistoryOpen(false);
  }

  function startEdit() {
    if (!active) {
      return;
    }
    const service = editableService(active.card);
    const first =
      service?.status === 'Добавлена' || service?.status === 'Получена службой' || service?.status === 'Не принято';
    setDraftStatus(first ? 'Принята' : 'Начало реагирования');
    setDraftComment('');
    setDraftNaryad(service?.history.at(-1)?.naryad || '23');
    setEditing(true);
    const entry = action(active.card.id, 'start_edit', 'карандаш / статус');
    patchCard(active.card.id, (item) => ({
      ...item,
      state: item.state === 'completed' ? 'completed' : 'editing',
      actions: [...item.actions, entry],
    }));
    pushGlobal([entry]);
  }

  function cancelEdit() {
    if (!active) {
      return;
    }
    const entry = action(active.card.id, 'cancel_edit', '');
    patchCard(active.card.id, (item) => ({
      ...item,
      state: item.state === 'completed' ? 'completed' : 'selected',
      actions: [...item.actions, entry],
    }));
    pushGlobal([entry]);
    setEditing(false);
  }

  function confirmStatus() {
    if (!active) {
      return;
    }
    const at = nowIso();
    const comment = draftComment.trim();
    const naryad = draftNaryad.trim();
    const to = draftStatus;
    const service = editableService(active.card);
    if (!service) {
      return;
    }
    const from = service.status;
    const terminal = DDS_TERMINAL_STATUSES.includes(to);
    const local = [
      action(active.card.id, 'status_change', `${from} → ${to}`),
      ...(comment ? [action(active.card.id, 'comment', comment)] : []),
      ...(naryad ? [action(active.card.id, 'naryad', naryad)] : []),
      action(active.card.id, 'confirm_status', to),
      ...(terminal ? [action(active.card.id, 'complete_card', to)] : []),
    ];
    patchCard(active.card.id, (item) => ({
      ...item,
      card: {
        ...item.card,
        services: item.card.services.map((chip) =>
          chip.id === service.id
            ? {
                ...chip,
                status: to,
                statusTime: clockHm(),
                history: [
                  ...chip.history,
                  {
                    at: stamp(),
                    status: to,
                    comment,
                    naryad,
                    operatorLabel: 'оп. 0',
                  },
                ],
              }
            : chip,
        ),
      },
      state: terminal ? 'completed' : 'selected',
      completedAt: terminal ? at : item.completedAt,
      textEntries: comment ? [...item.textEntries, comment] : item.textEntries,
      statusTransitions: [...item.statusTransitions, { from, to, at }],
      actions: [...item.actions, ...local],
    }));
    pushGlobal(local);
    setEditing(false);
    setHistoryOpen(!terminal);
    if (terminal) {
      const nextId = items.find((item) => item.card.id !== active.card.id && item.state !== 'completed')?.card.id ?? null;
      if (nextId) {
        window.setTimeout(() => openCard(nextId), 0);
      } else {
        setActiveId(null);
      }
    }
  }

  function finishExercise() {
    const finishedAt = nowIso();
    const payload: DdsExerciseResult = {
      exerciseId,
      scenarioId: scenario.id,
      startedAt,
      finishedAt,
      elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
      cards: items.map((item) => {
        const opened = item.openedAt ? Date.parse(item.openedAt) : Date.parse(startedAt);
        const closed = item.completedAt ? Date.parse(item.completedAt) : Date.parse(finishedAt);
        const service = editableService(item.card);
        return {
          cardId: item.card.id,
          number: item.card.number,
          scenarioId: item.card.scenarioId,
          openedAt: item.openedAt,
          completedAt: item.completedAt,
          elapsedMs: Math.max(0, closed - opened),
          finalStatus: service?.status ?? 'Добавлена',
          textEntries: item.textEntries,
          statusTransitions: item.statusTransitions,
          actions: item.actions,
        };
      }),
      actions: globalActions,
    };
    setResult(payload);
    setLearning(
      fromDdsExercise({
        scenarioId: scenario.id,
        startedAt,
        finishedAt,
        elapsedMs: payload.elapsedMs,
        actions: globalActions.map((item) => ({ at: item.at, type: item.type, detail: item.detail })),
        cards: items.map((item) => incidentFromViewModel(item.card)),
      }),
    );
  }

  const pending = items.filter((item) => item.state !== 'completed');

  return {
    items,
    active,
    view: (active ? 'card' : 'journal') as 'journal' | 'card',
    editing,
    historyOpen,
    setHistoryOpen,
    draftStatus,
    setDraftStatus,
    draftComment,
    setDraftComment,
    draftNaryad,
    setDraftNaryad,
    result,
    learning,
    allDone: items.length > 0 && pending.length === 0,
    openCard,
    closeCard,
    startEdit,
    cancelEdit,
    confirmStatus,
    finishExercise,
    nextPendingId: pending[0]?.card.id ?? null,
    startedAt,
  };
}
