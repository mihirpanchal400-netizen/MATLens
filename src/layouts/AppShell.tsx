import React from 'react';
import type { PageId } from '../types';
import { useApp } from '../state/AppState';
import { Icon, type IconName } from '../components/Icon';
import { Badge } from '../components/ui';
import { formatValue } from '../utils/format';

interface NavEntry {
  id: PageId;
  label: string;
  icon: IconName;
}

const NAV_GROUPS: Array<{ label: string; items: NavEntry[] }> = [
  {
    label: 'Analyse',
    items: [
      { id: 'overview', label: 'Overview', icon: 'overview' },
      { id: 'market', label: 'Market Landscape', icon: 'market' },
      { id: 'brand', label: 'Brand Performance', icon: 'brand' },
      { id: 'competitors', label: 'Competitor Intelligence', icon: 'competitors' },
      { id: 'opportunities', label: 'Opportunity Signals', icon: 'opportunities' },
      { id: 'insights', label: 'Insight Center', icon: 'insights' },
    ],
  },
  {
    label: 'Data',
    items: [
      { id: 'explorer', label: 'Data Explorer', icon: 'explorer' },
      { id: 'upload', label: 'Upload Data', icon: 'upload' },
      { id: 'methodology', label: 'Methodology', icon: 'methodology' },
    ],
  },
];

const PAGE_TITLES: Record<PageId, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'What is happening, what changed, and what needs attention' },
  market: { title: 'Market Landscape', subtitle: 'Size, structure and where the category is growing' },
  brand: { title: 'Brand Performance', subtitle: 'One brand against its market, its competitors and its own history' },
  competitors: { title: 'Competitor Intelligence', subtitle: 'Who is gaining, who is losing, and who is worth watching' },
  opportunities: { title: 'Opportunity Signals', subtitle: 'Where the data suggests the brand is not capturing available growth' },
  insights: { title: 'Insight Center', subtitle: 'What a Brand Manager should pay attention to, and why' },
  explorer: { title: 'Data Explorer', subtitle: 'The underlying rows, and how every derived metric was calculated' },
  upload: { title: 'Upload Data', subtitle: 'Load a MAT extract, review how it was understood, and correct the mapping' },
  methodology: { title: 'Methodology', subtitle: 'Every formula, threshold and limitation MATLens applies' },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { page, goTo, dataset, analysis, insights, focusBrandName, setFocusBrand } = useApp();
  const meta = PAGE_TITLES[page];
  const attentionCount = insights.filter((i) => i.severity === 'critical' || i.severity === 'serious').length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="logo">
            <span className="logo__mark">M</span>
            <div>
              <div className="logo__name">MATLens</div>
              <div className="logo__tag">From market data to brand decisions</div>
            </div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          {NAV_GROUPS.map((group) => (
            <div className="nav__group" key={group.label}>
              <div className="nav__label t-eyebrow">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav__item ${page === item.id ? 'nav__item--active' : ''}`}
                  onClick={() => goTo(item.id)}
                  aria-current={page === item.id ? 'page' : undefined}
                >
                  <span className="nav__icon">
                    <Icon name={item.icon} size={16} />
                  </span>
                  {item.label}
                  {item.id === 'insights' && attentionCount > 0 && (
                    <span className="nav__count" title={`${attentionCount} findings need attention`}>
                      {attentionCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          {dataset ? (
            <div className="t-micro">
              <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                <Icon name="file" size={13} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dataset.fileName}>
                  {dataset.fileName}
                </span>
              </div>
              {analysis && (
                <div>
                  {analysis.market.brandCount.toLocaleString('en-IN')} brands · {formatValue(analysis.market.totalValue)}
                </div>
              )}
            </div>
          ) : (
            <p className="t-micro">No dataset loaded.</p>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__title">
            <h1 className="t-h1">{meta.title}</h1>
            <p className="t-sub">{meta.subtitle}</p>
          </div>
          <div className="topbar__spacer" />
          <div className="topbar__meta">
            {dataset?.isSynthetic && <Badge tone="synthetic">Synthetic demo data</Badge>}
            {dataset && analysis && analysis.brands.length > 0 && (
              <label className="row" style={{ gap: 7 }}>
                <span className="t-eyebrow">Focus brand</span>
                <select
                  className="select"
                  value={focusBrandName ?? ''}
                  onChange={(event) => setFocusBrand(event.target.value || null)}
                  style={{ maxWidth: 200 }}
                >
                  {analysis.brands.map((brand) => (
                    <option key={brand.name} value={brand.name}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn" onClick={() => goTo('upload')}>
              <Icon name="upload" size={14} />
              {dataset ? 'Change data' : 'Upload data'}
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
