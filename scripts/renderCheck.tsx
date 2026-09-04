/**
 * Server-side render smoke test.
 *
 * Renders every screen with a real dataset behind it and asserts the output.
 * It catches the class of failure a numeric test cannot: a component reading a
 * property that is null on some datasets, a missing guard, a page that throws
 * when growth is unavailable.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../src/layouts/AppShell';
import { SignIn } from '../src/auth/SignIn';
import { AppStateProvider } from '../src/state/AppState';
import { BrandPerformance } from '../src/pages/BrandPerformance';
import { CompetitorIntelligence } from '../src/pages/CompetitorIntelligence';
import { DataExplorer } from '../src/pages/DataExplorer';
import { InsightCenter } from '../src/pages/InsightCenter';
import { Landing } from '../src/pages/Landing';
import { MarketLandscape } from '../src/pages/MarketLandscape';
import { MoleculeExplorer } from '../src/pages/MoleculeExplorer';
import { Methodology } from '../src/pages/Methodology';
import { OpportunitySignals } from '../src/pages/OpportunitySignals';
import { Overview } from '../src/pages/Overview';
import { UploadData } from '../src/pages/UploadData';
import type { Dataset, PageId } from '../src/types';

export const PAGES: Array<{ id: PageId; label: string; Component: () => JSX.Element }> = [
  { id: 'overview', label: 'Overview', Component: Overview },
  { id: 'market', label: 'Market Landscape', Component: MarketLandscape },
  { id: 'brand', label: 'Brand Performance', Component: BrandPerformance },
  { id: 'molecules', label: 'Molecule Explorer', Component: MoleculeExplorer },
  { id: 'competitors', label: 'Competitor Intelligence', Component: CompetitorIntelligence },
  { id: 'opportunities', label: 'Opportunity Signals', Component: OpportunitySignals },
  { id: 'insights', label: 'Insight Center', Component: InsightCenter },
  { id: 'explorer', label: 'Data Explorer', Component: DataExplorer },
  { id: 'upload', label: 'MAT Data Upload', Component: UploadData },
  { id: 'methodology', label: 'Methodology', Component: Methodology },
];

/** Renders one screen inside the real shell and provider. Throws on failure. */
export function renderPage(page: PageId, dataset: Dataset | null): string {
  const entry = PAGES.find((p) => p.id === page);
  if (!entry) throw new Error(`Unknown page ${page}`);
  const { Component } = entry;
  return renderToStaticMarkup(
    <AppStateProvider initialDataset={dataset} initialPage={page}>
      <AppShell>
        <Component />
      </AppShell>
    </AppStateProvider>,
  );
}

/** Renders the sign-in gate that stands in front of the published build. */
export function renderSignIn(): string {
  return renderToStaticMarkup(<SignIn onSuccess={() => {}} />);
}

/** Renders the empty-state landing screen with no dataset at all. */
export function renderLanding(): string {
  return renderToStaticMarkup(
    <AppStateProvider>
      <AppShell>
        <Landing />
      </AppShell>
    </AppStateProvider>,
  );
}
