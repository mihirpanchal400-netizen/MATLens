import { useMemo } from 'react';
import { useApp } from '../state/AppState';
import { UNSPECIFIED } from '../analytics/analyse';
import { MomentumScatter, type MomentumPoint } from '../charts/MomentumScatter';
import { DataTable, type Column } from '../components/DataTable';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { InsightCard } from '../components/InsightCard';
import { NoDataState, Unavailable } from '../components/NoDataState';
import { Badge, Card, MiniBar, Section } from '../components/ui';
import type { EntityMetrics } from '../types';
import { formatPct, formatPp, formatRank, formatValue, toneClass } from '../utils/format';

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function CompetitorIntelligence() {
  const { dataset, analysis, focusBrand, insights, goTo, setFocusBrand } = useApp();

  const points = useMemo<MomentumPoint[]>(() => {
    if (!analysis) return [];
    return analysis.brands
      .filter((b) => b.growthPct !== null && (b.sharePct ?? 0) > 0)
      .slice(0, 30)
      .map((b) => ({
        name: b.name,
        share: b.sharePct ?? 0,
        growth: b.growthPct ?? 0,
        value: b.matValue,
        company: b.company,
        emphasis: b.name === focusBrand?.name,
      }));
  }, [analysis, focusBrand]);

  if (!dataset || !analysis) return <NoDataState what="competitor intelligence" />;

  const { market } = analysis;
  const maxValue = analysis.brands[0]?.matValue ?? 0;
  const watchlist = insights.filter((insight) => insight.scope === 'competitor');

  const flagsFor = (brand: EntityMetrics) => {
    const flags: Array<{ label: string; tone: 'good' | 'critical' | 'warning' | 'neutral' }> = [];
    if (brand.shareChangePp !== null && brand.shareChangePp >= 0.15) flags.push({ label: 'Share gainer', tone: 'good' });
    if (brand.shareChangePp !== null && brand.shareChangePp <= -0.15) flags.push({ label: 'Share loser', tone: 'critical' });
    if (
      market.growthPct !== null &&
      brand.growthPct !== null &&
      brand.growthPct > market.growthPct + 5 &&
      (brand.sharePct ?? 0) >= 1
    ) {
      flags.push({ label: 'Momentum', tone: 'warning' });
    }
    if (brand.growthPct !== null && brand.growthPct < 0 && (brand.sharePct ?? 0) >= 1) {
      flags.push({ label: 'Declining', tone: 'critical' });
    }
    return flags.slice(0, 2);
  };

  const columns: Column<EntityMetrics>[] = [
    {
      key: 'rank',
      header: 'Rank',
      numeric: true,
      sortValue: (b) => b.rank,
      exportValue: (b) => b.rank,
      render: (b) => (
        <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
          {formatRank(b.rank)}
          {b.rankChange !== null && b.rankChange !== 0 && (
            <span className={toneClass(b.rankChange)} style={{ fontSize: 11 }}>
              {b.rankChange > 0 ? `▲${b.rankChange}` : `▼${Math.abs(b.rankChange)}`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'brand',
      header: 'Brand',
      sortValue: (b) => b.name,
      exportValue: (b) => b.name,
      render: (b) => (
        <div>
          <div className="strong">{b.name}</div>
          <div className="row" style={{ gap: 5, marginTop: 3 }}>
            {flagsFor(b).map((flag) => (
              <Badge key={flag.label} tone={flag.tone}>
                {flag.label}
              </Badge>
            ))}
          </div>
        </div>
      ),
    },
    { key: 'company', header: 'Company', sortValue: (b) => b.company, exportValue: (b) => b.company, render: (b) => b.company ?? UNSPECIFIED },
    { key: 'molecule', header: 'Molecule', sortValue: (b) => b.molecule, exportValue: (b) => b.molecule, render: (b) => b.molecule ?? UNSPECIFIED, defaultHidden: true },
    { key: 'segment', header: 'Segment', sortValue: (b) => b.segment, exportValue: (b) => b.segment, render: (b) => b.segment ?? UNSPECIFIED, defaultHidden: true },
    {
      key: 'value',
      header: 'MAT value',
      numeric: true,
      sortValue: (b) => b.matValue,
      exportValue: (b) => Math.round(b.matValue),
      render: (b) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <MiniBar value={b.matValue} max={maxValue} />
          <span>{formatValue(b.matValue)}</span>
        </div>
      ),
    },
    {
      key: 'growth',
      header: 'Growth',
      numeric: true,
      sortValue: (b) => b.growthPct,
      exportValue: (b) => (b.growthPct === null ? '' : b.growthPct.toFixed(2)),
      render: (b) => <span className={toneClass(b.growthPct)}>{formatPct(b.growthPct, { signed: true })}</span>,
    },
    {
      key: 'share',
      header: 'Share',
      numeric: true,
      sortValue: (b) => b.sharePct,
      exportValue: (b) => (b.sharePct === null ? '' : b.sharePct.toFixed(3)),
      render: (b) => formatPct(b.sharePct, { decimals: 2 }),
    },
    {
      key: 'shareChange',
      header: 'Share change',
      numeric: true,
      sortValue: (b) => b.shareChangePp,
      exportValue: (b) => (b.shareChangePp === null ? '' : b.shareChangePp.toFixed(3)),
      render: (b) => <span className={toneClass(b.shareChangePp)}>{formatPp(b.shareChangePp, 2)}</span>,
    },
    {
      key: 'added',
      header: 'Value added',
      numeric: true,
      sortValue: (b) => b.absoluteChange,
      exportValue: (b) => (b.absoluteChange === null ? '' : Math.round(b.absoluteChange)),
      render: (b) => <span className={toneClass(b.absoluteChange)}>{formatValue(b.absoluteChange)}</span>,
    },
    {
      key: 'contribution',
      header: 'Share of growth',
      numeric: true,
      sortValue: (b) => b.growthContributionPct,
      exportValue: (b) => (b.growthContributionPct === null ? '' : b.growthContributionPct.toFixed(2)),
      render: (b) => formatPct(b.growthContributionPct, { decimals: 1 }),
      defaultHidden: true,
      title: 'Share of the total absolute growth the market added this period',
    },
  ];

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Section
        title="Competitor landscape"
        subtitle="Every brand in scope, with the movements that matter flagged automatically. Click a row to make that brand the focus."
      >
        <Card flush>
          <DataTable
            rows={analysis.brands}
            columns={columns}
            rowKey={(b) => b.name}
            initialSort={{ key: 'value', direction: 'desc' }}
            searchText={(b) => `${b.name} ${b.company ?? ''} ${b.molecule ?? ''} ${b.segment ?? ''}`}
            searchPlaceholder="Search brand, company or molecule…"
            highlight={(b) => b.name === focusBrand?.name}
            onRowClick={(b) => setFocusBrand(b.name)}
            exportFileName="matlens-competitor-landscape.csv"
            columnToggle
          />
        </Card>
        <p className="t-micro" style={{ marginTop: 8 }}>
          Flags are rule-based, not editorial: <strong>Share gainer / loser</strong> at ±0.15 pp,{' '}
          <strong>Momentum</strong> at more than 5 pp above market growth with at least 1% share, and{' '}
          <strong>Declining</strong> for negative growth at 1% share or more.
        </p>
      </Section>

      <Section
        title="Competitor momentum map"
        subtitle="Share against growth. The question it answers: which competitors have both the scale and the trajectory to matter?"
      >
        <Card>
          {market.growthPct !== null && points.length >= 3 ? (
            <MomentumScatter
              points={points}
              marketGrowth={market.growthPct}
              shareSplit={median(points.map((p) => p.share))}
              onSelect={(name) => name && setFocusBrand(name)}
            />
          ) : (
            <Unavailable
              metric="Momentum map"
              reason="Plotting momentum needs growth for at least three brands, which requires a previous MAT period in the dataset."
            />
          )}
        </Card>
      </Section>

      <Section title="Competitor watchlist" subtitle="Competitors the rule engine flagged, with the evidence that triggered each one">
        {watchlist.length ? (
          <div className="grid grid--2">
            {watchlist.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onInvestigate={insight.link?.brand ? () => goTo('brand', insight.link!.brand) : undefined}
              />
            ))}
          </div>
        ) : (
          <Card>
            <p className="t-sub">
              No competitor crossed the momentum, emergence or decline thresholds in the current selection.
            </p>
          </Card>
        )}
      </Section>
    </>
  );
}
