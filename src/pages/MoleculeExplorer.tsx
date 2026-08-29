import { useMemo, useState } from 'react';
import { useApp } from '../state/AppState';
import { UNSPECIFIED, analyse } from '../analytics/analyse';
import { growthGapPp } from '../analytics/metrics';
import { generateInsights } from '../analytics/insightEngine';
import { HBarChart, type HBarDatum } from '../charts/HBarChart';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { Icon } from '../components/Icon';
import { InsightCard } from '../components/InsightCard';
import { NoDataState, Unavailable } from '../components/NoDataState';
import { Badge, Callout, Card, KpiTile, MiniBar, Section } from '../components/ui';
import type { EntityMetrics, NormalizedRow } from '../types';
import { formatPct, formatPp, formatRank, formatValue, formatValueAxis, toneClass } from '../utils/format';

/** The attribute carrying the most value across a set of rows. */
function dominantSegment(rows: NormalizedRow[]): string | null {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.segment) continue;
    totals.set(row.segment, (totals.get(row.segment) ?? 0) + (row.matValue ?? 0));
  }
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const [name, value] of totals) {
    if (value > bestValue) {
      best = name;
      bestValue = value;
    }
  }
  return best;
}

export function MoleculeExplorer() {
  const { dataset, analysis, rows, focusBrand, setFocusBrand, goTo } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const molecules = useMemo(
    () => (analysis ? analysis.molecules.filter((m) => m.name !== UNSPECIFIED) : []),
    [analysis],
  );

  // Default to the focus brand's molecule — the one the user is most likely to
  // be asking about — and fall back to the largest.
  const current = useMemo(() => {
    if (selected && molecules.some((m) => m.name === selected)) return selected;
    if (focusBrand?.molecule && molecules.some((m) => m.name === focusBrand.molecule)) return focusBrand.molecule;
    return molecules[0]?.name ?? null;
  }, [selected, focusBrand, molecules]);

  const moleculeRows = useMemo(
    () => (current ? rows.filter((row) => row.molecule === current) : []),
    [rows, current],
  );
  const inMolecule = useMemo(() => (moleculeRows.length ? analyse(moleculeRows) : null), [moleculeRows]);

  const parentClass = useMemo(() => dominantSegment(moleculeRows), [moleculeRows]);
  const classRows = useMemo(
    () => (parentClass ? rows.filter((row) => row.segment === parentClass) : []),
    [rows, parentClass],
  );
  const inClass = useMemo(() => (classRows.length ? analyse(classRows) : null), [classRows]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle ? molecules.filter((m) => m.name.toLowerCase().includes(needle)) : molecules;
    return { options: pool.slice(0, 200), total: pool.length };
  }, [molecules, query]);

  const signals = useMemo(() => {
    if (!inMolecule || !dataset) return [];
    const anchor = inMolecule.brands.find((b) => b.name === focusBrand?.name) ?? inMolecule.brands[0] ?? null;
    return generateInsights(inMolecule, anchor, dataset.capabilities)
      .filter((insight) => insight.scope !== 'data')
      .slice(0, 4);
  }, [inMolecule, dataset, focusBrand]);

  if (!dataset || !analysis) return <NoDataState what="molecule analysis" />;

  if (!dataset.capabilities.hasMolecule) {
    return (
      <>
        <FilterBar />
        <Card title="Molecule analysis is unavailable for this dataset">
          <Unavailable
            metric="Molecule analysis"
            reason="No molecule column was identified in this file. Market audits often give it an opaque header — PharmaTrac calls it Sub Group, under Super Group and Sub Super Group — so MATLens also checks whether a column's values look like molecule names. If your file has one under another name, map it on the Upload screen and this whole screen becomes available."
          />
          <div style={{ marginTop: 14 }}>
            <button className="btn btn--primary" onClick={() => goTo('upload')}>
              <Icon name="upload" size={14} />
              Review the column mapping
            </button>
          </div>
        </Card>
      </>
    );
  }

  const marketLevel = molecules.find((m) => m.name === current) ?? null;
  const classLevel = parentClass ? analysis.segments.find((s) => s.name === parentClass) ?? null : null;
  const gapVsMarket = growthGapPp(marketLevel?.growthPct ?? null, analysis.market.growthPct);
  const gapVsClass = growthGapPp(marketLevel?.growthPct ?? null, classLevel?.growthPct ?? null);

  const benchmark: HBarDatum[] = [
    marketLevel?.growthPct !== null && marketLevel !== null
      ? { name: marketLevel.name, value: marketLevel.growthPct as number, emphasis: true }
      : null,
    classLevel?.growthPct !== null && classLevel !== undefined && classLevel !== null
      ? { name: `${classLevel.name} (class)`, value: classLevel.growthPct as number }
      : null,
    analysis.market.growthPct !== null ? { name: 'Total market', value: analysis.market.growthPct } : null,
  ].filter(Boolean) as HBarDatum[];

  const siblings = (inClass?.molecules ?? []).filter((m) => m.name !== UNSPECIFIED);
  const siblingChart: HBarDatum[] = siblings
    .filter((m) => m.shareChangePp !== null)
    .slice()
    .sort((a, b) => (b.shareChangePp ?? 0) - (a.shareChangePp ?? 0))
    .filter((_, index, list) => index < 6 || index >= list.length - 6)
    .map((m) => ({
      name: m.name,
      value: m.shareChangePp ?? 0,
      emphasis: m.name === current,
      detail: [
        { label: 'MAT value', value: formatValue(m.matValue) },
        { label: 'Growth', value: formatPct(m.growthPct, { signed: true }) },
        { label: 'Share of class', value: formatPct(m.sharePct, { decimals: 2 }) },
      ],
    }));

  const maxBrandValue = inMolecule?.brands[0]?.matValue ?? 0;

  const brandColumns: Column<EntityMetrics>[] = [
    { key: 'rank', header: 'Rank', numeric: true, sortValue: (b) => b.rank, exportValue: (b) => b.rank, render: (b) => formatRank(b.rank) },
    {
      key: 'brand',
      header: 'Brand',
      sortValue: (b) => b.name,
      exportValue: (b) => b.name,
      render: (b) => (
        <span className="strong">
          {b.name}
          {b.name === focusBrand?.name && (
            <>
              {' '}
              <Badge tone="accent">Focus</Badge>
            </>
          )}
        </span>
      ),
    },
    { key: 'company', header: 'Company', sortValue: (b) => b.company, exportValue: (b) => b.company, render: (b) => b.company ?? UNSPECIFIED },
    {
      key: 'value',
      header: 'MAT value',
      numeric: true,
      sortValue: (b) => b.matValue,
      exportValue: (b) => Math.round(b.matValue),
      render: (b) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <MiniBar value={b.matValue} max={maxBrandValue} />
          <span>{formatValue(b.matValue)}</span>
        </div>
      ),
    },
    { key: 'growth', header: 'Growth', numeric: true, sortValue: (b) => b.growthPct, exportValue: (b) => b.growthPct?.toFixed(2) ?? '', render: (b) => <span className={toneClass(b.growthPct)}>{formatPct(b.growthPct, { signed: true })}</span> },
    { key: 'share', header: 'Share of molecule', numeric: true, sortValue: (b) => b.sharePct, exportValue: (b) => b.sharePct?.toFixed(3) ?? '', render: (b) => formatPct(b.sharePct, { decimals: 2 }) },
    { key: 'shareChange', header: 'Share change', numeric: true, sortValue: (b) => b.shareChangePp, exportValue: (b) => b.shareChangePp?.toFixed(3) ?? '', render: (b) => <span className={toneClass(b.shareChangePp)}>{formatPp(b.shareChangePp, 2)}</span> },
    { key: 'added', header: 'Value added', numeric: true, sortValue: (b) => b.absoluteChange, exportValue: (b) => (b.absoluteChange === null ? '' : Math.round(b.absoluteChange)), render: (b) => <span className={toneClass(b.absoluteChange)}>{formatValue(b.absoluteChange)}</span> },
  ];

  const siblingColumns: Column<EntityMetrics>[] = [
    { key: 'rank', header: 'Rank', numeric: true, sortValue: (m) => m.rank, exportValue: (m) => m.rank, render: (m) => formatRank(m.rank) },
    {
      key: 'molecule',
      header: 'Molecule',
      sortValue: (m) => m.name,
      exportValue: (m) => m.name,
      render: (m) => (
        <span className="strong">
          {m.name}
          {m.name === current && (
            <>
              {' '}
              <Badge tone="accent">Selected</Badge>
            </>
          )}
        </span>
      ),
    },
    { key: 'value', header: 'MAT value', numeric: true, sortValue: (m) => m.matValue, exportValue: (m) => Math.round(m.matValue), render: (m) => formatValue(m.matValue) },
    { key: 'growth', header: 'Growth', numeric: true, sortValue: (m) => m.growthPct, exportValue: (m) => m.growthPct?.toFixed(2) ?? '', render: (m) => <span className={toneClass(m.growthPct)}>{formatPct(m.growthPct, { signed: true })}</span> },
    { key: 'share', header: 'Share of class', numeric: true, sortValue: (m) => m.sharePct, exportValue: (m) => m.sharePct?.toFixed(3) ?? '', render: (m) => formatPct(m.sharePct, { decimals: 2 }) },
    { key: 'shareChange', header: 'Share change', numeric: true, sortValue: (m) => m.shareChangePp, exportValue: (m) => m.shareChangePp?.toFixed(3) ?? '', render: (m) => <span className={toneClass(m.shareChangePp)}>{formatPp(m.shareChangePp, 2)}</span> },
    { key: 'brands', header: 'Brands', numeric: true, sortValue: (m) => m.rowCount, exportValue: (m) => m.rowCount, render: (m) => m.rowCount.toLocaleString('en-IN') },
  ];

  const verdict =
    gapVsClass === null
      ? null
      : gapVsClass >= 2
        ? { label: 'Gaining share of its class', tone: 'good' as const, icon: 'check' as const }
        : gapVsClass <= -2
          ? { label: 'Losing share of its class', tone: 'critical' as const, icon: 'alert' as const }
          : { label: 'Tracking its class', tone: 'neutral' as const, icon: 'info' as const };

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Card
        title="Select molecule"
        subtitle={`${molecules.length.toLocaleString('en-IN')} molecules in the current selection. In a branded-generics market this is the arena a brand actually competes in.`}
        actions={verdict ? <Badge tone={verdict.tone} icon={verdict.icon}>{verdict.label}</Badge> : undefined}
      >
        <div className="row row--wrap" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '0 1 240px' }}>
            <span className="field__label">Search</span>
            <input
              className="input input--search"
              placeholder="Filter molecules…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="field" style={{ flex: '1 1 300px' }}>
            <span className="field__label">Molecule</span>
            <select
              className="select"
              style={{ fontSize: 15, padding: '9px 30px 9px 12px', fontWeight: 600 }}
              value={current ?? ''}
              onChange={(event) => setSelected(event.target.value)}
            >
              {matches.options.map((molecule) => (
                <option key={molecule.name} value={molecule.name}>
                  {molecule.name} — {formatValue(molecule.matValue)}
                </option>
              ))}
              {current && !matches.options.some((m) => m.name === current) && (
                <option value={current}>{current}</option>
              )}
            </select>
          </label>
          <div className="t-sub">
            {matches.total > matches.options.length
              ? `${matches.total.toLocaleString('en-IN')} matches — showing the ${matches.options.length} largest. Narrow the search to see more.`
              : `${matches.total.toLocaleString('en-IN')} match${matches.total === 1 ? '' : 'es'}`}
            {parentClass && ` · in ${parentClass}`}
          </div>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      {!inMolecule || !current ? (
        <Card>
          <p className="t-sub">No rows for this molecule in the current selection.</p>
        </Card>
      ) : (
        <>
          <Section title="Molecule scorecard" subtitle={`${current}${parentClass ? ` · ${parentClass}` : ''}`}>
            <div className="grid grid--kpi">
              <KpiTile
                label="Molecule MAT value"
                value={formatValue(marketLevel?.matValue)}
                foot={`${formatPct(marketLevel?.sharePct, { decimals: 2 })} of the market in scope`}
              />
              <KpiTile
                label="Molecule growth"
                value={formatPct(marketLevel?.growthPct, { signed: true })}
                unavailableReason={marketLevel?.growthPct === null ? 'No previous-period value' : undefined}
                delta={gapVsMarket}
                deltaLabel={gapVsMarket === null ? undefined : `${formatPp(gapVsMarket)} vs market`}
              />
              <KpiTile
                label="Share of class"
                value={inClass ? formatPct(siblings.find((m) => m.name === current)?.sharePct, { decimals: 2 }) : undefined}
                unavailableReason={inClass ? undefined : 'No segment column, so no parent class'}
                foot={parentClass ?? undefined}
              />
              <KpiTile
                label="Share-of-class change"
                value={inClass ? formatPp(siblings.find((m) => m.name === current)?.shareChangePp ?? null, 2) : undefined}
                unavailableReason={inClass ? undefined : 'Requires a segment column'}
                delta={siblings.find((m) => m.name === current)?.shareChangePp ?? null}
              />
              <KpiTile
                label="Brands competing"
                value={inMolecule.brands.length.toLocaleString('en-IN')}
                foot={`${inMolecule.market.companyCount.toLocaleString('en-IN')} companies`}
              />
              <KpiTile
                label="Concentration"
                value={inMolecule.market.cr4 !== null ? formatPct(inMolecule.market.cr4, { decimals: 1 }) : undefined}
                unavailableReason={inMolecule.market.cr4 === null ? 'Fewer than four brands on this molecule' : undefined}
                foot={
                  inMolecule.market.hhi !== null
                    ? `CR4 · HHI ${Math.round(inMolecule.market.hhi).toLocaleString('en-IN')} · ${inMolecule.market.concentrationLabel}`
                    : undefined
                }
                tooltip="CR4 is the combined share of the four largest brands on this molecule. The label comes from HHI, which weighs the whole distribution — a molecule can have a high CR4 and still be unconcentrated overall when it has a long tail."
              />
            </div>
          </Section>

          <Section
            title="Is the molecule the problem, or the brand?"
            subtitle="A brand growing 8% inside a molecule growing 20% has a competitive problem. The same brand inside a molecule growing 2% has a category problem. They need opposite responses."
          >
            <div className="grid grid--2">
              <Card title="Growth benchmark" subtitle="Molecule against its class and the total market">
                <HBarChart
                  data={benchmark}
                  format={(v) => formatPct(v, { signed: true })}
                  valueLabel="MAT value growth"
                  diverging
                  showValueLabels
                  height={benchmark.length * 40 + 46}
                />
                {gapVsClass !== null && classLevel && (
                  <Callout tone={gapVsClass < -2 ? 'warning' : gapVsClass > 2 ? 'accent' : 'neutral'}>
                    <strong>
                      {current} is {gapVsClass < 0 ? 'trailing' : 'outpacing'} {classLevel.name} by {formatPp(Math.abs(gapVsClass))}.
                    </strong>{' '}
                    {gapVsClass < -2
                      ? 'Prescribing may be shifting to other molecules in the class. A brand-level fix cannot recover growth the molecule itself is losing.'
                      : gapVsClass > 2
                        ? 'The molecule is taking share of its class, so brands on it are competing for a pool that is expanding faster than the category.'
                        : 'The molecule is holding its position within the class.'}
                  </Callout>
                )}
              </Card>

              <Card
                title={`Brands on ${current}`}
                subtitle={`Share and rank recalculated within the molecule — the competitive set that actually matters`}
                flush
              >
                <DataTable
                  rows={inMolecule.brands}
                  columns={brandColumns}
                  rowKey={(b) => b.name}
                  initialSort={{ key: 'value', direction: 'desc' }}
                  pageSize={10}
                  searchText={(b) => `${b.name} ${b.company ?? ''}`}
                  searchPlaceholder="Search brands on this molecule…"
                  highlight={(b) => b.name === focusBrand?.name}
                  onRowClick={(b) => setFocusBrand(b.name)}
                  exportFileName={`matlens-${current.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-brands.csv`}
                  emptyMessage="No brands on this molecule in the current selection."
                />
              </Card>
            </div>
            <p className="t-micro" style={{ marginTop: 8 }}>
              Click any brand to make it the focus brand across MATLens.
            </p>
          </Section>

          {inClass && siblings.length > 1 && (
            <Section
              title={`Molecule versus molecule in ${parentClass}`}
              subtitle="Which molecules are taking share of the class, and which are giving it up. Share of class is zero-sum, so these movements offset."
            >
              <div className="grid grid--2">
                <Card title="Share-of-class movement" subtitle="Largest gainers and losers within the class">
                  {siblingChart.length ? (
                    <HBarChart
                      data={siblingChart}
                      format={(v) => formatPp(v, 2)}
                      valueLabel="Share of class change"
                      diverging
                      height={Math.max(200, siblingChart.length * 26 + 46)}
                    />
                  ) : (
                    <Unavailable metric="Share-of-class movement" reason="This dataset has no previous period, so share change cannot be calculated." />
                  )}
                </Card>
                <Card title="Class value split" subtitle="The largest molecules in the class by MAT value">
                  <HBarChart
                    data={siblings.slice(0, 12).map((m) => ({
                      name: m.name,
                      value: m.matValue,
                      emphasis: m.name === current,
                      detail: [
                        { label: 'Growth', value: formatPct(m.growthPct, { signed: true }) },
                        { label: 'Share of class', value: formatPct(m.sharePct, { decimals: 2 }) },
                      ],
                    }))}
                    format={formatValueAxis}
                    valueLabel="MAT value"
                  />
                </Card>
              </div>

              <div style={{ height: 16 }} />

              <Card title={`All molecules in ${parentClass}`} subtitle="Click a molecule to analyse it" flush>
                <DataTable
                  rows={siblings}
                  columns={siblingColumns}
                  rowKey={(m) => m.name}
                  initialSort={{ key: 'value', direction: 'desc' }}
                  pageSize={10}
                  searchText={(m) => m.name}
                  searchPlaceholder="Search molecules in this class…"
                  highlight={(m) => m.name === current}
                  onRowClick={(m) => setSelected(m.name)}
                  exportFileName={`matlens-${(parentClass ?? 'class').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-molecules.csv`}
                />
              </Card>
            </Section>
          )}

          {signals.length > 0 && (
            <Section
              title={`Signals within ${current}`}
              subtitle="The same rule engine, run with this molecule as the universe — so share, rank and every threshold are relative to the molecule, not the whole market."
            >
              <div className="grid grid--2">
                {signals.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onInvestigate={insight.link?.brand ? () => goTo('brand', insight.link!.brand) : undefined}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}
