import { useState } from 'react';
import type { Session } from './auth/accounts';
import { AccountBar } from './auth/account-bar';
import type { LessonSection, TrainingScenario } from './data/scenarios';
import { BriefingPage } from './pages/briefing-page';
import { CallPage } from './pages/call-page';
import { CatalogPage } from './pages/catalog-page';

type Screen =
  | { name: 'catalog' }
  | { name: 'briefing'; scenario: TrainingScenario }
  | { name: 'call'; scenario: TrainingScenario; section: LessonSection };

type Props = {
  operator: Session;
  onLogout: () => void;
};

export function StudentApp(props: Props) {
  const [screen, setScreen] = useState<Screen>({ name: 'catalog' });
  const bar = <AccountBar user={props.operator} onLogout={props.onLogout} />;

  if (screen.name === 'briefing') {
    return (
      <BriefingPage
        scenario={screen.scenario}
        accountBar={bar}
        onBack={() => setScreen({ name: 'catalog' })}
        onStart={(section) => setScreen({ name: 'call', scenario: screen.scenario, section })}
      />
    );
  }

  if (screen.name === 'call') {
    return (
      <CallPage
        scenario={screen.scenario}
        section={screen.section}
        onLeave={() => setScreen({ name: 'briefing', scenario: screen.scenario })}
      />
    );
  }

  return (
    <CatalogPage accountBar={bar} onOpen={(scenario) => setScreen({ name: 'briefing', scenario })} />
  );
}
