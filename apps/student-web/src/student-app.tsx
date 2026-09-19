import { useState } from 'react';
import type { Session } from './auth/accounts';
import { AccountBar } from './auth/account-bar';
import type { TrainingScenario } from './data/scenarios';
import { Arm112TheoryPage, Arm112TrainingPage } from './features/arm112-simulator';
import { DdsTrainingPage } from './features/dds-training';
import { readLearnerTrack, writeLearnerTrack, type LearnerTrack } from './learner-track';
import { lessonScreenFor, type LessonScreenName } from './lesson-routing';
import { BriefingPage } from './pages/briefing-page';
import { CallPage } from './pages/call-page';
import { CatalogPage } from './pages/catalog-page';

type Screen =
  | { name: 'catalog' }
  | { name: 'briefing'; scenario: TrainingScenario }
  | { name: LessonScreenName; scenario: TrainingScenario }
  | { name: 'dds'; scenario: TrainingScenario };

type Props = {
  operator: Session;
  onLogout: () => void;
};

export function StudentApp(props: Props) {
  const [screen, setScreen] = useState<Screen>({ name: 'catalog' });
  const [track, setTrack] = useState<LearnerTrack>(() => readLearnerTrack());
  const bar = <AccountBar user={props.operator} onLogout={props.onLogout} />;

  function changeTrack(next: LearnerTrack) {
    setTrack(next);
    writeLearnerTrack(next);
    setScreen({ name: 'catalog' });
  }

  if (screen.name === 'briefing') {
    return (
      <BriefingPage
        scenario={screen.scenario}
        track={track}
        accountBar={bar}
        onBack={() => setScreen({ name: 'catalog' })}
        onStart={(section) =>
          setScreen({ name: lessonScreenFor(section), scenario: screen.scenario })
        }
        onStartDds={() => setScreen({ name: 'dds', scenario: screen.scenario })}
      />
    );
  }

  if (screen.name === 'dds') {
    return (
      <DdsTrainingPage
        scenario={screen.scenario}
        onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
      />
    );
  }

  if (screen.name === 'theory') {
    return (
      <Arm112TheoryPage
        scenario={screen.scenario}
        onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
      />
    );
  }

  if (screen.name === 'training') {
    return (
      <Arm112TrainingPage
        scenario={screen.scenario}
        operatorName={props.operator.name}
        onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
      />
    );
  }

  if (screen.name === 'exam') {
    return (
      <CallPage
        scenario={screen.scenario}
        section="exam"
        onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
      />
    );
  }

  return (
    <CatalogPage
      accountBar={bar}
      track={track}
      onTrack={changeTrack}
      onOpen={(scenario) => setScreen({ name: 'briefing', scenario })}
    />
  );
}
