import { useMemo, useState } from 'react';
import type { ServiceKind, TrainingScenario } from '../../data/scenarios';
import {
  buildDdsShift,
  ddsWorkplaceHint,
  ddsWorkplaceName,
  type DdsLaneId,
  type DdsShiftRole,
  type DdsShiftSource,
} from '../../dds-lanes';
import { fromDdsExercise } from '../arm112-simulator/model/learning-result';
import { buildIncoming, cardFromDraft, incidentFromViewModel } from './adapter';
import { journalIncidentLine } from './display';
import { scoreDds, type DdsDraft, type TicketFacts } from './incoming-card';
import {
  ddsStatusNeedsText,
  isDdsTerminal,
  nextDdsStatuses,
  type DdsCardDecision,
  type DdsLoggedAction,
  type DdsQueueItemState,
  type DdsServiceStatus,
  type DdsStatusEvent,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function stampNow(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function clockHm(): string {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export type DdsStatusForm = {
  status: DdsServiceStatus;
  naryad: string;
  comment: string;
};

export type DdsQueueCard = {
  id: string;
  scenario: TrainingScenario;
  role: DdsShiftRole;
  source: DdsShiftSource;
  facts: TicketFacts;
  defects: ReturnType<typeof buildIncoming>['defects'];
  draft: DdsDraft;
  number: string;
  createdAt: string;
  state: DdsQueueItemState;
  queuedAt: string;
  openedAt: string | null;
  openMs: number | null;
  firstRecordMs: number | null;
  decision: DdsCardDecision | null;
  elapsedMs: number;
  chiefCalled: boolean;
  crewCalled: boolean;
  crewInbound?: 'accepted' | 'declined' | 'missed';
  reportedTo112: boolean;
  workplaceStatus: DdsServiceStatus;
  naryad: string;
  history: DdsStatusEvent[];
  callbackDone: boolean;
  contacts: { service: string; said: string }[];
  dialogue: { speaker: string; role: 'operator' | 'caller'; text: string }[];
  editingStatus: boolean;
  statusForm: DdsStatusForm;
  chs: boolean;
  chp: boolean;
};

export type DdsCardScore = {
  id: string;
  role: DdsShiftRole;
  decision: DdsCardDecision;
  servicesOk: boolean;
  injuredOk: boolean;
  phoneOk: boolean;
  extra: ServiceKind[];
  missing: ServiceKind[];
  elapsedMs: number;
  ok: boolean;
};

export type DdsCheckResult = {
  servicesOk: boolean;
  injuredOk: boolean;
  phoneOk: boolean;
  extra: ServiceKind[];
  missing: ServiceKind[];
  elapsedMs: number;
  cards: DdsCardScore[];
  transferredOk: boolean;
};

function sourceCaption(source: DdsShiftSource): string {
  if (source === '112') {
    return 'Карточка от оператора 112';
  }
  if (source === 'lane') {
    return 'Лента смены';
  }
  return 'Карточка другой ДДС';
}

function emptyForm(status: DdsServiceStatus, naryad: string): DdsStatusForm {
  const options = nextDdsStatuses(status);
  return {
    status: options[0] ?? status,
    naryad,
    comment: '',
  };
}

export function useDdsSession(scenario: TrainingScenario, lane: DdsLaneId) {
  const startedAt = useMemo(() => nowIso(), []);
  const exerciseId = useMemo(() => crypto.randomUUID(), [scenario.id, lane]);
  const workplace = ddsWorkplaceName(lane);
  const hint = ddsWorkplaceHint(lane);
  const initial = useMemo(() => {
    return buildDdsShift(scenario, lane).map((ticket, index) => {
      const id = `dds-${ticket.scenario.id}-${index}`;
      const incoming = buildIncoming(ticket.scenario, id);
      const created = incoming.card.createdAt;
      return {
        id,
        scenario: ticket.scenario,
        role: ticket.role,
        source: ticket.source,
        facts: incoming.facts,
        defects: incoming.defects,
        draft: incoming.draft,
        number: incoming.card.number,
        createdAt: created,
        state: 'queued' as DdsQueueItemState,
        queuedAt: startedAt,
        openedAt: null,
        openMs: null,
        firstRecordMs: null,
        decision: null,
        elapsedMs: 0,
        chiefCalled: false,
        crewCalled: false,
        reportedTo112: false,
        workplaceStatus: 'Добавлена' as DdsServiceStatus,
        naryad: '',
        history: [
          {
            at: created,
            status: 'Добавлена' as DdsServiceStatus,
            comment: 'Передано оператором 112',
            naryad: '',
            operatorLabel: 'оп. 112',
          },
        ],
        callbackDone: false,
        contacts: [],
        dialogue: [],
        editingStatus: false,
        statusForm: emptyForm('Добавлена', ''),
        chs: false,
        chp: false,
      } satisfies DdsQueueCard;
    });
  }, [lane, scenario]);
  const [cards, setCards] = useState<DdsQueueCard[]>(initial);
  const [formError, setFormError] = useState<string | null>(null);
  const [routeHint, setRouteHint] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [actions, setActions] = useState<DdsLoggedAction[]>([]);
  const [result, setResult] = useState<DdsCheckResult | null>(null);

  const active = cards.find((item) => item.id === activeId) ?? null;
  const card = active
    ? cardFromDraft(active.scenario, active.draft, active.number, active.createdAt, active.id)
    : cardFromDraft(
        cards[0].scenario,
        cards[0].draft,
        cards[0].number,
        cards[0].createdAt,
        cards[0].id,
      );

  function log(type: DdsLoggedAction['type'], detail: string, cardId = activeId ?? card.id) {
    setActions((current) => [...current, { at: nowIso(), cardId, type, detail }]);
  }

  function patchQueue(id: string, update: (item: DdsQueueCard) => DdsQueueCard) {
    setCards((current) => current.map((item) => (item.id === id ? update(item) : item)));
  }

  function patch(next: Partial<DdsDraft>) {
    if (!activeId) {
      return;
    }
    const own: Partial<DdsDraft> = {};
    if (next.services) {
      own.services = next.services;
    }
    if (!Object.keys(own).length) {
      setRouteHint('Поля карточки 112 не правятся. Ошибку называет бригада, затем звонок в 112.');
      return;
    }
    patchQueue(activeId, (item) => ({ ...item, draft: { ...item.draft, ...own } }));
  }

  function toggleService(kind: ServiceKind) {
    if (!activeId) {
      return;
    }
    patchQueue(activeId, (item) => {
      const selected = item.draft.services.includes(kind)
        ? item.draft.services.filter((entry) => entry !== kind)
        : [...item.draft.services, kind];
      return { ...item, draft: { ...item.draft, services: selected } };
    });
    log('status_change', kind);
  }

  function openCard(id?: string) {
    const target = cards.find((item) => item.id === (id ?? cards[0]?.id));
    if (!target || result || target.decision) {
      return;
    }
    setActiveId(target.id);
    if (!target.openedAt) {
      patchQueue(target.id, (item) => ({
        ...item,
        openedAt: nowIso(),
        openMs: Math.max(0, Date.now() - Date.parse(item.queuedAt)),
        state: 'selected',
        workplaceStatus: item.workplaceStatus === 'Добавлена' ? 'Получена службой' : item.workplaceStatus,
        history:
          item.workplaceStatus === 'Добавлена'
            ? [
                ...item.history,
                {
                  at: stampNow(),
                  status: 'Получена службой',
                  comment: 'Подтверждение приёма карточки в систему 112',
                  naryad: '',
                  operatorLabel: 'оп. ддс',
                },
              ]
            : item.history,
      }));
      log('open_card', target.number, target.id);
      return;
    }
    if (target.state === 'queued') {
      patchQueue(target.id, (item) => ({ ...item, state: 'selected' }));
    }
    log('open_card', target.number, target.id);
  }

  function closeCard() {
    if (!activeId || result) {
      return;
    }
    const current = cards.find((item) => item.id === activeId);
    if (current && isDdsTerminal(current.workplaceStatus) && !current.decision) {
      if (current.role === 'own' && current.workplaceStatus === 'Работы завершены') {
        if (!current.chiefCalled || !current.crewCalled) {
          setRouteHint('Перед завершением позвоните начальнику и руководителю бригады.');
          return;
        }
        if (current.defects.length > 0 && !current.reportedTo112) {
          setRouteHint('В карточке ошибка. Её называет бригада, затем сообщите об этом в 112. Поля сами не правятся.');
          return;
        }
      }
      finishCard(
        current.workplaceStatus === 'Не принято' ||
          (current.role === 'foreign' && current.workplaceStatus !== 'Работы завершены')
          ? 'transfer'
          : 'dispatch',
      );
      return;
    }
    if (current && current.state !== 'completed' && current.state !== 'transferred') {
      patchQueue(activeId, (item) => ({ ...item, state: 'queued', editingStatus: false }));
    }
    log('close_card', card.number);
    setActiveId(null);
  }

  function startStatusEdit() {
    if (!activeId || result) {
      return;
    }
    patchQueue(activeId, (item) => {
      const options = nextDdsStatuses(item.workplaceStatus);
      if (!options.length) {
        return item;
      }
      return {
        ...item,
        state: 'editing',
        editingStatus: true,
        statusForm: emptyForm(item.workplaceStatus, item.naryad),
      };
    });
    log('start_edit', 'статус службы');
  }

  function cancelStatusEdit() {
    if (!activeId) {
      return;
    }
    patchQueue(activeId, (item) => ({ ...item, editingStatus: false, state: 'selected' }));
    log('cancel_edit', 'статус службы');
  }

  function patchStatusForm(next: Partial<DdsStatusForm>) {
    if (!activeId) {
      return;
    }
    patchQueue(activeId, (item) => ({ ...item, statusForm: { ...item.statusForm, ...next } }));
    if (typeof next.comment === 'string' && next.comment.trim().length >= 4) {
      setFormError(null);
    }
  }

  function applyStatus() {
    if (!activeId) {
      return;
    }
    let applied = '';
    let missingText = false;
    patchQueue(activeId, (item) => {
      const allowed = nextDdsStatuses(item.workplaceStatus);
      const next = allowed.includes(item.statusForm.status) ? item.statusForm.status : allowed[0];
      if (!next) {
        return item;
      }
      const naryad = item.statusForm.naryad.trim();
      const comment = item.statusForm.comment.trim();
      if (ddsStatusNeedsText(item.workplaceStatus, next) && comment.length < 4) {
        missingText = true;
        return item;
      }
      applied = `${next}${naryad ? ` · наряд ${naryad}` : ''}${comment ? ` · ${comment}` : ''}`;
      return {
        ...item,
        workplaceStatus: next,
        naryad: naryad || item.naryad,
        firstRecordMs:
          item.firstRecordMs ??
          (comment ? Math.max(0, Date.now() - Date.parse(item.queuedAt)) : null),
        editingStatus: false,
        state: 'selected',
        history: [
          ...item.history,
          {
            at: stampNow(),
            status: next,
            comment,
            naryad,
            operatorLabel: 'оп. ддс',
          },
        ],
      };
    });
    setFormError(
      missingText
        ? 'Нужно указать комментарий.'
        : null,
    );
    if (applied) {
      log('confirm_status', applied);
    }
  }

  function toggleMark(key: 'chs' | 'chp') {
    if (!activeId) {
      return;
    }
    patchQueue(activeId, (item) => ({ ...item, [key]: !item[key] }));
    log('status_change', key);
  }

  function recordContact(service: string, said: string) {
    if (!activeId) {
      return;
    }
    const text = said.trim();
    if (!text) {
      return;
    }
    patchQueue(activeId, (item) => ({
      ...item,
      contacts: [...item.contacts, { service, said: text }],
    }));
    log('service_call', `${service}: ${text.slice(0, 180)}`);
  }

  function appendDialogue(lines: { speaker: string; role: 'operator' | 'caller'; text: string }[]) {
    if (!activeId || !lines.length) {
      return;
    }
    patchQueue(activeId, (item) => ({
      ...item,
      dialogue: [...item.dialogue, ...lines],
    }));
  }

  function markCrewInbound(id: string, outcome: 'accepted' | 'declined' | 'missed') {
    const current = cards.find((item) => item.id === id);
    if (!current || current.crewInbound) {
      return;
    }
    patchQueue(id, (item) => ({ ...item, crewInbound: outcome }));
    if (outcome === 'accepted') {
      setRouteHint('Бригада доложила о выезде. Поставьте статус «Начало реагирования».');
    }
    log('service_call', `входящий доклад бригады: ${outcome}`);
  }

  function markRoute(kind: 'chief' | 'crew' | '112') {
    if (!activeId) {
      return;
    }
    const current = cards.find((item) => item.id === activeId);
    patchQueue(activeId, (item) => ({
      ...item,
      chiefCalled: kind === 'chief' ? true : item.chiefCalled,
      crewCalled: kind === 'crew' ? true : item.crewCalled,
      reportedTo112: kind === '112' ? true : item.reportedTo112,
    }));
    if (kind === 'crew') {
      setRouteHint(
        current && current.defects.length > 0
          ? 'Бригада на месте. Если назвала ошибку в карточке — сообщите о ней в 112. Затем «Прибытие» и «Проведение работ».'
          : 'Бригада на месте, работы идут. Поставьте «Прибытие», затем «Проведение работ».',
      );
    }
    log('service_call', kind === '112' ? 'сообщение в 112' : kind === 'crew' ? 'бригада' : 'начальник');
  }

  function markCallback() {
    if (!activeId) {
      return;
    }
    patchQueue(activeId, (item) => ({ ...item, callbackDone: true }));
    log('callback', 'обратный звонок заявителю');
  }

  function finishCard(decision: DdsCardDecision) {
    if (!active || result) {
      return;
    }
    const finishedAt = nowIso();
    const opened = active.openedAt ?? startedAt;
    const elapsedMs = Math.max(0, Date.parse(finishedAt) - Date.parse(opened));
    const nextState: DdsQueueItemState = decision === 'transfer' ? 'transferred' : 'completed';
    setCards((current) =>
      current.map((item) =>
        item.id === active.id
          ? { ...item, state: nextState, decision, elapsedMs, editingStatus: false }
          : item,
      ),
    );
    log(
      decision === 'transfer' ? 'transfer_card' : 'close_to_112',
      decision === 'transfer' ? active.number : `${active.number} · ${active.workplaceStatus}`,
    );
    setActiveId(null);
  }

  function canComplete(item: DdsQueueCard | null = active): boolean {
    if (!item || item.decision) {
      return false;
    }
    return (
      item.workplaceStatus === 'Работы завершены' ||
      item.workplaceStatus === 'Отказ от выполнения работ' ||
      item.workplaceStatus === 'Не принято'
    );
  }

  function completeActive() {
    if (!active) {
      return;
    }
    if (active.role === 'foreign' && active.workplaceStatus !== 'Работы завершены') {
      finishCard('transfer');
      return;
    }
    finishCard('dispatch');
  }

  function closeShift() {
    if (result || !cards.every((item) => item.decision)) {
      return;
    }
    const scores: DdsCardScore[] = cards.map((item) => {
      const scored = scoreDds(item.draft, item.facts);
      const ownOk =
        item.decision === 'dispatch' &&
        scored.injuredOk &&
        scored.phoneOk &&
        item.workplaceStatus === 'Работы завершены' &&
        Boolean(item.naryad.trim());
      const foreignOk = item.decision === 'transfer' || item.workplaceStatus === 'Не принято';
      const ok = item.role === 'foreign' ? foreignOk : ownOk;
      return {
        id: item.id,
        role: item.role,
        decision: item.decision ?? 'dispatch',
        ...scored,
        elapsedMs: item.elapsedMs,
        ok,
      };
    });
    const extra = scores.flatMap((item) => item.extra);
    const missing = scores.flatMap((item) => item.missing);
    setResult({
      servicesOk: scores.filter((item) => item.role === 'own').every((item) => item.servicesOk),
      injuredOk: scores.filter((item) => item.role === 'own').every((item) => item.injuredOk),
      phoneOk: scores.filter((item) => item.role === 'own').every((item) => item.phoneOk),
      extra,
      missing,
      elapsedMs: scores.reduce((sum, item) => sum + item.elapsedMs, 0),
      cards: scores,
      transferredOk: scores.filter((item) => item.role === 'foreign').every((item) => item.ok),
    });
  }

  const learning = result
    ? fromDdsExercise({
        scenarioId: scenario.id,
        startedAt,
        finishedAt: nowIso(),
        elapsedMs: result.elapsedMs,
        actions: actions.map((item) => ({ at: item.at, type: item.type, detail: item.detail })),
        cards: cards.map((item) =>
          incidentFromViewModel(
            cardFromDraft(item.scenario, item.draft, item.number, item.createdAt, item.id),
          ),
        ),
      })
    : null;

  return {
    exerciseId,
    workplace,
    hint,
    lane,
    card,
    draft: active?.draft ?? cards[0].draft,
    facts: active?.facts ?? cards[0].facts,
    defects: active?.defects ?? cards[0].defects,
    role: active?.role ?? cards[0].role,
    sourceLabel: sourceCaption(active?.source ?? cards[0].source),
    state: active?.state ?? 'queued',
    view: (activeId ? 'card' : 'journal') as 'journal' | 'card',
    activeId,
    result,
    learning,
    allDone: cards.every((item) => Boolean(item.decision)) && !result,
    workplaceStatus: active?.workplaceStatus ?? 'Добавлена',
    naryad: active?.naryad ?? '',
    history: active?.history ?? [],
    editingStatus: active?.editingStatus ?? false,
    statusForm: active?.statusForm ?? emptyForm('Добавлена', ''),
    statusOptions: nextDdsStatuses(active?.workplaceStatus ?? 'Добавлена'),
    callbackDone: active?.callbackDone ?? false,
    formError,
    routeHint,
    markRoute,
    markCrewInbound,
    chs: active?.chs ?? false,
    chp: active?.chp ?? false,
    canComplete: canComplete(active),
    canEditStatus: Boolean(active && nextDdsStatuses(active.workplaceStatus).length),
    completeActive,
    patch,
    toggleService,
    openCard,
    closeCard,
    startStatusEdit,
    cancelStatusEdit,
    patchStatusForm,
    applyStatus,
    markCallback,
    recordContact,
    appendDialogue,
    toggleMark,
    dispatchCard: () => finishCard('dispatch'),
    transferCard: () => finishCard('transfer'),
    closeShift,
    startedAt,
    items: cards.map((item) => {
      const card = cardFromDraft(item.scenario, item.draft, item.number, item.createdAt, item.id);
      return {
        card,
        state: item.state,
        role: item.role,
        source: item.source,
        sourceLabel: sourceCaption(item.source),
        workplaceStatus: item.workplaceStatus,
        chs: item.chs,
        chp: item.chp,
        shortLine: journalIncidentLine(item.scenario.title, card.classifierClass),
      };
    }),
    queue: cards,
    clockHm,
    isTerminal: isDdsTerminal(active?.workplaceStatus ?? 'Добавлена'),
  };
}
