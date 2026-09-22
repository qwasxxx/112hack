import { useEffect, useRef, useState } from 'react';
import type { TrainingScenario } from '../../data/scenarios';
import { ddsWorkplaceName, readDdsLane } from '../../dds-lanes';
import { writeDdsHint } from '../../progress';
import { CallPage } from '../../pages/call-page';
import type { DdsFinish } from '../../pages/debrief-page';
import { unlockTtsAudio } from '../../lib/tts-player';
import { buildDdsCallbackPrompt, ddsCallbackOpening } from './callback-prompt';
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
  const [callTarget, setCallTarget] = useState<{ title: string; prompt?: string; opening?: string } | null>(
    null,
  );
  const closing = useRef(false);
  const callAudio = useRef<{ audio: Promise<Blob | null>; seconds: number } | undefined>(undefined);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setCallTarget(null);
  }, [session.activeId]);

  useEffect(() => {
    const done = session.queue.filter((item) => item.decision).length;
    const active = session.queue.find((item) => item.id === session.activeId);
    writeDdsHint(props.operatorLogin, {
      scenarioId: props.scenario.id,
      done,
      total: session.queue.length,
      services: active?.draft.services.length ?? 0,
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
      })),
      audio: callAudio.current?.audio,
      callSeconds: callAudio.current?.seconds,
    };
    const own = finish.cards.filter((item) => item.role === 'own');
    const check: DdsCheckResult = {
      servicesOk: true,
      injuredOk: own.every((item) => item.draft.injured === item.facts.injured),
      phoneOk: own.every((item) => {
        const need = item.facts.callerPhone.replace(/\D/g, '');
        const got = item.draft.callerPhone.replace(/\D/g, '');
        return !need || need === got;
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
            onPatch={session.patch}
            onStartStatus={session.startStatusEdit}
            onCancelStatus={session.cancelStatusEdit}
            onPatchStatus={session.patchStatusForm}
            onApplyStatus={session.applyStatus}
            onCallback={() => {
              if (!active) {
                return;
              }
              unlockTtsAudio();
              setCallTarget({
                title: 'Звонок заявителю',
                prompt: buildDdsCallbackPrompt(active.scenario, active.facts),
                opening: ddsCallbackOpening(),
              });
            }}
            onContactService={(label, phone) => {
              unlockTtsAudio();
              setCallTarget({
                title: `Связь · ${label}`,
                prompt: `Вы диспетчер ДДС. Связываетесь со службой ${label} (${phone}) по карточке ${session.card.number}. Коротко передайте адрес, суть, пострадавших. Если это не ваша зона — согласуйте взаимодействие.`,
                opening: `${label}, диспетчер на линии.`,
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
              hint="IP-телефон. Говорите как диспетчер ДДС."
              panelTitle={callTarget.title}
              onLeave={() => {
                if (callTarget.title === 'Звонок заявителю') {
                  session.markCallback();
                }
                setCallTarget(null);
              }}
              onCallEnded={(payload) => {
                if (payload.audio) {
                  callAudio.current = { audio: payload.audio, seconds: payload.seconds };
                }
                if (callTarget.title === 'Звонок заявителю') {
                  session.markCallback();
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
