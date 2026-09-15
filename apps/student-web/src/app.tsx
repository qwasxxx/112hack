import { useState } from 'react';
import type { TrainingScenario } from './data/scenarios';
import { CatalogPage } from './pages/catalog-page';
import { BriefingPage } from './pages/briefing-page';
import { CallPage } from './pages/call-page';

type Screen =
  | { name: 'catalog' }
  | { name: 'briefing'; scenario: TrainingScenario }
  | { name: 'call'; scenario: TrainingScenario };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'catalog' });

  if (screen.name === 'briefing') {
    return (
      <BriefingPage
        scenario={screen.scenario}
        onBack={() => setScreen({ name: 'catalog' })}
        onStart={() => setScreen({ name: 'call', scenario: screen.scenario })}
      />
    );
  }

  if (screen.name === 'call') {
    return (
      <CallPage scenario={screen.scenario} onLeave={() => setScreen({ name: 'catalog' })} />
    );
  }

  return <CatalogPage onOpen={(scenario) => setScreen({ name: 'briefing', scenario })} />;
}
