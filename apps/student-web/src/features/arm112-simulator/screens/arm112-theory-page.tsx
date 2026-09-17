import { useEffect, useState } from 'react';
import type { TrainingScenario } from '../../../data/scenarios';
import { ArmGuidedProvider } from '../guided/arm-region';
import { TheoryGuidePanel } from '../guided/theory-guide-panel';
import { THEORY_STEPS } from '../guided/tutorial-steps';
import type { TheoryRegionId } from '../guided/types';
import { useArm112Workspace } from '../hooks/use-arm112-workspace';
import { JournalScreen } from '../components/journal-screen';
import { CardCreateScreen } from './card-create-screen';
import '../styles/arm112.css';

type Props = {
  scenario: TrainingScenario;
  onLeave: () => void;
};

const REGION_TO_STEP: Partial<Record<TheoryRegionId, string>> = {
  incoming: 'call',
  phones: 'call',
  caller: 'caller',
  address: 'address',
  incident: 'incident',
  description: 'description',
  services: 'services',
  timer: 'card-actions',
  'quick-actions': 'card-actions',
  footer: 'card-actions',
};

export function Arm112TheoryPage(props: Props) {
  const workspace = useArm112Workspace({
    scenario: props.scenario,
    operatorName: 'ознакомление',
    mode: 'guided',
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const step = THEORY_STEPS[stepIndex] ?? THEORY_STEPS[0];
  const showJournal = step.id === 'call' && workspace.phase === 'входящий звонок';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setStepIndex((value) => Math.min(THEORY_STEPS.length - 1, value + 1));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setStepIndex((value) => Math.max(0, value - 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function selectRegion(regionId: TheoryRegionId) {
    const target = REGION_TO_STEP[regionId];
    if (!target) {
      return;
    }
    const index = THEORY_STEPS.findIndex((item) => item.id === target);
    if (index >= 0) {
      setStepIndex(index);
    }
  }

  return (
    <div className="arm112-shell is-guided" data-lesson="theory" data-scenario={props.scenario.code}>
      <div className="arm112-chrome">
        <button type="button" onClick={props.onLeave}>
          К уроку
        </button>
        <span>
          Теория · {workspace.binding.scenarioCode} {props.scenario.title}
        </span>
        <span className="arm112-chrome-meta">ознакомление с АРМ-112 · учебный вызов не запускается</span>
      </div>
      <div className="arm112-theory-split">
        <ArmGuidedProvider
          value={{
            activeRegionIds: step.regionIds,
            onSelectRegion: selectRegion,
          }}
        >
          <div className="arm112-workspace">
            {showJournal ? (
              <JournalScreen
                telephonyStatus={workspace.telephonyStatus}
                incoming
                incomingNumber={workspace.binding.incomingNumber}
                onAcceptCall={workspace.acceptCall}
                onDismissIncoming={() => undefined}
                onCreateCard={workspace.openManualCard}
                onToggleTelephony={() =>
                  workspace.setTelephonyStatus(workspace.telephonyStatus === 'доступен' ? 'недоступен' : 'доступен')
                }
              />
            ) : (
              <CardCreateScreen workspace={workspace} onClose={props.onLeave} />
            )}
          </div>
        </ArmGuidedProvider>
        <TheoryGuidePanel
          steps={THEORY_STEPS}
          activeIndex={stepIndex}
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed((value) => !value)}
          onSelect={setStepIndex}
          onPrev={() => setStepIndex((value) => Math.max(0, value - 1))}
          onNext={() => setStepIndex((value) => Math.min(THEORY_STEPS.length - 1, value + 1))}
        />
      </div>
    </div>
  );
}
