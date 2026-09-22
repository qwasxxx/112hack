import { useEffect, useRef } from 'react';
import type { TrainingScenario } from '../../../data/scenarios';
import { IncomingCallOverlay } from '../components/incoming-call-overlay';
import { useArm112Workspace } from '../hooks/use-arm112-workspace';
import { CallPage } from '../../../pages/call-page';
import { unlockTtsAudio } from '../../../lib/tts-player';
import { incomingChannelFor, smsFromTicket, type TranscriptTurn } from '../../../progress';
import type { TrainingFinish } from '../../../pages/debrief-page';
import '../styles/arm112.css';
import { CardCreateScreen } from './card-create-screen';
import type { Arm112PracticalResult } from '../model/training-result';

type Props = {
  scenario: TrainingScenario;
  operatorName: string;
  operatorLogin: string;
  kind?: 'training' | 'exam';
  onLeave: () => void;
  onCompleted?: (result: Arm112PracticalResult) => void;
  onFinished: (finish: TrainingFinish) => void;
};

export function Arm112TrainingPage(props: Props) {
  const kind = props.kind ?? 'training';
  const channel = incomingChannelFor(props.scenario, kind);
  const sms = channel === 'sms';
  const workspace = useArm112Workspace({
    scenario: props.scenario,
    operatorName: props.operatorName,
    operatorLogin: props.operatorLogin,
    mode: 'training',
  });
  const reported = useRef(false);
  const onCompleted = props.onCompleted;
  useEffect(() => {
    if (!workspace.result || reported.current) {
      return;
    }
    reported.current = true;
    onCompleted?.(workspace.result);
  }, [onCompleted, workspace.result]);
  const binding = workspace.binding;
  const showConversation =
    workspace.phase === 'активный вызов' ||
    workspace.phase === 'просмотр карточки' ||
    workspace.phase === 'завершена';
  const showCard = workspace.phase === 'заполнение карточки' || showConversation;
  const smsText = sms ? smsFromTicket(props.scenario) : '';

  function finish(transcript: TranscriptTurn[], durationSec: number, audio?: Promise<Blob | null>) {
    const result = workspace.snapshotPractical();
    props.onCompleted?.(result);
    props.onFinished({
      scenario: props.scenario,
      result,
      transcript,
      durationSec,
      kind,
      channel,
      audio,
    });
  }

  return (
    <div
      className="arm112-shell"
      data-lesson={kind}
      data-channel={channel}
      data-scenario={props.scenario.code}
      data-call-phase={workspace.phase}
    >
      <div className="arm112-chrome">
        <button type="button" onClick={props.onLeave}>
          К уроку
        </button>
        <span>
          {kind === 'exam' ? 'Экзамен' : sms ? 'Тренировка · SMS' : 'Тренировка'} · {binding.scenarioCode}{' '}
          {props.scenario.title}
        </span>
        <span className="arm112-chrome-meta">
          норматив {binding.normativeDurationMin} мин · набор карточки {binding.cardTimerLimitSec} сек
          {kind === 'exam' ? ' · зачёт от 80' : ''}
        </span>
        {kind !== 'exam' && !sms && workspace.phase !== 'ожидание' && workspace.phase !== 'входящий звонок' ? (
          <span className="arm112-chrome-call">Заявитель: {binding.callerOpening}</span>
        ) : null}
      </div>
      <div className="arm112-workspace">
        {workspace.phase === 'ожидание' || workspace.phase === 'входящий звонок' ? (
          <IncomingCallOverlay
            number={binding.incomingNumber}
            kind={sms ? 'sms' : 'call'}
            preview={sms ? smsText : undefined}
            onAccept={() => {
              if (sms) {
                workspace.acceptSms();
                return;
              }
              unlockTtsAudio();
              workspace.acceptCall();
            }}
          />
        ) : null}
        {showCard ? (
          <div className={showConversation ? 'arm112-live' : undefined}>
            <div className="arm112-live-main">
              {showConversation || kind === 'exam' || sms ? null : (
                <div className="arm112-script" aria-label="Реплика заявителя">
                  <span>Реплика заявителя</span>
                  <p>{binding.callerOpening}</p>
                </div>
              )}
              <CardCreateScreen workspace={workspace} onClose={() => workspace.setPhase('ожидание')} />
            </div>
            {showConversation && sms ? (
              <aside className="arm112-sms-panel" aria-label="Входящее SMS">
                <p>Входящее SMS</p>
                <strong>с номера {binding.incomingNumber}</strong>
                <p className="arm112-sms-body">{smsText}</p>
                <button type="button" onClick={() => finish([], workspace.card.timer.elapsedSeconds)}>
                  Завершить обработку
                </button>
              </aside>
            ) : null}
            {showConversation && !sms ? (
              <CallPage
                scenario={props.scenario}
                section={kind}
                variant="panel"
                autoStart
                operatorLogin={props.operatorLogin}
                onLeave={() => undefined}
                onCallEnded={(payload) => finish(payload.lines, payload.seconds, payload.audio)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
