import { useEffect, useRef, useState } from 'react';
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
import { DebriefPage, DdsDebriefPage, type DdsFinish, type TrainingFinish } from './pages/debrief-page';
import { clearDdsHint, clearLive, liveCardSnapshot, upsertLive } from './progress';
import { TeacherCueBanner } from './progress/teacher-cue-banner';

type Screen =
  | { name: CatalogView }
  | { name: 'briefing'; scenario: TrainingScenario }
  | { name: 'theory' }
  | { name: 'training'; scenario: TrainingScenario }
  | { name: 'debrief'; briefing: TrainingScenario; finish: TrainingFinish }
  | { name: 'dds-debrief'; briefing: TrainingScenario; finish: DdsFinish }
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
  const liveStarted = useRef<string | null>(null);
  const liveKey = useRef('');
  const bar = <AccountBar user={props.operator} onLogout={props.onLogout} />;

  useEffect(() => {
    return () => {
      clearLive(props.operator.login);
      clearDdsHint(props.operator.login);
    };
  }, [props.operator.login]);

  useEffect(() => {
    const live =
      screen.name === 'briefing' ||
      screen.name === 'theory' ||
      screen.name === 'training' ||
      screen.name === 'exam' ||
      screen.name === 'dds'
        ? screen
        : null;
    if (!live) {
      liveStarted.current = null;
      liveKey.current = '';
      clearLive(props.operator.login);
      clearDdsHint(props.operator.login);
      return;
    }
    const scenario = 'scenario' in live ? live.scenario : undefined;
    const key = `${live.name}:${scenario?.id ?? ''}`;
    if (liveKey.current !== key) {
      liveKey.current = key;
      liveStarted.current = new Date().toISOString();
    }
    const startedAt = liveStarted.current ?? new Date().toISOString();
    const mode = live.name === 'exam' ? 'exam' : live.name === 'dds' ? 'dds' : 'training';
    const phaseLabel = live.name === 'briefing' ? 'Брифинг' : live.name === 'theory' ? 'Теория' : undefined;
    function beat() {
      const snap = scenario
        ? liveCardSnapshot(props.operator.login, scenario.id, mode)
        : { percent: 0, found: 0, missed: 0, phase: phaseLabel ?? '', fields: {}, rows: [] };
      upsertLive({
        login: props.operator.login,
        name: props.operator.name,
        scenarioId: scenario?.id ?? 'theory',
        scenarioTitle: scenario?.title ?? 'Теория АРМ-112',
        mode,
        startedAt,
        cardProgress: snap.percent,
        foundActions: snap.found,
        missedActions: snap.missed,
        phase: phaseLabel ?? snap.phase,
        cardRows: snap.rows,
        updatedAt: new Date().toISOString(),
      });
    }
    beat();
    const timer = window.setInterval(beat, 1500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        beat();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [props.operator.login, props.operator.name, screen]);

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
      <>
        <TeacherCueBanner login={props.operator.login} />
        <DdsTrainingPage
          scenario={screen.scenario}
          operatorLogin={props.operator.login}
          onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
          onCompleted={
            props.onDdsTrainingComplete
              ? (result) => props.onDdsTrainingComplete?.(result, screen.scenario)
              : undefined
          }
          onFinished={(finish) => setScreen({ name: 'dds-debrief', briefing: screen.scenario, finish })}
        />
      </>
    );
  }

  if (screen.name === 'theory') {
    return <Arm112TheoryPage onLeave={() => setScreen({ name: 'catalog' })} />;
  }

  if (screen.name === 'training' || screen.name === 'exam') {
    return (
      <>
        <TeacherCueBanner login={props.operator.login} />
        <Arm112TrainingPage
          scenario={screen.scenario}
          operatorName={props.operator.name}
          operatorLogin={props.operator.login}
          kind={screen.name}
          onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
          onCompleted={props.onArmTrainingComplete}
          onFinished={(finish) => setScreen({ name: 'debrief', briefing: screen.scenario, finish })}
        />
      </>
    );
  }

  if (screen.name === 'dds-debrief') {
    return (
      <DdsDebriefPage
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
