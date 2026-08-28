import { useState } from 'react';
import { useApp } from '../state/AppState';
import { FORMULAS } from '../analytics/metrics';
import { UNSPECIFIED } from '../analytics/analyse';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { NoDataState } from '../components/NoDataState';
import { Card, Formula, Section } from '../components/ui';
import type { EntityMetrics, NormalizedRow } from '../types';
import { formatInt, formatPct, formatPp, formatRank, formatValue, toneClass } from '../utils/format';

const FORMULA_ENTRIES: Array<{ label: string; formula: string; note: string }> = [
  { label: 'Growth', formula: FORMULAS.growth, note: 'Left blank when the previous period is zero, negative or missing — growth against a non-positive base is undefined, not infinite.' },
  { label: 'Market share', formula: FORMULAS.share, note: 'Total market means the total of the rows currently in scope, so filters change the denominator.' },
  { label: 'Previous share', formula: FORMULAS.previousShare, note: 'Uses the previous-period market total, not the current one — otherwise share change would double-count market growth.' },
  { label: 'Share change', formula: FORMULAS.shareChange, note: 'Reported in percentage points (pp), never as a percentage of a percentage.' },
  { label: 'Growth gap', formula: FORMULAS.growthGap, note: 'The single comparison that decides whether a positive growth number is actually good.' },
  { label: 'Rank', formula: FORMULAS.rank, note: 'Recomputed within the current selection rather than read from the file.' },
  { label: 'Rank change', formula: FORMULAS.rankChange, note: 'Positive means the brand moved up. Only calculated when every brand in scope has a previous value.' },
  { label: 'Contribution to growth', formula: FORMULAS.contribution, note: 'Withheld when the market shrank, because the ratio inverts its sign and misleads.' },
  { label: 'Unit growth', formula: FORMULAS.unitGrowth, note: 'Requires both current and previous unit columns.' },
  { label: 'Price / mix effect', formula: FORMULAS.priceMix, note: 'An approximation of the value growth not explained by volume. It is not a measured price.' },
  { label: 'Market concentration', formula: `${FORMULAS.hhi}\n${FORMULAS.cr4}`, note: 'HHI under 1,500 is described as fragmented, 1,500–2,500 moderately concentrated, above 2,500 concentrated.' },
  { label: 'Regional concentration', formula: FORMULAS.concentration, note: 'Compared against an even split across the regions present in the file.' },
];

export function DataExplorer() {
  const { dataset, analysis, rows, focusBrand } = useApp();
  const [tab, setTab] = useState<'rows' | 'brands'>('rows');

  if (!dataset || !analysis) return <NoDataState what="the Data Explorer" />;

  const caps = dataset.capabilities;

  const rowColumnCandidates: Array<Column<NormalizedRow> | null> = [
    { key: 'brand', header: 'Brand', sortValue: (r) => r.brand, exportValue: (r) => r.brand, render: (r) => <span className="strong">{r.brand}</span> },
    caps.hasCompany ? { key: 'company', header: 'Company', sortValue: (r) => r.company, exportValue: (r) => r.company, render: (r) => r.company ?? UNSPECIFIED } : null,
    caps.hasMolecule ? { key: 'molecule', header: 'Molecule', sortValue: (r) => r.molecule, exportValue: (r) => r.molecule, render: (r) => r.molecule ?? UNSPECIFIED } : null,
    caps.hasTherapy ? { key: 'therapy', header: 'Therapy', sortValue: (r) => r.therapy, exportValue: (r) => r.therapy, render: (r) => r.therapy ?? UNSPECIFIED, defaultHidden: true } : null,
    caps.hasSegment ? { key: 'segment', header: 'Segment', sortValue: (r) => r.segment, exportValue: (r) => r.segment, render: (r) => r.segment ?? UNSPECIFIED } : null,
    caps.hasRegion ? { key: 'region', header: 'Region', sortValue: (r) => r.region, exportValue: (r) => r.region, render: (r) => r.region ?? UNSPECIFIED } : null,
    { key: 'value', header: 'MAT value', numeric: true, sortValue: (r) => r.matValue, exportValue: (r) => r.matValue, render: (r) => formatValue(r.matValue) },
    caps.hasPreviousValue ? { key: 'prev', header: 'Previous MAT', numeric: true, sortValue: (r) => r.prevMatValue, exportValue: (r) => r.prevMatValue, render: (r) => formatValue(r.prevMatValue) } : null,
    caps.hasUnits ? { key: 'units', header: 'MAT units', numeric: true, sortValue: (r) => r.matUnits, exportValue: (r) => r.matUnits, render: (r) => formatInt(r.matUnits), defaultHidden: true } : null,
    caps.hasPreviousUnits ? { key: 'prevUnits', header: 'Previous units', numeric: true, sortValue: (r) => r.prevMatUnits, exportValue: (r) => r.prevMatUnits, render: (r) => formatInt(r.prevMatUnits), defaultHidden: true } : null,
  ];
  const rowColumns = rowColumnCandidates.filter(Boolean) as Column<NormalizedRow>[];

  const brandColumns: Column<EntityMetrics>[] = [
    { key: 'rank', header: 'Rank', numeric: true, sortValue: (b) => b.rank, exportValue: (b) => b.rank, render: (b) => formatRank(b.rank) },
    { key: 'brand', header: 'Brand', sortValue: (b) => b.name, exportValue: (b) => b.name, render: (b) => <span className="strong">{b.name}</span> },
    { key: 'company', header: 'Company', sortValue: (b) => b.company, exportValue: (b) => b.company, render: (b) => b.company ?? UNSPECIFIED },
    { key: 'value', header: 'MAT value', numeric: true, sortValue: (b) => b.matValue, exportValue: (b) => Math.round(b.matValue), render: (b) => formatValue(b.matValue) },
    { key: 'prev', header: 'Previous MAT', numeric: true, sortValue: (b) => b.prevMatValue, exportValue: (b) => (b.prevMatValue === null ? '' : Math.round(b.prevMatValue)), render: (b) => formatValue(b.prevMatValue) },
    { key: 'change', header: 'Value change', numeric: true, sortValue: (b) => b.absoluteChange, exportValue: (b) => (b.absoluteChange === null ? '' : Math.round(b.absoluteChange)), render: (b) => <span className={toneClass(b.absoluteChange)}>{formatValue(b.absoluteChange)}</span> },
    { key: 'growth', header: 'Growth', numeric: true, sortValue: (b) => b.growthPct, exportValue: (b) => (b.growthPct === null ? '' : b.growthPct.toFixed(2)), render: (b) => <span className={toneClass(b.growthPct)}>{formatPct(b.growthPct, { signed: true })}</span> },
    { key: 'share', header: 'Share', numeric: true, sortValue: (b) => b.sharePct, exportValue: (b) => (b.sharePct === null ? '' : b.sharePct.toFixed(3)), render: (b) => formatPct(b.sharePct, { decimals: 2 }) },
    { key: 'prevShare', header: 'Previous share', numeric: true, sortValue: (b) => b.prevSharePct, exportValue: (b) => (b.prevSharePct === null ? '' : b.prevSharePct.toFixed(3)), render: (b) => formatPct(b.prevSharePct, { decimals: 2 }), defaultHidden: true },
    { key: 'shareChange', header: 'Share change', numeric: true, sortValue: (b) => b.shareChangePp, exportValue: (b) => (b.shareChangePp === null ? '' : b.shareChangePp.toFixed(3)), render: (b) => <span className={toneClass(b.shareChangePp)}>{formatPp(b.shareChangePp, 2)}</span> },
    { key: 'unitGrowth', header: 'Unit growth', numeric: true, sortValue: (b) => b.unitGrowthPct, exportValue: (b) => (b.unitGrowthPct === null ? '' : b.unitGrowthPct.toFixed(2)), render: (b) => formatPct(b.unitGrowthPct, { signed: true }), defaultHidden: true },
    { key: 'contribution', header: 'Share of growth', numeric: true, sortValue: (b) => b.growthContributionPct, exportValue: (b) => (b.growthContributionPct === null ? '' : b.growthContributionPct.toFixed(2)), render: (b) => formatPct(b.growthContributionPct, { decimals: 1 }), defaultHidden: true },
  ];

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Card
        title="Explore the data"
        subtitle={`${dataset.fileName}${dataset.raw.sheetName ? ` · ${dataset.raw.sheetName}` : ''} · ${dataset.rows.length.toLocaleString('en-IN')} usable rows in the file, ${rows.length.toLocaleString('en-IN')} in the current selection`}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <button className={`btn btn--sm ${tab === 'rows' ? 'btn--primary' : ''}`} onClick={() => setTab('rows')}>
              Analysis rows
            </button>
            <button className={`btn btn--sm ${tab === 'brands' ? 'btn--primary' : ''}`} onClick={() => setTab('brands')}>
              Derived brand metrics
            </button>
          </div>
        }
        flush
      >
        {tab === 'rows' ? (
          <DataTable
            rows={rows}
            columns={rowColumns}
            rowKey={(r) => String(r.id)}
            initialSort={{ key: 'value', direction: 'desc' }}
            searchText={(r) => `${r.brand} ${r.company ?? ''} ${r.molecule ?? ''} ${r.segment ?? ''} ${r.region ?? ''}`}
            searchPlaceholder="Search rows…"
            highlight={(r) => r.brand === focusBrand?.name}
            exportFileName="matlens-analysis-rows.csv"
            columnToggle
          />
        ) : (
          <DataTable
            rows={analysis.brands}
            columns={brandColumns}
            rowKey={(b) => b.name}
            initialSort={{ key: 'value', direction: 'desc' }}
            searchText={(b) => `${b.name} ${b.company ?? ''} ${b.molecule ?? ''} ${b.segment ?? ''}`}
            searchPlaceholder="Search brands…"
            highlight={(b) => b.name === focusBrand?.name}
            exportFileName="matlens-brand-metrics.csv"
            columnToggle
          />
        )}
      </Card>

      <div style={{ height: 24 }} />

      <Section
        title="How was this calculated?"
        subtitle="Every derived number in MATLens comes from one of these formulas. Nothing is estimated, smoothed or modelled."
      >
        <div className="grid grid--2">
          {FORMULA_ENTRIES.map((entry) => (
            <Card key={entry.label} title={entry.label}>
              <Formula>{entry.formula}</Formula>
              <p className="t-micro" style={{ marginTop: 8 }}>{entry.note}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
