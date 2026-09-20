import { useState } from 'react';
import type { Session } from './auth/accounts';
import { AccountBar } from './auth/account-bar';
import type { TrainingScenario } from './data/scenarios';
import { Arm112TheoryPage, Arm112TrainingPage } from './features/arm112-simulator';
import type { Arm112PracticalResult } from './features/arm112-simulator/model/training-result';
import { DdsTrainingPage } from './features/dds-training';
import type { DdsCheckResult } from './features/dds-training/use-dds-session';
import { readLearnerTrack, writeLearnerTrack, type LearnerTrack } from './learner-track';
import { lessonScreenFor } from './lesson-routing';
import { BriefingPage } from './pages/briefing-page';
import { CatalogPage, type CatalogView } from './pages/catalog-page';
import { DebriefPage, type TrainingFinish } from './pages/debrief-page';

type Screen =
  | { name: CatalogView }
  | { name: 'briefing'; scenario: TrainingScenario }
  | { name: 'theory' }
  | { name: 'training'; scenario: TrainingScenario }
  | { name: 'debrief'; briefing: TrainingScenario; finish: TrainingFinish }
  | { name: 'exam'; scenario: TrainingScenario }
  | { name: 'dds'; scenario: TrainingScenario };

type Props = {
  operator: Session;
  onLogout: () => void;
  onArmTrainingComplete?: (result: Arm112PracticalResult) => void;
  onDdsTrainingComplete?: (
    result: DdsCheckResult,
    scenario: TrainingScenario,
  ) => void;
};

export function StudentApp(props: Props) {
  const [screen, setScreen] = useState<Screen>({ name: 'catalog' });
  const [track, setTrack] = useState<LearnerTrack>(() => readLearnerTrack());
  const bar = <AccountBar user={props.operator} onLogout={props.onLogout} />;

  function changeTrack(next: LearnerTrack) {
    setTrack(next);
    writeLearnerTrack(next);
  }

  if (screen.name === 'briefing') {
    return (
      <BriefingPage
        scenario={screen.scenario}
        track={track}
        accountBar={bar}
        onBack={() => setScreen({ name: 'catalog' })}
        onSessions={() => setScreen({ name: 'sessions' })}
        onHandbook={() => setScreen({ name: 'handbook' })}
        onStart={(section) => {
          const name = lessonScreenFor(section);
          if (name === 'theory') {
            setScreen({ name: 'theory' });
            return;
          }
          if (name === 'training') {
            setScreen({ name: 'training', scenario: screen.scenario });
            return;
          }
          setScreen({ name: 'exam', scenario: screen.scenario });
        }}
        onStartDds={() => setScreen({ name: 'dds', scenario: screen.scenario })}
      />
    );
  }

  if (screen.name === 'dds') {
    return (
      <DdsTrainingPage
        scenario={screen.scenario}
        operatorLogin={props.operator.login}
        onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
        onCompleted={
          props.onDdsTrainingComplete
            ? (result) => props.onDdsTrainingComplete?.(result, screen.scenario)
            : undefined
        }
      />
    );
  }

  if (screen.name === 'theory') {
    return <Arm112TheoryPage onLeave={() => setScreen({ name: 'catalog' })} />;
  }

  if (screen.name === 'training' || screen.name === 'exam') {
    return (
      <Arm112TrainingPage
        scenario={screen.scenario}
        operatorName={props.operator.name}
        operatorLogin={props.operator.login}
        kind={screen.name}
        onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
        onCompleted={props.onArmTrainingComplete}
        onFinished={(finish) => setScreen({ name: 'debrief', briefing: screen.scenario, finish })}
      />
    );
  }

  if (screen.name === 'debrief') {
    return (
      <DebriefPage
        finish={screen.finish}
        operatorLogin={props.operator.login}
        operatorName={props.operator.name}
        accountBar={bar}
        onCatalog={() => setScreen({ name: 'catalog' })}
        onSessions={() => setScreen({ name: 'sessions' })}
        onHandbook={() => setScreen({ name: 'handbook' })}
        onBriefing={() => setScreen({ name: 'briefing', scenario: screen.briefing })}
      />
    );
  }

  return (
    <CatalogPage
      accountBar={bar}
      track={track}
      view={screen.name}
      operatorLogin={props.operator.login}
      operatorName={props.operator.name}
      onTrack={(next) => {
        changeTrack(next);
        setScreen({ name: 'catalog' });
      }}
      onOpen={(scenario) => setScreen({ name: 'briefing', scenario })}
      onTheory={() => setScreen({ name: 'theory' })}
      onSessions={() => setScreen({ name: 'sessions' })}
      onHandbook={() => setScreen({ name: 'handbook' })}
      onCatalog={() => setScreen({ name: 'catalog' })}
    />
  );
}
