import { useState } from 'react';
import type { LessonSection, TrainingScenario } from './data/scenarios';
import { CatalogPage } from './pages/catalog-page';
import { BriefingPage } from './pages/briefing-page';
import { CallPage } from './pages/call-page';

type Screen =
  | { name: 'catalog' }
  | { name: 'briefing'; scenario: TrainingScenario }
  | { name: 'call'; scenario: TrainingScenario; section: LessonSection };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'catalog' });

  if (screen.name === 'briefing') {
    return (
      <BriefingPage
        scenario={screen.scenario}
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

  return <CatalogPage onOpen={(scenario) => setScreen({ name: 'briefing', scenario })} />;
}
