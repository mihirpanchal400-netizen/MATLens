import { useApp } from '../state/AppState';
import { UNSPECIFIED } from '../analytics/analyse';
import { HBarChart, type HBarDatum } from '../charts/HBarChart';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { NoDataState, Unavailable } from '../components/NoDataState';
import { Card, KpiTile, Section } from '../components/ui';
import type { EntityMetrics } from '../types';
import { formatPct, formatPp, formatValue, formatValueAxis } from '../utils/format';

function growthSeries(entities: EntityMetrics[], focusName: string | null, limit: number): HBarDatum[] {
  return entities
    .filter((e) => e.name !== UNSPECIFIED && e.growthPct !== null)
    .slice(0, limit)
    .map((e) => ({
      name: e.name,
      value: e.growthPct ?? 0,
      emphasis: e.name === focusName,
      detail: [
        { label: 'MAT value', value: formatValue(e.matValue) },
        { label: 'Share', value: formatPct(e.sharePct, { decimals: 2 }) },
        { label: 'Share change', value: formatPp(e.shareChangePp, 2) },
      ],
    }));
}

export function MarketLandscape() {
  const { dataset, analysis, focusBrand } = useApp();

  if (!dataset || !analysis) return <NoDataState what="the market landscape" />;

  const { market, capabilities } = { market: analysis.market, capabilities: dataset.capabilities };
  const focusName = focusBrand?.name ?? null;

  const topByValue: HBarDatum[] = analysis.brands.slice(0, 12).map((b) => ({
    name: b.name,
    value: b.matValue,
    emphasis: b.name === focusName,
    detail: [
      { label: 'Share', value: formatPct(b.sharePct, { decimals: 2 }) },
      { label: 'Growth', value: formatPct(b.growthPct, { signed: true }) },
      { label: 'Company', value: b.company ?? '—' },
    ],
  }));

  // Growth on a trivial base is noise; restrict the growth chart to brands that
  // are large enough for their growth rate to be commercially meaningful.
  const materialBrands = analysis.brands.filter((b) => (b.sharePct ?? 0) >= 0.5);
  const fastest = [...materialBrands].sort((a, b) => (b.growthPct ?? -999) - (a.growthPct ?? -999));

  const segmentsByGrowth = [...analysis.segments]
    .filter((s) => s.name !== UNSPECIFIED)
    .sort((a, b) => (b.growthPct ?? -999) - (a.growthPct ?? -999));

  const moleculesByValue = analysis.molecules.filter((m) => m.name !== UNSPECIFIED).slice(0, 12);

  const companyShare: HBarDatum[] = analysis.companies
    .filter((c) => c.name !== UNSPECIFIED)
    .slice(0, 10)
    .map((c) => ({
      name: c.name,
      value: c.sharePct ?? 0,
      emphasis: c.name === focusBrand?.company,
      detail: [
        { label: 'MAT value', value: formatValue(c.matValue) },
        { label: 'Growth', value: formatPct(c.growthPct, { signed: true }) },
        { label: 'Brands', value: String(c.rowCount) },
      ],
    }));

  const regionGrowth = analysis.regions.filter((r) => r.name !== UNSPECIFIED);

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Section title="Market structure" subtitle="How large the category is, and how many players share it">
        <div className="grid grid--kpi">
          <KpiTile label="Market size" value={formatValue(market.totalValue)} foot={dataset.period ?? undefined} />
          <KpiTile
            label="Market growth"
            value={capabilities.canComputeGrowth ? formatPct(market.growthPct, { signed: true }) : undefined}
            unavailableReason={capabilities.canComputeGrowth ? undefined : 'No previous period in file'}
            foot={capabilities.canComputeGrowth ? `${formatValue(market.absoluteChange)} added` : undefined}
          />
          <KpiTile label="Brands" value={market.brandCount.toLocaleString('en-IN')} />
          <KpiTile label="Companies" value={market.companyCount ? market.companyCount.toLocaleString('en-IN') : undefined} unavailableReason={market.companyCount ? undefined : 'No company column'} />
          <KpiTile label="Molecules" value={market.moleculeCount ? market.moleculeCount.toLocaleString('en-IN') : undefined} unavailableReason={market.moleculeCount ? undefined : 'No molecule column'} />
          <KpiTile
            label="Concentration"
            value={market.cr4 !== null ? formatPct(market.cr4, { decimals: 1 }) : undefined}
            unavailableReason={market.cr4 !== null ? undefined : 'Fewer than four brands in scope'}
            foot={market.hhi !== null ? `CR4 · HHI ${Math.round(market.hhi).toLocaleString('en-IN')} · ${market.concentrationLabel}` : undefined}
            tooltip="CR4 is the combined share of the four largest brands. HHI is the sum of squared brand shares."
          />
        </div>
      </Section>

      <Section title="Where the value sits" subtitle="Scale first — growth rates only mean something once you know the base they sit on">
        <div className="grid grid--2">
          <Card title="Top brands by MAT value" subtitle="Which brands actually set the category">
            <HBarChart data={topByValue} format={formatValueAxis} valueLabel="MAT value" />
          </Card>
          <Card title="Company share of market" subtitle="Corporate concentration behind the brand names">
            {companyShare.length ? (
              <HBarChart data={companyShare} format={(v) => `${v.toFixed(1)}%`} valueLabel="Market share" />
            ) : (
              <Unavailable metric="Company share" reason="No company column was identified in this dataset." />
            )}
          </Card>
        </div>
      </Section>

      {capabilities.canComputeGrowth ? (
        <>
          <Section title="Where the growth is" subtitle="Every chart below is measured against the market rate, because a growth number alone decides nothing">
            <div className="grid grid--2">
              <Card
                title="Fastest-growing brands"
                subtitle={`Brands holding at least 0.5% share · market growth ${formatPct(market.growthPct, { signed: true })}`}
              >
                <HBarChart
                  data={growthSeries(fastest, focusName, 12)}
                  format={(v) => formatPct(v, { signed: true, decimals: 0 })}
                  valueLabel="MAT growth"
                  diverging
                  reference={market.growthPct !== null ? { value: market.growthPct, label: 'Market' } : undefined}
                />
                <p className="t-micro" style={{ marginTop: 8 }}>
                  Small brands are excluded: a high percentage on a small base is arithmetic, not momentum.
                </p>
              </Card>

              <Card title="Segment growth" subtitle="Which parts of the category are expanding">
                {segmentsByGrowth.length ? (
                  <HBarChart
                    data={growthSeries(segmentsByGrowth, null, 10)}
                    format={(v) => formatPct(v, { signed: true, decimals: 0 })}
                    valueLabel="Segment growth"
                    diverging
                    reference={market.growthPct !== null ? { value: market.growthPct, label: 'Market' } : undefined}
                  />
                ) : (
                  <Unavailable metric="Segment growth" reason="No segment column was identified in this dataset." />
                )}
              </Card>
            </div>
          </Section>

          <Section title="Category and geography" subtitle="The two dimensions that most often explain a brand-versus-market gap">
            <div className="grid grid--2">
              <Card title="Molecule growth" subtitle="Largest molecules by value, ordered as they appear in the market">
                {moleculesByValue.length ? (
                  <HBarChart
                    data={growthSeries(moleculesByValue, focusBrand?.molecule ?? null, 12)}
                    format={(v) => formatPct(v, { signed: true, decimals: 0 })}
                    valueLabel="Molecule growth"
                    diverging
                    reference={market.growthPct !== null ? { value: market.growthPct, label: 'Market' } : undefined}
                  />
                ) : (
                  <Unavailable metric="Molecule growth" reason="No molecule column was identified in this dataset." />
                )}
              </Card>

              <Card title="Regional growth" subtitle="Where the category is growing fastest">
                {regionGrowth.length ? (
                  <>
                    <HBarChart
                      data={growthSeries(regionGrowth, null, 10)}
                      format={(v) => formatPct(v, { signed: true, decimals: 0 })}
                      valueLabel="Region growth"
                      diverging
                      reference={market.growthPct !== null ? { value: market.growthPct, label: 'Market' } : undefined}
                    />
                    <p className="t-micro" style={{ marginTop: 8 }}>
                      Regional totals cover only the geographies present in this file.
                    </p>
                  </>
                ) : (
                  <Unavailable metric="Regional growth" reason="No region column was identified in this dataset." />
                )}
              </Card>
            </div>
          </Section>
        </>
      ) : (
        <Section title="Where the growth is">
          <Card>
            <Unavailable
              metric="Growth analysis"
              reason="This dataset has no previous-period MAT value and no growth column from which one could be derived, so no growth, share change or momentum metric can be calculated. Re-export the extract with the prior MAT period included."
            />
          </Card>
        </Section>
      )}
    </>
  );
}
