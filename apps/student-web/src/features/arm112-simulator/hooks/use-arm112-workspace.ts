import { useEffect, useMemo, useState } from 'react';
import type { TrainingScenario } from '../../../data/scenarios';
import {
  EVIDENCED_SIGNIFICANT_TYPES,
  EVIDENCED_WHAT_HAPPENED_CHIPS,
  EVIDENCED_WHAT_HAPPENED_SEARCH_HITS,
} from '../data/evidenced-questionnaires';
import { displayTypeTitle, pruneHiddenAnswers, questionnaireForType } from '../data/questionnaire-lookup';
import {
  assignedServices,
  childOptions,
  exactPriznakMatch,
  matchRecords,
  resolveLabel,
  uniqueServiceCatalog,
  type ClassifierFilter,
  type ServiceFlags,
} from '../data/classifier-runtime';
import { PHASE_AFTER_INCOMING_ACCEPT } from '../../../lesson-routing';
import { trainingBindingFor } from '../data/training-bindings';
import { EVIDENCED_SERVICES, mapClassifierServiceName, type EvidencedService } from '../data/ui-catalog';
import type { CallSession, CallerStatus, ClassifierPath, IncidentCard, ServiceAssignment } from '../model/arm112-models';
import { CALLER_STATUSES } from '../model/arm112-models';
import { createEmptyIncidentCard } from '../model/factories';
import { buildPracticalResult, type Arm112PracticalResult, type TrainingAction } from '../model/training-result';
import { readArmDraft, writeArmDraft } from '../../../progress/draft-store';
import { incomingChannelFor, smsFromTicket } from '../../../progress/ticket-facts';

export type ArmUiModal =
  | 'none'
  | 'services'
  | 'map'
  | 'empty-card'
  | 'injured'
  | 'reminder'
  | 'recordings'
  | 'sms'
  | 'save';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatTimer(seconds: number): string {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${p(d.getFullYear())} в ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

const emptyClassifier = (): ClassifierPath => ({
  groupCode: null,
  priznak1: null,
  priznak2: [],
  priznak3: [],
  extraTags: [],
  matchedNumbers: [],
});

function filterFromPath(path: ClassifierPath): ClassifierFilter {
  return {
    groupCode: path.groupCode,
    priznak1: path.priznak1,
    priznak2: path.priznak2,
    priznak3: path.priznak3,
    extraTags: path.extraTags,
  };
}

function flagsFromCard(card: IncidentCard): ServiceFlags {
  const answers = Object.values(card.classification.answersByType).flat();
  const has = (question: string, value: string) =>
    answers.some((item) => item.questionLabel === question && item.values.includes(value));
  return {
    noAccess: card.flags.noAccessOrBlocked || has('Доступ', 'Нет доступа'),
    threatToPeople: has('Угроза людям', 'Да'),
    victims: card.injured.hasInjured === true,
    notOnScene: card.flags.notOnSceneOrAmbulanceRefusal,
    offense: has('Правонарушение', 'Есть правонарушение') || has('Правонарушение', 'Да'),
    gasification: has('Проведена ли газификация', 'Да'),
    roadBlocked: has('Есть ли перекрытие движения', 'Да'),
  };
}

function mergeAutoServices(current: ServiceAssignment[], auto: ServiceAssignment[]): ServiceAssignment[] {
  const manual = current.filter((item) => !item.autoAssigned);
  const manualNames = new Set(manual.map((item) => item.name));
  return [...auto.filter((item) => !manualNames.has(item.name)), ...manual];
}

function applyClassifier(card: IncidentCard, path: ClassifierPath): IncidentCard {
  const matched = path.groupCode || path.priznak1 ? matchRecords(filterFromPath(path)) : [];
  const nextPath = {
    ...path,
    matchedNumbers: matched.map((item) => String(item.n)),
  };
  const auto = assignedServices(matched, flagsFromCard({ ...card, classification: { ...card.classification, classifier: nextPath } })).map(
    (item) => ({
      name: mapClassifierServiceName(item.name),
      autoAssigned: true,
      visMark: false,
      isMainForType: item.isMainForType,
      statusHistory: [] as ServiceAssignment['statusHistory'],
    }),
  );
  return {
    ...card,
    classification: { ...card.classification, classifier: nextPath },
    services: mergeAutoServices(card.services, auto),
  };
}

export function useArm112Workspace(input: {
  scenario: TrainingScenario;
  operatorName: string;
  operatorLogin?: string;
  mode?: 'training' | 'guided';
}) {
  const mode = input.mode ?? 'training';
  const binding = useMemo(() => trainingBindingFor(input.scenario), [input.scenario]);
  const draft = mode !== 'guided' && input.operatorLogin ? readArmDraft(input.operatorLogin, input.scenario.id) : null;
  const [phase, setPhase] = useState<CallSession['phase']>(
    draft?.phase ?? (mode === 'guided' ? 'заполнение карточки' : 'входящий звонок'),
  );
  const [telephonyStatus, setTelephonyStatus] = useState<CallSession['telephonyStatus']>(
    draft?.telephonyStatus ?? 'доступен',
  );
  const [modal, setModal] = useState<ArmUiModal>('none');
  const [emptyReason, setEmptyReason] = useState<'нет контакта' | 'срыв звонка'>('нет контакта');
  const [mapOpen, setMapOpen] = useState(false);
  const [startedAt] = useState(isoNow);
  const [incomingAcceptedAt, setIncomingAcceptedAt] = useState<string | null>(draft?.incomingAcceptedAt ?? null);
  const [actions, setActions] = useState<TrainingAction[]>([]);
  const [result, setResult] = useState<Arm112PracticalResult | null>(null);
  const [card, setCard] = useState<IncidentCard>(() =>
    draft?.card ??
    createEmptyIncidentCard({
      number: String(36800000 + Math.floor(Math.random() * 90000)),
      createdAt: nowStamp(),
      operatorLabel: input.operatorName,
      armNumber: '4',
    }),
  );

  useEffect(() => {
    if (mode === 'guided' || !input.operatorLogin || result) {
      return;
    }
    const timer = window.setTimeout(() => {
      writeArmDraft(input.operatorLogin as string, {
        scenarioId: input.scenario.id,
        savedAt: isoNow(),
        phase,
        card,
        incomingAcceptedAt,
        telephonyStatus,
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [card, incomingAcceptedAt, input.operatorLogin, input.scenario.id, mode, phase, result, telephonyStatus]);

  function log(type: string, detail: string) {
    setActions((current) => [...current, { at: isoNow(), type, detail }]);
  }

  useEffect(() => {
    if (!card.timer.running) {
      return;
    }
    const id = window.setInterval(() => {
      setCard((current) => {
        const elapsed = current.timer.elapsedSeconds + 1;
        return {
          ...current,
          timer: { elapsedSeconds: elapsed, running: true, exceeded: elapsed >= binding.cardTimerLimitSec },
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [card.timer.running, binding.cardTimerLimitSec]);

  const options = useMemo(
    () => childOptions(filterFromPath(card.classification.classifier)),
    [card.classification.classifier],
  );

  function patchCard(next: Partial<IncidentCard>) {
    setCard((current) => ({ ...current, ...next }));
  }

  function acceptIncoming(kind: 'call' | 'sms' = 'call') {
    if (phase === PHASE_AFTER_INCOMING_ACCEPT) {
      return;
    }
    const at = isoNow();
    setIncomingAcceptedAt((current) => current ?? at);
    setTelephonyStatus('недоступен');
    setPhase(PHASE_AFTER_INCOMING_ACCEPT);
    log(kind === 'sms' ? 'accept-sms' : 'accept-call', binding.incomingNumber);
    setCard((current) => ({
      ...current,
      caller: {
        ...current.caller,
        aon: current.caller.aon || binding.incomingNumber,
      },
      timer:
        mode === 'guided'
          ? { ...current.timer, running: false }
          : {
              elapsedSeconds: current.timer.elapsedSeconds,
              running: true,
              exceeded: current.timer.elapsedSeconds >= binding.cardTimerLimitSec,
            },
    }));
  }

  function acceptCall() {
    acceptIncoming('call');
  }

  function acceptSms() {
    acceptIncoming('sms');
  }

  function openManualCard() {
    setTelephonyStatus('недоступен');
    setPhase('заполнение карточки');
    log('create-card', 'создать новую карточку');
    setCard((current) => ({
      ...current,
      flags: { ...current.flags, createdManually: true },
      timer:
        mode === 'guided'
          ? { elapsedSeconds: 0, running: false, exceeded: false }
          : { elapsedSeconds: 0, running: true, exceeded: false },
    }));
  }

  function selectType(type: string) {
    log('select-type', type);
    setCard((current) => {
      const exists = current.classification.selectedTypes.includes(type);
      const selectedTypes = exists
        ? current.classification.selectedTypes.filter((item) => item !== type)
        : [...current.classification.selectedTypes, type];
      let path = current.classification.classifier;
      if (exists) {
        if (selectedTypes.length === 0) {
          path = emptyClassifier();
        } else {
          const resolved = resolveLabel(selectedTypes[selectedTypes.length - 1]);
          path = resolved
            ? {
                groupCode: resolved.groupCode ?? null,
                priznak1: resolved.priznak1 ?? null,
                priznak2: resolved.priznak2 ?? [],
                priznak3: resolved.priznak3 ?? [],
                extraTags: resolved.extraTags ?? [],
                matchedNumbers: [],
              }
            : emptyClassifier();
        }
      } else {
        const resolved = resolveLabel(type);
        path = resolved
          ? {
              groupCode: resolved.groupCode ?? null,
              priznak1: resolved.priznak1 ?? null,
              priznak2: resolved.priznak2 ?? [],
              priznak3: resolved.priznak3 ?? [],
              extraTags: resolved.extraTags ?? [],
              matchedNumbers: [],
            }
            : emptyClassifier();
      }
      return applyClassifier(
        {
          ...current,
          classification: { ...current.classification, selectedTypes, searchQuery: '', additionalTypeQuery: '', classifier: path },
        },
        path,
      );
    });
  }

  function selectPriznak(level: 'priznak1' | 'priznak2' | 'priznak3' | 'extraTags', value: string) {
    log(`select-${level}`, value);
    setCard((current) => {
      const path = { ...current.classification.classifier };
      if (level === 'priznak1') {
        path.priznak1 = path.priznak1 === value ? null : value;
        path.priznak2 = [];
        path.priznak3 = [];
      } else if (level === 'priznak2') {
        path.priznak2 = path.priznak2.includes(value)
          ? path.priznak2.filter((item) => item !== value)
          : [...path.priznak2, value];
        path.priznak3 = [];
      } else if (level === 'priznak3') {
        path.priznak3 = path.priznak3.includes(value)
          ? path.priznak3.filter((item) => item !== value)
          : [...path.priznak3, value];
      } else {
        path.extraTags = path.extraTags.includes(value)
          ? path.extraTags.filter((item) => item !== value)
          : [...path.extraTags, value];
      }
      return applyClassifier({ ...current, classification: { ...current.classification, classifier: path } }, path);
    });
  }

  function setAnswer(type: string, question: string, values: string[]) {
    setCard((current) => {
      const currentAnswers = current.classification.answersByType[type] ?? [];
      const nextAnswers = pruneHiddenAnswers(type, [
        ...currentAnswers.filter((item) => item.questionLabel !== question),
        { questionLabel: question, values },
      ]);
      let next: IncidentCard = {
        ...current,
        classification: {
          ...current.classification,
          answersByType: { ...current.classification.answersByType, [type]: nextAnswers },
        },
      };
      const path = { ...next.classification.classifier };
      const optionsNow = childOptions(filterFromPath(path));
      for (const value of values) {
        const p2 = exactPriznakMatch(value, optionsNow.priznak2);
        if (p2 && !path.priznak2.includes(p2)) {
          path.priznak2 = [...path.priznak2, p2];
        }
        const p3 = exactPriznakMatch(value, optionsNow.priznak3);
        if (p3 && !path.priznak3.includes(p3)) {
          path.priznak3 = [...path.priznak3, p3];
        }
      }
      next = applyClassifier({ ...next, classification: { ...next.classification, classifier: path } }, path);
      return next;
    });
  }

  function toggleAnswer(type: string, question: string, value: string, exclusive: boolean) {
    log('questionnaire', `${question}=${value}`);
    setCard((current) => {
      const currentAnswers = current.classification.answersByType[type] ?? [];
      const row = currentAnswers.find((item) => item.questionLabel === question);
      let nextValues: string[];
      if (!row) {
        nextValues = [value];
      } else if (exclusive) {
        nextValues = row.values.includes(value) ? [] : [value];
      } else {
        nextValues = row.values.includes(value) ? row.values.filter((item) => item !== value) : [...row.values, value];
      }
      const nextAnswers = pruneHiddenAnswers(type, [
        ...currentAnswers.filter((item) => item.questionLabel !== question),
        { questionLabel: question, values: nextValues },
      ]);
      let next: IncidentCard = {
        ...current,
        classification: {
          ...current.classification,
          answersByType: { ...current.classification.answersByType, [type]: nextAnswers },
        },
      };
      const path = { ...next.classification.classifier };
      const optionsNow = childOptions(filterFromPath(path));
      const p2 = exactPriznakMatch(value, optionsNow.priznak2);
      if (p2) {
        path.priznak2 = nextValues.some((item) => exactPriznakMatch(item, [p2]))
          ? [...new Set([...path.priznak2, p2])]
          : path.priznak2.filter((item) => item !== p2);
      }
      const p3 = exactPriznakMatch(value, optionsNow.priznak3);
      if (p3) {
        path.priznak3 = nextValues.some((item) => exactPriznakMatch(item, [p3]))
          ? [...new Set([...path.priznak3, p3])]
          : path.priznak3.filter((item) => item !== p3);
      }
      return applyClassifier({ ...next, classification: { ...next.classification, classifier: path } }, path);
    });
  }

  function toggleService(service: EvidencedService | { short: string }) {
    log('toggle-service', service.short);
    setCard((current) => {
      const exists = current.services.some((item) => item.name === service.short);
      return {
        ...current,
        services: exists
          ? current.services.filter((item) => item.name !== service.short)
          : [...current.services, { name: service.short, autoAssigned: false, visMark: false, isMainForType: false, statusHistory: [] }],
      };
    });
  }

  function copyAonTo(field: 'providedNumber' | 'phoneOnScene') {
    setCard((current) => ({
      ...current,
      caller: { ...current.caller, [field]: current.caller.aon },
    }));
  }

  function saveCard() {
    setModal('none');
    log('save', 'Оповестить и сохранить карточку');
    if (mode === 'guided') {
      return;
    }
    setCard((current) => ({
      ...current,
      status: 'Зарегистрирована',
      timer: { ...current.timer, running: false },
    }));
    setPhase('просмотр карточки');
  }

  function snapshotPractical(): Arm112PracticalResult {
    const completedAt = isoNow();
    const path = card.classification.classifier;
    const matched = path.groupCode || path.priznak1 ? matchRecords(filterFromPath(path)) : [];
    return buildPracticalResult({
      scenario: input.scenario,
      binding,
      card,
      startedAt,
      completedAt,
      incomingAcceptedAt,
      actions,
      matched,
    });
  }

  function markOtrabotana() {
    if (mode === 'guided') {
      return;
    }
    const completedAt = isoNow();
    const next = { ...card, status: 'Отработана' as const };
    const path = next.classification.classifier;
    const matched = path.groupCode || path.priznak1 ? matchRecords(filterFromPath(path)) : [];
    const nextActions = [...actions, { at: completedAt, type: 'otrabotana', detail: 'Отработана' }];
    setCard(next);
    setActions(nextActions);
    setResult(
      buildPracticalResult({
        scenario: input.scenario,
        binding,
        card: next,
        startedAt,
        completedAt,
        incomingAcceptedAt,
        actions: nextActions,
        matched,
      }),
    );
    setPhase('завершена');
    setTelephonyStatus('доступен');
  }

  function setInjuredCount(value: string) {
    setCard((current) => {
      const next: IncidentCard = {
        ...current,
        injured: { hasInjured: value !== '' && value !== '0', count: value === '' ? null : Number(value) },
      };
      return applyClassifier(next, next.classification.classifier);
    });
  }

  function toggleFlag(flag: 'notOnSceneOrAmbulanceRefusal' | 'noAccessOrBlocked' | 'importantIncident') {
    setCard((current) => {
      const next: IncidentCard = {
        ...current,
        flags: { ...current.flags, [flag]: !current.flags[flag] },
      };
      return applyClassifier(next, next.classification.classifier);
    });
  }

  const activeQuestionnaire = card.classification.selectedTypes
    .map((type) => ({ type, q: questionnaireForType(type) }))
    .filter((item): item is { type: string; q: NonNullable<ReturnType<typeof questionnaireForType>> } => Boolean(item.q));

  const serviceCatalog = useMemo(() => {
    const rows = EVIDENCED_SERVICES.map((item) => ({ ...item, source: 'СЛУЖБЫ 112.docx' }));
    const seen = new Set(rows.map((item) => item.short.toLowerCase()));
    for (const item of uniqueServiceCatalog()) {
      const short = mapClassifierServiceName(item.name);
      if (seen.has(short.toLowerCase()) || seen.has(item.name.toLowerCase())) {
        continue;
      }
      seen.add(short.toLowerCase());
      rows.push({ short, full: item.name, source: item.source });
    }
    return rows;
  }, []);

  return {
    binding,
    phase,
    setPhase,
    telephonyStatus,
    setTelephonyStatus,
    modal,
    setModal,
    emptyReason,
    setEmptyReason,
    mapOpen,
    setMapOpen,
    card,
    setCard,
    patchCard,
    classifierOptions: options,
    acceptCall,
    acceptSms,
    openManualCard,
    selectType,
    selectPriznak,
    setAnswer,
    toggleAnswer,
    toggleService,
    copyAonTo,
    saveCard,
    markOtrabotana,
    snapshotPractical,
    setInjuredCount,
    toggleFlag,
    activeQuestionnaire,
    displayTypeTitle,
    callerStatuses: CALLER_STATUSES,
    allServices: serviceCatalog,
    frequentChips: EVIDENCED_WHAT_HAPPENED_CHIPS,
    significantTypes: EVIDENCED_SIGNIFICANT_TYPES,
    typeCatalog: EVIDENCED_WHAT_HAPPENED_SEARCH_HITS,
    result,
    actions,
    mode,
    incomingAcceptedAt,
    smsInbox:
      incomingChannelFor(input.scenario) === 'sms' ? smsFromTicket(input.scenario) : '',
  };
}

export type Arm112Workspace = ReturnType<typeof useArm112Workspace>;
export type CallerStatusValue = CallerStatus;
