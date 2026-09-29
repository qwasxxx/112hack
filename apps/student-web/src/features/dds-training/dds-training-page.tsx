import { useEffect, useRef, useState } from 'react';
import type { TrainingScenario } from '../../data/scenarios';
import { ddsWorkplaceName, readDdsLane } from '../../dds-lanes';
import { patchLive, readLiveSessions, writeDdsHint } from '../../progress';
import { phonesMatch } from '../../progress/ticket-facts';
import { CallPage } from '../../pages/call-page';
import type { DdsFinish } from '../../pages/debrief-page';
import { unlockTtsAudio } from '../../lib/tts-player';
import {
  buildDdsCallbackPrompt,
  buildDdsChiefPrompt,
  buildDdsCrewInboundPrompt,
  buildDdsCrewPrompt,
  buildDdsReport112Prompt,
  buildDdsServicePrompt,
  crewDepartureReady,
  crewEtaMinutes,
  ddsCallbackOpening,
  ddsChiefOpening,
  ddsCrewInboundOpening,
  ddsCrewOpening,
  ddsReport112Opening,
  ddsServiceOpening,
} from './callback-prompt';
import { DdsCard } from './dds-card';
import { DdsJournal } from './dds-journal';
import { useDdsSession, type DdsCheckResult } from './use-dds-session';
import './dds-training.css';

type Props = {
  scenario: TrainingScenario;
  operatorLogin: string;
  onLeave: () => void;
  onCompleted?: (result: DdsCheckResult) => void;
  onFinished: (finish: DdsFinish) => void;
};

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = [
  'Января',
  'Февраля',
  'Марта',
  'Апреля',
  'Мая',
  'Июня',
  'Июля',
  'Августа',
  'Сентября',
  'Октября',
  'Ноября',
  'Декабря',
];

export function DdsTrainingPage(props: Props) {
  const lane = readDdsLane();
  const session = useDdsSession(props.scenario, lane);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [callTarget, setCallTarget] = useState<{
    title: string;
    scope: string;
    prompt?: string;
    opening?: string;
    aiRole?: 'service' | 'chief' | 'crew' | 'enroute' | 'desk';
    service?: string;
    counterparty?: string;
  } | null>(
    null,
  );
  const [ringingId, setRingingId] = useState<string | null>(null);
  const closing = useRef(false);
  const markInboundRef = useRef(session.markCrewInbound);
  markInboundRef.current = session.markCrewInbound;
  const keepCallRef = useRef<string | null>(null);
  const callAudio = useRef<{ title: string; audio: Promise<Blob | null>; seconds: number }[]>([]);
  const statusMarks = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (keepCallRef.current && keepCallRef.current === session.activeId) {
      keepCallRef.current = null;
      return;
    }
    setCallTarget(null);
  }, [session.activeId]);

  const inboundReadyId =
    session.queue.find((item) => crewDepartureReady(item) && item.id !== ringingId)?.id ?? null;

  useEffect(() => {
    if (!inboundReadyId || callTarget || ringingId) {
      return;
    }
    const timer = window.setTimeout(() => setRingingId(inboundReadyId), 12_000);
    return () => window.clearTimeout(timer);
  }, [inboundReadyId, callTarget, ringingId]);

  useEffect(() => {
    if (!ringingId || callTarget) {
      return;
    }
    const card = session.queue.find((item) => item.id === ringingId);
    if (!card || card.crewInbound) {
      setRingingId(null);
      return;
    }
    if (card.workplaceStatus !== 'Принята') {
      markInboundRef.current(ringingId, 'missed');
      setRingingId(null);
      return;
    }
    const timer = window.setTimeout(() => {
      markInboundRef.current(ringingId, 'missed');
      setRingingId(null);
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [ringingId, callTarget, session.queue]);

  useEffect(() => {
    const done = session.queue.filter((item) => item.decision).length;
    const active = session.queue.find((item) => item.id === session.activeId);
    writeDdsHint(props.operatorLogin, {
      scenarioId: props.scenario.id,
      done,
      total: session.queue.length,
      services: active?.contacts.length ?? active?.draft.services.length ?? 0,
      card: active?.number,
      status: active?.workplaceStatus,
      naryad: active?.naryad,
      address: active?.draft.address,
      injured: active?.draft.injured,
      caller: active?.draft.callerName,
      contacts: active?.contacts.map((item) => item.service).join(', '),
      history: active?.history.map((item) => item.status).join(' → '),
    });
    patchLive(props.operatorLogin, {
      ddsCards: session.queue.map((item) => ({
        id: item.id,
        number: item.number,
        title: item.scenario.title,
        status: item.workplaceStatus,
        naryad: item.naryad,
        address: item.draft.address,
        injured: item.draft.injured,
        caller: item.draft.callerName,
        phone: item.draft.callerPhone,
        contacts: item.contacts.map((contact) => contact.service).join(', '),
        history: item.history.map((event) => event.status).join(' → '),
        active: item.id === session.activeId,
      })),
    });
    if (!active) {
      return;
    }
    const mark = `${active.id}|${active.workplaceStatus}|${active.naryad}|${active.history.length}`;
    if (statusMarks.current.has(mark)) {
      return;
    }
    statusMarks.current.add(mark);
    const prior = readLiveSessions().find((item) => item.login === props.operatorLogin)?.transcript ?? [];
    patchLive(props.operatorLogin, {
      transcript: [
        ...prior,
        {
          role: 'system',
          speaker: 'Карточка',
          scope: `status-${mark}`,
          text: `${active.number}: ${active.workplaceStatus}${active.naryad ? `, наряд ${active.naryad}` : ''}`,
          at: new Date().toISOString(),
        },
      ].slice(-48),
    });
  }, [props.operatorLogin, props.scenario.id, session.activeId, session.queue]);

  function finishShift() {
    if (closing.current || !session.allDone) {
      return;
    }
    closing.current = true;
    session.closeShift();
    const finish: DdsFinish = {
      scenario: props.scenario,
      workplace: session.workplace,
      startedAt: session.startedAt,
      cards: session.queue.map((item) => ({
        id: item.id,
        scenario: item.scenario,
        role: item.role,
        sourceLabel: sourceLabel(item.source),
        draft: item.draft,
        facts: item.facts,
        decision: item.decision ?? 'dispatch',
        elapsedMs: item.elapsedMs,
        defects: item.defects,
        naryad: item.naryad,
        workplaceStatus: item.workplaceStatus,
        callback: item.callbackDone,
        contacts: item.contacts,
        history: item.history,
        openMs: item.openMs,
        firstRecordMs: item.firstRecordMs,
        chiefCalled: item.chiefCalled,
        crewCalled: item.crewCalled,
        crewInbound: item.crewInbound,
        reportedTo112: item.reportedTo112,
        dialogue: item.dialogue,
      })),
      clips: callAudio.current,
    };
    const own = finish.cards.filter((item) => item.role === 'own');
    const check: DdsCheckResult = {
      servicesOk: true,
      injuredOk: own.every((item) => item.draft.injured === item.facts.injured),
      phoneOk: own.every((item) => {
        return phonesMatch(item.facts.callerPhone, item.draft.callerPhone);
      }),
      extra: [],
      missing: [],
      elapsedMs: finish.cards.reduce((sum, item) => sum + item.elapsedMs, 0),
      cards: [],
      transferredOk: finish.cards
        .filter((item) => item.role === 'foreign')
        .every((item) => item.decision === 'transfer'),
    };
    props.onCompleted?.(check);
    props.onFinished(finish);
  }

  const ringingCard = session.queue.find((item) => item.id === ringingId) ?? null;

  function acceptInbound() {
    if (!ringingCard) {
      return;
    }
    const eta = crewEtaMinutes(ringingCard.number);
    keepCallRef.current = ringingCard.id;
    session.markCrewInbound(ringingCard.id, 'accepted');
    setRingingId(null);
    session.openCard(ringingCard.id);
    unlockTtsAudio();
    setCallTarget({
      title: 'Доклад бригады',
      scope: `call-${Date.now()}`,
      counterparty: 'Бригада',
      aiRole: 'enroute',
      prompt: buildDdsCrewInboundPrompt(ringingCard.facts, ringingCard.naryad, eta),
      opening: ddsCrewInboundOpening(ringingCard.naryad, ringingCard.facts.address, eta),
    });
  }

  function declineInbound() {
    if (!ringingId) {
      return;
    }
    session.markCrewInbound(ringingId, 'declined');
    setRingingId(null);
  }

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const weekday = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const active = session.queue.find((item) => item.id === session.activeId) ?? null;

  return (
    <div className={`dds-page${session.view === 'journal' ? ' is-journal' : ''}`}>
      {session.view === 'journal' ? null : (
        <header className="dds-bar">
          <span>ДДС · {ddsWorkplaceName(lane)}</span>
          <span className="dds-bar-hint">
            СлужБис — кому ушла карточка. Стрелки — своя ДДС. Карандаш — статус и наряд.
          </span>
          <button type="button" onClick={props.onLeave}>
            К уроку
          </button>
        </header>
      )}
      {ringingCard && !callTarget ? (
        <div className="dds-incoming" role="dialog" aria-label="Входящий звонок бригады">
          <p>
            <b>Входящий звонок.</b> Наряд {ringingCard.naryad} докладывает о выезде.
          </p>
          <button type="button" onClick={acceptInbound}>
            Принять
          </button>
          <button type="button" className="is-drop" onClick={declineInbound}>
            Сбросить
          </button>
        </div>
      ) : null}
      <div className={`dds-shell${callTarget ? ' is-call' : ''}`}>
        {session.view === 'journal' ? (
          <DdsJournal
            query={query}
            onQuery={setQuery}
            items={session.items}
            clock={clock}
            seconds={seconds}
            weekday={weekday}
            readyToClose={session.allDone}
            onOpen={(id) => session.openCard(id)}
            onLeave={props.onLeave}
            onFinishShift={finishShift}
          />
        ) : (
          <DdsCard
            card={session.card}
            draft={session.draft}
            workplace={session.workplace}
            role={session.role}
            workplaceStatus={session.workplaceStatus}
            naryad={session.naryad}
            history={session.history}
            editingStatus={session.editingStatus}
            statusForm={session.statusForm}
            statusOptions={session.statusOptions}
            canEditStatus={session.canEditStatus}
            callbackDone={session.callbackDone}
            chs={session.chs}
            chp={session.chp}
            onToggleMark={session.toggleMark}
            onPatch={session.patch}
            onStartStatus={session.startStatusEdit}
            onCancelStatus={session.cancelStatusEdit}
            onPatchStatus={session.patchStatusForm}
            onApplyStatus={session.applyStatus}
            formError={session.formError}
            routeHint={session.routeHint}
            onCallChief={() => {
              if (!active) {
                return;
              }
              unlockTtsAudio();
              setCallTarget({
                title: 'Начальник',
                scope: `call-${Date.now()}`,
                service: 'Начальник',
                counterparty: 'Начальник',
                aiRole: 'chief',
                prompt: buildDdsChiefPrompt(active.facts),
                opening: ddsChiefOpening(),
              });
            }}
            onCallCrew={() => {
              if (!active) {
                return;
              }
              unlockTtsAudio();
              setCallTarget({
                title: 'Бригада',
                scope: `call-${Date.now()}`,
                service: 'Бригада',
                counterparty: 'Бригада',
                aiRole: 'crew',
                prompt: buildDdsCrewPrompt(active.facts, active.defects),
                opening: ddsCrewOpening(),
              });
            }}
            onReport112={() => {
              if (!active) {
                return;
              }
              unlockTtsAudio();
              setCallTarget({
                title: 'Сообщение в 112',
                scope: `call-${Date.now()}`,
                service: '112',
                counterparty: 'Оператор 112',
                aiRole: 'desk',
                prompt: buildDdsReport112Prompt(active.facts, active.draft),
                opening: ddsReport112Opening(),
              });
            }}
            onCallback={() => {
              if (!active) {
                return;
              }
              unlockTtsAudio();
              setCallTarget({
                title: 'Звонок заявителю',
                scope: `call-${Date.now()}`,
                counterparty: 'Заявитель',
                prompt: buildDdsCallbackPrompt(active.scenario, active.facts),
                opening: ddsCallbackOpening(),
              });
            }}
            onContactService={(label, phone) => {
              if (!active) {
                return;
              }
              unlockTtsAudio();
              setCallTarget({
                title: `Связь · ${label}`,
                scope: `call-${Date.now()}`,
                service: label,
                counterparty: label,
                aiRole: 'service',
                prompt: buildDdsServicePrompt(label, phone, active.number, active.facts),
                opening: ddsServiceOpening(label),
              });
            }}
            onClose={session.closeCard}
          />
        )}
        {callTarget && active ? (
          <aside className="dds-call" aria-label={callTarget.title}>
            <CallPage
              scenario={active.scenario}
              section="training"
              variant="panel"
              autoStart
              operatorLogin={props.operatorLogin}
              systemPrompt={callTarget.prompt ?? buildDdsCallbackPrompt(active.scenario, active.facts)}
              opening={callTarget.opening ?? ddsCallbackOpening()}
              hint={
                callTarget.title === 'Доклад бригады'
                  ? 'Бригада докладывает о выезде. После звонка поставьте «Начало реагирования».'
                  : 'Говорите как диспетчер ДДС.'
              }
              panelTitle={callTarget.title}
              aiRole={callTarget.aiRole}
              counterparty={callTarget.counterparty}
              transcriptScope={callTarget.scope}
              onLeave={() => {
                if (callTarget.title === 'Звонок заявителю') {
                  session.markCallback();
                }
                setCallTarget(null);
              }}
              onCallEnded={(payload) => {
                if (payload.audio) {
                  callAudio.current = [
                    ...callAudio.current,
                    { title: callTarget.title, audio: payload.audio, seconds: payload.seconds },
                  ];
                }
                if (callTarget.title === 'Звонок заявителю') {
                  session.markCallback();
                }
                const other = callTarget.counterparty || 'Собеседник';
                session.appendDialogue(
                  payload.lines
                    .filter((line) => line.text.trim())
                    .map((line) => ({
                      role: line.role === 'operator' ? 'operator' : 'caller',
                      speaker: line.role === 'operator' ? 'Диспетчер' : other,
                      text: line.text.trim(),
                    })),
                );
                if (callTarget.service) {
                  const said = payload.lines
                    .filter((line) => line.role === 'operator')
                    .map((line) => line.text)
                    .join(' ');
                  session.recordContact(callTarget.service, said || 'разговор не распознан');
                  if (callTarget.service === 'Начальник') {
                    session.markRoute('chief');
                  } else if (callTarget.service === 'Бригада') {
                    session.markRoute('crew');
                  } else if (callTarget.service === '112') {
                    session.markRoute('112');
                  }
                }
                setCallTarget(null);
              }}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function sourceLabel(source: '112' | 'lane' | 'foreign'): string {
  if (source === '112') {
    return 'Карточка от оператора 112';
  }
  if (source === 'lane') {
    return 'Лента смены';
  }
  return 'Карточка другой ДДС';
}
