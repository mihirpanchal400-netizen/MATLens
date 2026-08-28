import { useMemo } from 'react';
import { useApp } from '../state/AppState';
import { UNSPECIFIED, competitorsOf } from '../analytics/analyse';
import { growthGapPp, growthPct, sharePct } from '../analytics/metrics';
import { HBarChart, type HBarDatum } from '../charts/HBarChart';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { Icon, TrendIcon } from '../components/Icon';
import { InsightCard } from '../components/InsightCard';
import { NoDataState, Unavailable } from '../components/NoDataState';
import { Badge, Callout, Card, KpiTile, Section } from '../components/ui';
import { formatPct, formatPp, formatRank, formatUnits, formatValue, toneClass } from '../utils/format';

export function BrandPerformance() {
  const { dataset, analysis, focusBrand, focusBrandName, setFocusBrand, insights, goTo } = useApp();

  const regionalRows = useMemo(() => {
    if (!analysis || !focusBrand) return [];
    const regions = analysis.brandRegionValue.get(focusBrand.name);
    if (!regions) return [];
    return [...regions.entries()]
      .map(([region, values]) => {
        const marketRegion = analysis.regions.find((r) => r.name === region);
        const brandGrowth = growthPct(values.current, values.previous);
        return {
          region,
          value: values.current,
          mix: sharePct(values.current, focusBrand.matValue),
          brandGrowth,
          regionGrowth: marketRegion?.growthPct ?? null,
          gap: growthGapPp(brandGrowth, marketRegion?.growthPct ?? null),
          shareInRegion: sharePct(values.current, marketRegion?.matValue ?? null),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [analysis, focusBrand]);

  if (!dataset || !analysis) return <NoDataState what="brand performance" />;
  if (!focusBrand) return <NoDataState what="brand performance" />;

  const { market } = analysis;
  const canGrow = dataset.capabilities.canComputeGrowth;
  const gap = growthGapPp(focusBrand.growthPct, market.growthPct);
  const segment = focusBrand.segment ? analysis.segments.find((s) => s.name === focusBrand.segment) : null;
  const molecule = focusBrand.molecule ? analysis.molecules.find((m) => m.name === focusBrand.molecule) : null;
  const competitors = competitorsOf(analysis, focusBrand, 10);
  const brandSignals = insights.filter(
    (insight) => insight.subject === focusBrand.name || insight.scope === 'brand',
  );

  const verdict =
    gap === null
      ? null
      : gap >= 2
        ? { label: 'Outperforming', tone: 'good' as const, icon: 'check' as const }
        : gap <= -2
          ? { label: 'Underperforming', tone: 'critical' as const, icon: 'alert' as const }
          : { label: 'In line with market', tone: 'neutral' as const, icon: 'info' as const };

  const benchmark: HBarDatum[] = [
    focusBrand.growthPct !== null ? { name: focusBrand.name, value: focusBrand.growthPct, emphasis: true } : null,
    molecule?.growthPct !== undefined && molecule?.growthPct !== null
      ? { name: `${molecule.name} (molecule)`, value: molecule.growthPct }
      : null,
    segment?.growthPct !== undefined && segment?.growthPct !== null
      ? { name: `${segment.name} (segment)`, value: segment.growthPct }
      : null,
    market.growthPct !== null ? { name: 'Total market', value: market.growthPct } : null,
  ].filter(Boolean) as HBarDatum[];

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Card
        title="Select brand"
        subtitle="Every metric, comparison and signal on this screen is calculated for the selected brand"
        actions={verdict ? <Badge tone={verdict.tone} icon={verdict.icon}>{verdict.label}</Badge> : undefined}
      >
        <div className="row row--wrap">
          <select
            className="select"
            style={{ minWidth: 260, fontSize: 15, padding: '9px 30px 9px 12px', fontWeight: 600 }}
            value={focusBrandName ?? focusBrand.name}
            onChange={(event) => setFocusBrand(event.target.value)}
          >
            {analysis.brands.map((brand) => (
              <option key={brand.name} value={brand.name}>
                {brand.name} — {formatValue(brand.matValue)}
              </option>
            ))}
          </select>
          <div className="t-sub">
            {focusBrand.company ?? 'Company not identified'}
            {focusBrand.molecule ? ` · ${focusBrand.molecule}` : ''}
            {focusBrand.segment ? ` · ${focusBrand.segment}` : ''}
            {` · ${focusBrand.rowCount} row${focusBrand.rowCount === 1 ? '' : 's'} in scope`}
          </div>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      <Section title="Brand scorecard">
        <div className="grid grid--kpi">
          <KpiTile label="MAT value" value={formatValue(focusBrand.matValue)} foot={focusBrand.prevMatValue !== null ? `from ${formatValue(focusBrand.prevMatValue)}` : undefined} />
          <KpiTile
            label="MAT growth"
            value={canGrow ? formatPct(focusBrand.growthPct, { signed: true }) : undefined}
            unavailableReason={canGrow ? undefined : 'No previous-period value'}
            delta={gap}
            deltaLabel={gap === null ? undefined : `${formatPp(gap)} vs market`}
          />
          <KpiTile label="Market share" value={formatPct(focusBrand.sharePct, { decimals: 2 })} foot={`rank ${formatRank(focusBrand.rank)} of ${market.brandCount}`} />
          <KpiTile
            label="Share change"
            value={canGrow ? formatPp(focusBrand.shareChangePp, 2) : undefined}
            unavailableReason={canGrow ? undefined : 'No previous-period value'}
            foot={focusBrand.prevSharePct !== null ? `from ${formatPct(focusBrand.prevSharePct, { decimals: 2 })}` : undefined}
          />
          <KpiTile
            label="Rank change"
            value={focusBrand.rankChange === null ? undefined : focusBrand.rankChange === 0 ? 'Unchanged' : `${focusBrand.rankChange > 0 ? '+' : ''}${focusBrand.rankChange}`}
            unavailableReason={focusBrand.rankChange === null ? 'Requires a previous period' : undefined}
            delta={focusBrand.rankChange}
            deltaLabel={focusBrand.prevRank ? `was ${formatRank(focusBrand.prevRank)}` : undefined}
          />
          <KpiTile
            label="Unit growth"
            value={focusBrand.unitGrowthPct !== null ? formatPct(focusBrand.unitGrowthPct, { signed: true }) : undefined}
            unavailableReason={focusBrand.unitGrowthPct === null ? 'No unit sales columns in this dataset' : undefined}
            foot={focusBrand.matUnits !== null ? formatUnits(focusBrand.matUnits) : undefined}
          />
        </div>
      </Section>

      {canGrow ? (
        <Section title="Brand versus market" subtitle="The comparison that turns a growth number into a verdict">
          <div className="grid grid--2">
            <Card title="Growth benchmark" subtitle="Brand against the molecule, the segment and the total market">
              <HBarChart
                data={benchmark}
                format={(v) => formatPct(v, { signed: true })}
                valueLabel="MAT value growth"
                diverging
                showValueLabels
                height={benchmark.length * 38 + 46}
              />
              {gap !== null && (
                <Callout tone={gap < -2 ? 'warning' : gap > 2 ? 'accent' : 'neutral'}>
                  <strong>
                    {focusBrand.name} {gap < 0 ? 'trails' : 'leads'} the market by {formatPp(Math.abs(gap))}.
                  </strong>{' '}
                  {gap < -2
                    ? 'Growth is positive in absolute terms but below the category rate, which is what relative momentum loss looks like before it appears in the share number.'
                    : gap > 2
                      ? 'The brand is capturing more than a proportional part of category growth.'
                      : 'The brand is tracking its category closely; national averages may still hide divergence by region or segment.'}
                </Callout>
              )}
            </Card>

            <Card title="Contribution to market growth" subtitle="Is the brand pulling its weight in the rupees the market added?">
              {focusBrand.growthContributionPct !== null ? (
                <>
                  <div className="evidence">
                    <div className="evidence__cell">
                      <div className="evidence__label">Share of market</div>
                      <div className="evidence__value">{formatPct(focusBrand.sharePct, { decimals: 2 })}</div>
                    </div>
                    <div className="evidence__cell">
                      <div className="evidence__label">Share of market growth</div>
                      <div className={`evidence__value ${toneClass((focusBrand.growthContributionPct ?? 0) - (focusBrand.sharePct ?? 0))}`}>
                        {formatPct(focusBrand.growthContributionPct, { decimals: 1 })}
                      </div>
                    </div>
                    <div className="evidence__cell">
                      <div className="evidence__label">Value added</div>
                      <div className="evidence__value">{formatValue(focusBrand.absoluteChange)}</div>
                    </div>
                    <div className="evidence__cell">
                      <div className="evidence__label">Market added</div>
                      <div className="evidence__value">{formatValue(market.absoluteChange)}</div>
                    </div>
                  </div>
                  <p className="t-sub" style={{ marginTop: 12 }}>
                    A brand contributing a smaller proportion of growth than its share of the market is, by definition,
                    losing share — the same fact the share-change number reports, expressed in rupees.
                  </p>
                </>
              ) : (
                <Unavailable
                  metric="Growth contribution"
                  reason="The market did not grow in this selection, and contribution to a shrinking market inverts its sign and misleads rather than informs."
                />
              )}
            </Card>
          </div>
        </Section>
      ) : (
        <Section title="Brand versus market">
          <Card>
            <Unavailable
              metric="Brand versus market comparison"
              reason="Growth requires a comparable previous MAT period, which this dataset does not contain."
            />
          </Card>
        </Section>
      )}

      {regionalRows.length > 1 && (
        <Section title="Regional performance" subtitle="Where the brand's growth is coming from, and where the category is growing without it">
          <Card flush>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Region</th>
                    <th className="num">Brand MAT</th>
                    <th className="num">% of brand</th>
                    <th className="num">Share in region</th>
                    <th className="num">Brand growth</th>
                    <th className="num">Region growth</th>
                    <th className="num">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {regionalRows.map((row) => (
                    <tr key={row.region}>
                      <td className="strong">{row.region}</td>
                      <td className="num">{formatValue(row.value)}</td>
                      <td className="num">{formatPct(row.mix, { decimals: 1 })}</td>
                      <td className="num">{formatPct(row.shareInRegion, { decimals: 2 })}</td>
                      <td className={`num ${toneClass(row.brandGrowth)}`}>{formatPct(row.brandGrowth, { signed: true })}</td>
                      <td className="num">{formatPct(row.regionGrowth, { signed: true })}</td>
                      <td className={`num ${toneClass(row.gap)}`}>
                        <span className="row" style={{ gap: 3, justifyContent: 'flex-end' }}>
                          <TrendIcon value={row.gap} />
                          {formatPp(row.gap)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="t-micro" style={{ marginTop: 8 }}>
            Gap = brand growth in the region − total category growth in the same region. A negative gap in a large region
            is usually worth more investigation than a negative gap in a small one.
          </p>
        </Section>
      )}

      <Section
        title="Competitive position"
        subtitle={focusBrand.segment ? `Brands competing in ${focusBrand.segment}` : 'Largest brands in the current selection'}
        aside={
          <button className="btn btn--sm" onClick={() => goTo('competitors')}>
            Full competitor view
            <Icon name="arrowRight" size={13} />
          </button>
        }
      >
        <Card flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="num">Rank</th>
                  <th>Brand</th>
                  <th>Company</th>
                  <th className="num">MAT value</th>
                  <th className="num">Growth</th>
                  <th className="num">Share</th>
                  <th className="num">Share change</th>
                </tr>
              </thead>
              <tbody>
                {[focusBrand, ...competitors]
                  .filter((brand, index, list) => list.findIndex((b) => b.name === brand.name) === index)
                  .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
                  .map((brand) => (
                    <tr key={brand.name} className={brand.name === focusBrand.name ? 'is-focus' : undefined}>
                      <td className="num">{formatRank(brand.rank)}</td>
                      <td className="strong">{brand.name}</td>
                      <td>{brand.company ?? UNSPECIFIED}</td>
                      <td className="num">{formatValue(brand.matValue)}</td>
                      <td className={`num ${toneClass(brand.growthPct)}`}>{formatPct(brand.growthPct, { signed: true })}</td>
                      <td className="num">{formatPct(brand.sharePct, { decimals: 2 })}</td>
                      <td className={`num ${toneClass(brand.shareChangePp)}`}>{formatPp(brand.shareChangePp, 2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <Section title="Brand signals" subtitle="Rule-engine findings that concern this brand directly">
        {brandSignals.length ? (
          <div className="grid grid--2">
            {brandSignals.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onInvestigate={insight.link ? () => goTo(insight.link!.page, insight.link!.brand) : undefined}
              />
            ))}
          </div>
        ) : (
          <Card>
            <p className="t-sub">No brand-level rule fired for {focusBrand.name} in the current selection.</p>
          </Card>
        )}
      </Section>
    </>
  );
}
