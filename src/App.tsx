import { AppShell } from './layouts/AppShell';
import { AppStateProvider, useApp } from './state/AppState';
import { BrandPerformance } from './pages/BrandPerformance';
import { CompetitorIntelligence } from './pages/CompetitorIntelligence';
import { DataExplorer } from './pages/DataExplorer';
import { InsightCenter } from './pages/InsightCenter';
import { MarketLandscape } from './pages/MarketLandscape';
import { MoleculeExplorer } from './pages/MoleculeExplorer';
import { Methodology } from './pages/Methodology';
import { OpportunitySignals } from './pages/OpportunitySignals';
import { Overview } from './pages/Overview';
import { UploadData } from './pages/UploadData';

function Router() {
  const { page } = useApp();
  switch (page) {
    case 'market':
      return <MarketLandscape />;
    case 'brand':
      return <BrandPerformance />;
    case 'molecules':
      return <MoleculeExplorer />;
    case 'competitors':
      return <CompetitorIntelligence />;
    case 'opportunities':
      return <OpportunitySignals />;
    case 'insights':
      return <InsightCenter />;
    case 'explorer':
      return <DataExplorer />;
    case 'upload':
      return <UploadData />;
    case 'methodology':
      return <Methodology />;
    case 'overview':
    default:
      return <Overview />;
  }
}

export default function App() {
  return (
    <AppStateProvider>
      <AppShell>
        <Router />
      </AppShell>
    </AppStateProvider>
  );
}
