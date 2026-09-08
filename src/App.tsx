import { useState } from 'react';

import { Header } from './components/Header';
import type { ViewId } from './data/content';
import { ArchitectureView } from './views/ArchitectureView';
import { FleetView } from './views/FleetView';
import { ImpactView } from './views/ImpactView';
import { JourneyView } from './views/JourneyView';
import { LiveAgentView } from './views/LiveAgentView';
import { PropositionView } from './views/PropositionView';

export function App() {
  const [view, setView] = useState<ViewId>('proposition');
  // Presenter switches: public figures and disclaimer on or off, and the
  // accountable-owner column for internal runs.
  const [showFigures, setShowFigures] = useState(true);
  const [showOwners, setShowOwners] = useState(false);

  return (
    <div className="app">
      <Header
        view={view}
        onSelect={setView}
        showFigures={showFigures}
        onToggleFigures={() => setShowFigures((v) => !v)}
        showOwners={showOwners}
        onToggleOwners={() => setShowOwners((v) => !v)}
      />

      {view === 'proposition' && (
        <PropositionView showFigures={showFigures} showOwners={showOwners} />
      )}
      {view === 'fleet' && <FleetView />}
      {view === 'arch' && <ArchitectureView />}
      {view === 'live' && <LiveAgentView />}
      {view === 'journey' && <JourneyView />}
      {view === 'impact' && <ImpactView />}
    </div>
  );
}
