import type { TrainingScenario } from '../../../data/scenarios';
import { JournalScreen } from '../components/journal-screen';
import { useArm112Workspace } from '../hooks/use-arm112-workspace';
import { CallPage } from '../../../pages/call-page';
import '../styles/arm112.css';
import { CardCreateScreen } from './card-create-screen';
import { CardViewScreen } from './card-view-screen';
import { TrainingResultPanel } from '../components/training-result-panel';

type Props = {
  scenario: TrainingScenario;
  operatorName: string;
  onLeave: () => void;
};

export function Arm112TrainingPage(props: Props) {
  const workspace = useArm112Workspace({
    scenario: props.scenario,
    operatorName: props.operatorName,
    mode: 'training',
  });
  const binding = workspace.binding;
  const showCard = workspace.phase === 'заполнение карточки' || workspace.phase === 'активный вызов';
  const showView = workspace.phase === 'просмотр карточки' || workspace.phase === 'завершена';
  const showConversation = workspace.phase === 'активный вызов';

  return (
    <div
      className="arm112-shell"
      data-lesson="training"
      data-scenario={props.scenario.code}
      data-call-phase={workspace.phase}
    >
      <div className="arm112-chrome">
        <button type="button" onClick={props.onLeave}>
          К уроку
        </button>
        <span>
          Тренировка · {binding.scenarioCode} {props.scenario.title}
        </span>
        <span className="arm112-chrome-meta">
          норматив {binding.normativeDurationMin} мин · набор карточки {binding.cardTimerLimitSec} сек
        </span>
        {workspace.phase !== 'ожидание' && workspace.phase !== 'входящий звонок' ? (
          <span className="arm112-chrome-call">Заявитель: {binding.callerOpening}</span>
        ) : null}
      </div>
      <div className="arm112-workspace">
        {workspace.phase === 'ожидание' || workspace.phase === 'входящий звонок' ? (
          <JournalScreen
            telephonyStatus={workspace.telephonyStatus}
            incoming={workspace.phase === 'входящий звонок'}
            incomingNumber={binding.incomingNumber}
            onAcceptCall={workspace.acceptCall}
            onDismissIncoming={() => workspace.setPhase('ожидание')}
            onCreateCard={workspace.openManualCard}
            onToggleTelephony={() =>
              workspace.setTelephonyStatus(workspace.telephonyStatus === 'доступен' ? 'недоступен' : 'доступен')
            }
          />
        ) : null}
        {showCard ? (
          <div className={showConversation ? 'arm112-live' : undefined}>
            <div className="arm112-live-main">
              <div className="arm112-script" aria-label="Реплика заявителя">
                <span>Реплика заявителя</span>
                <p>{binding.callerOpening}</p>
              </div>
              <CardCreateScreen workspace={workspace} onClose={() => workspace.setPhase('ожидание')} />
            </div>
            {showConversation ? (
              <CallPage
                scenario={props.scenario}
                section="training"
                variant="panel"
                autoStart
                onLeave={() => undefined}
              />
            ) : null}
          </div>
        ) : null}
        {showView ? <CardViewScreen workspace={workspace} onClose={props.onLeave} /> : null}
        {workspace.result ? <TrainingResultPanel result={workspace.result} onLeave={props.onLeave} /> : null}
      </div>
    </div>
  );
}
