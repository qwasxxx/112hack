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
  const [callbackOn, setCallbackOn] = useState(false);
  const closing = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setCallbackOn(false);
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
    };
    const own = finish.cards.filter((item) => item.role === 'own');
    const check: DdsCheckResult = {
      servicesOk: own.every((item) => {
        const extra = item.draft.services.filter((kind) => !item.facts.services.includes(kind));
        const missing = item.facts.services.filter((kind) => !item.draft.services.includes(kind));
        return extra.length === 0 && missing.length === 0;
      }),
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
            Службы внизу: тёмный чип = привлечена, серый = нет. 101 пожар, 102 полиция, 103 скорая, 104 газ. Лишние
            снимите, нужные добавьте. Карандаш — статус своей ДДС. Трубка — перезвон. × закрывает карточку в 112.
          </span>
          <button type="button" onClick={props.onLeave}>
            К уроку
          </button>
        </header>
      )}
      <div className={`dds-shell${callbackOn ? ' is-call' : ''}`}>
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
            onToggleService={session.toggleService}
            onStartStatus={session.startStatusEdit}
            onCancelStatus={session.cancelStatusEdit}
            onPatchStatus={session.patchStatusForm}
            onApplyStatus={session.applyStatus}
            onCallback={() => {
              unlockTtsAudio();
              setCallbackOn(true);
            }}
            onClose={session.closeCard}
          />
        )}
        {callbackOn && active ? (
          <aside className="dds-call" aria-label="Обратный звонок заявителю">
            <CallPage
              scenario={active.scenario}
              section="training"
              variant="panel"
              autoStart
              operatorLogin={props.operatorLogin}
              systemPrompt={buildDdsCallbackPrompt(active.scenario, active.facts)}
              opening={ddsCallbackOpening()}
              hint="Вы — диспетчер ДДС. Уточните адрес, пострадавших и телефон для связи."
              panelTitle="Обратный звонок"
              onLeave={() => {
                session.markCallback();
                setCallbackOn(false);
              }}
              onCallEnded={() => {
                session.markCallback();
                setCallbackOn(false);
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
