import { useApp } from '../state/AppState';
import { attentionFrom } from '../analytics/insightEngine';
import { growthGapPp } from '../analytics/metrics';
import { HBarChart } from '../charts/HBarChart';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { Icon } from '../components/Icon';
import { InsightCard } from '../components/InsightCard';
import { Badge, Callout, Card, KpiTile, Section } from '../components/ui';
import { formatPct, formatPp, formatRank, formatValue, formatValueAxis } from '../utils/format';
import { Landing } from './Landing';

export function Overview() {
  const { dataset, analysis, focusBrand, insights, goTo } = useApp();

  if (!dataset) return <Landing />;

  if (!analysis) {
    return (
      <Card title="No rows in scope">
        <p className="t-sub">
          The current filter selection excludes every row in the dataset. Clear the filters to continue.
        </p>
      </Card>
    );
  }

  const { market } = analysis;
  const canGrow = dataset.capabilities.canComputeGrowth;
  const gap = focusBrand ? growthGapPp(focusBrand.growthPct, market.growthPct) : null;
  const attention = attentionFrom(insights, 3);

  const gainers = analysis.brands
    .filter((b) => (b.absoluteChange ?? 0) > 0)
    .sort((a, b) => (b.absoluteChange ?? 0) - (a.absoluteChange ?? 0))
    .slice(0, 8)
    .map((b) => ({
      name: b.name,
      value: b.absoluteChange ?? 0,
      emphasis: b.name === focusBrand?.name,
      detail: [
        { label: 'Growth', value: formatPct(b.growthPct, { signed: true }) },
        { label: 'MAT value', value: formatValue(b.matValue) },
        { label: 'Share change', value: formatPp(b.shareChangePp, 2) },
      ],
    }));

  const decliners = analysis.brands
    .filter((b) => (b.absoluteChange ?? 0) < 0)
    .sort((a, b) => (a.absoluteChange ?? 0) - (b.absoluteChange ?? 0))
    .slice(0, 8)
    .map((b) => ({
      name: b.name,
      value: b.absoluteChange ?? 0,
      emphasis: b.name === focusBrand?.name,
      detail: [
        { label: 'Growth', value: formatPct(b.growthPct, { signed: true }) },
        { label: 'MAT value', value: formatValue(b.matValue) },
        { label: 'Share change', value: formatPp(b.shareChangePp, 2) },
      ],
    }));

  // Share is zero-sum, so the two ends of the distribution are the story. The
  // focus brand is always included even when it sits in the quiet middle.
  const rankedByShareChange = analysis.brands.filter((b) => b.shareChangePp !== null);
  const shareMovers = [
    ...rankedByShareChange.slice().sort((a, b) => (b.shareChangePp ?? 0) - (a.shareChangePp ?? 0)).slice(0, 5),
    ...rankedByShareChange.slice().sort((a, b) => (a.shareChangePp ?? 0) - (b.shareChangePp ?? 0)).slice(0, 5),
    ...(focusBrand && focusBrand.shareChangePp !== null ? [focusBrand] : []),
  ]
    .filter((brand, index, list) => list.findIndex((b) => b.name === brand.name) === index)
    .sort((a, b) => (b.shareChangePp ?? 0) - (a.shareChangePp ?? 0))
    .map((b) => ({
      name: b.name,
      value: b.shareChangePp ?? 0,
      emphasis: b.name === focusBrand?.name,
      detail: [
        { label: 'Share now', value: formatPct(b.sharePct, { decimals: 2 }) },
        { label: 'Share before', value: formatPct(b.prevSharePct, { decimals: 2 }) },
        { label: 'Growth', value: formatPct(b.growthPct, { signed: true }) },
      ],
    }));

  const focusSegment = focusBrand?.segment
    ? analysis.segments.find((s) => s.name === focusBrand.segment)
    : null;

  const snapshot = [
    focusBrand && focusBrand.growthPct !== null
      ? { name: focusBrand.name, value: focusBrand.growthPct, emphasis: true }
      : null,
    focusSegment && focusSegment.growthPct !== null
      ? { name: `${focusSegment.name} (segment)`, value: focusSegment.growthPct }
      : null,
    market.growthPct !== null ? { name: 'Total market', value: market.growthPct } : null,
  ].filter(Boolean) as Array<{ name: string; value: number; emphasis?: boolean }>;

  const verdict =
    gap === null
      ? null
      : gap >= 2
        ? { label: 'Outperforming the market', tone: 'good' as const }
        : gap <= -2
          ? { label: 'Underperforming the market', tone: 'critical' as const }
          : { label: 'Growing in line with the market', tone: 'neutral' as const };

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Section
        title="Executive summary"
        subtitle={
          <>
            {dataset.period ?? 'Period not specified in file'} · {dataset.fileName}
            {dataset.isSynthetic && ' · synthetic demonstration data'}
          </>
        }
      >
        <div className="grid grid--kpi">
          <KpiTile
            label="Market size"
            value={formatValue(market.totalValue)}
            foot={`${market.brandCount.toLocaleString('en-IN')} brands in scope`}
          />
          <KpiTile
            label="Market growth"
            value={canGrow ? formatPct(market.growthPct, { signed: true }) : undefined}
            unavailableReason={canGrow ? undefined : 'No previous-period value in this dataset'}
            foot={canGrow ? `from ${formatValue(market.totalPrevValue)}` : undefined}
          />
          <KpiTile
            label={`${focusBrand?.name ?? 'Brand'} growth`}
            value={canGrow ? formatPct(focusBrand?.growthPct, { signed: true }) : undefined}
            unavailableReason={canGrow ? undefined : 'Requires a previous MAT value'}
            delta={gap}
            deltaLabel={gap === null ? undefined : `${formatPp(gap)} vs market`}
          />
          <KpiTile
            label="Market share"
            value={formatPct(focusBrand?.sharePct, { decimals: 2 })}
            foot={focusBrand ? formatValue(focusBrand.matValue) : undefined}
          />
          <KpiTile
            label="Share change"
            value={canGrow ? formatPp(focusBrand?.shareChangePp ?? null, 2) : undefined}
            unavailableReason={canGrow ? undefined : 'Requires a previous MAT value'}
            foot={
              focusBrand?.prevSharePct !== null && focusBrand?.prevSharePct !== undefined
                ? `from ${formatPct(focusBrand.prevSharePct, { decimals: 2 })}`
                : undefined
            }
          />
          <KpiTile
            label="Brand rank"
            value={formatRank(focusBrand?.rank)}
            delta={focusBrand?.rankChange ?? null}
            deltaLabel={
              focusBrand?.rankChange === null || focusBrand?.rankChange === undefined || focusBrand.rankChange === 0
                ? undefined
                : `${Math.abs(focusBrand.rankChange)} position${Math.abs(focusBrand.rankChange) === 1 ? '' : 's'}`
            }
            foot={focusBrand?.prevRank ? `was ${formatRank(focusBrand.prevRank)}` : undefined}
          />
        </div>
      </Section>

      {canGrow && focusBrand && (
        <Section title="Performance snapshot" subtitle="The one comparison that decides whether a good number is actually good">
          <div className="grid grid--2">
            <Card
              title={`${focusBrand.name} vs its market`}
              actions={verdict ? <Badge tone={verdict.tone} icon={verdict.tone === 'good' ? 'check' : verdict.tone === 'critical' ? 'alert' : 'info'}>{verdict.label}</Badge> : undefined}
            >
              <HBarChart
                data={snapshot}
                format={(v) => formatPct(v, { signed: true })}
                valueLabel="MAT value growth"
                diverging
                showValueLabels
                height={snapshot.length * 40 + 46}
              />
              {gap !== null && (
                <Callout tone={gap < 0 ? 'warning' : 'accent'}>
                  <strong>Growth gap {formatPp(gap)}.</strong>{' '}
                  {gap < 0
                    ? `${focusBrand.name} is growing ${formatPct(Math.abs(gap), { decimals: 1, suffix: ' pp' })} slower than the market it competes in. Absolute growth can still be positive while relative position erodes.`
                    : `${focusBrand.name} is growing ${formatPct(gap, { decimals: 1, suffix: ' pp' })} faster than its market, which is what a share gain looks like before it shows up in the share number.`}
                </Callout>
              )}
            </Card>

            <Card
              title="Who gained and lost share"
              subtitle="Share is zero-sum — every percentage point one brand gains, another lost"
            >
              <HBarChart
                data={shareMovers}
                format={(v) => formatPp(v, 2)}
                valueLabel="Share change"
                diverging
                height={Math.max(200, shareMovers.length * 26 + 46)}
              />
              <p className="t-micro" style={{ marginTop: 8 }}>
                The five largest gainers and the five largest losers in the current selection
                {focusBrand && !shareMovers.some((m) => m.emphasis) ? `, plus ${focusBrand.name}` : ''}.
              </p>
            </Card>
          </div>
        </Section>
      )}

      {canGrow && (gainers.length > 0 || decliners.length > 0) && (
        <Section title="Top movers" subtitle="The brands that added and lost the most MAT value in the current selection">
          <div className="grid grid--2">
            <Card title="Largest value gains">
              <HBarChart data={gainers} format={formatValueAxis} valueLabel="Value added" />
            </Card>
            <Card title="Largest value declines">
              <HBarChart data={decliners} format={formatValueAxis} valueLabel="Value lost" diverging />
            </Card>
          </div>
        </Section>
      )}

      <Section
        title="Attention required"
        subtitle="Generated by the rule engine from this dataset — not written in advance"
        aside={
          <button className="btn btn--sm" onClick={() => goTo('insights')}>
            Open Insight Center
            <Icon name="arrowRight" size={13} />
          </button>
        }
      >
        {attention.length ? (
          <div className="grid grid--3">
            {attention.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                compact
                onInvestigate={insight.link ? () => goTo(insight.link!.page, insight.link!.brand) : undefined}
              />
            ))}
          </div>
        ) : (
          <Card>
            <p className="t-sub">
              No signal in this dataset crossed the thresholds MATLens uses to flag a finding. That is a result, not an
              error — the published thresholds are on the Methodology screen.
            </p>
          </Card>
        )}
      </Section>
    </>
  );
}
