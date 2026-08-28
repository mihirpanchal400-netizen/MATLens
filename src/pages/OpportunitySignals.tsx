import { useApp } from '../state/AppState';
import { RULE_CATALOGUE } from '../analytics/insightEngine';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { InsightCard } from '../components/InsightCard';
import { NoDataState } from '../components/NoDataState';
import { Badge, Callout, Card, Section } from '../components/ui';

/** Rules that produce opportunity-shaped findings, in the order they are evaluated. */
const OPPORTUNITY_RULES = [
  'molecule-opportunity',
  'segment-opportunity',
  'regional-opportunity',
  'regional-concentration',
  'competitor-momentum',
  'emerging-competitor',
  'vulnerable-incumbent',
  'high-growth-niche',
  'growth-capture',
  'market-structure',
];

export function OpportunitySignals() {
  const { dataset, analysis, opportunities, goTo, focusBrand } = useApp();

  if (!dataset || !analysis) return <NoDataState what="opportunity detection" />;

  const firedRules = new Set(opportunities.map((insight) => insight.rule));
  const catalogue = RULE_CATALOGUE.filter((entry) => OPPORTUNITY_RULES.includes(entry.rule));

  const grouped = [
    { key: 'category', label: 'Category signals', hint: 'Molecules and segments moving faster than the brand' },
    { key: 'region', label: 'Geographic signals', hint: 'Where growth is happening relative to the brand’s footprint' },
    { key: 'competitor', label: 'Competitive signals', hint: 'Momentum, entrants, and business coming loose' },
    { key: 'brand', label: 'Brand signals', hint: 'How much of the category’s growth the brand is capturing' },
    { key: 'market', label: 'Structural signals', hint: 'What the shape of the market implies for how share moves' },
  ].map((group) => ({ ...group, items: opportunities.filter((insight) => insight.scope === group.key) }));

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Card
        title="What counts as a signal"
        subtitle="An opportunity signal is a gap the data can prove, not a recommendation the data cannot support"
      >
        <div className="row row--wrap" style={{ gap: 18 }}>
          <div style={{ flex: '1 1 240px' }}>
            <div className="t-eyebrow">Signal</div>
            <p className="t-sub">A measurable divergence between two things that ought to move together.</p>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <div className="t-eyebrow">Evidence</div>
            <p className="t-sub">The actual numbers behind it, from this dataset, with the formula attached.</p>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <div className="t-eyebrow">Why it matters</div>
            <p className="t-sub">The commercial reading — stated as a possibility, never as a cause.</p>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <div className="t-eyebrow">Investigate</div>
            <p className="t-sub">The next question, for evidence this dataset does not contain.</p>
          </div>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      {opportunities.length === 0 ? (
        <Card>
          <Callout tone="accent" title="No opportunity signal crossed its threshold">
            Every opportunity rule was evaluated against this selection and none fired. That is a finding in itself:
            no molecule, segment or region in scope is growing far enough ahead of {focusBrand?.name ?? 'the focus brand'}{' '}
            to meet the published thresholds. The rule list and its conditions are below.
          </Callout>
        </Card>
      ) : (
        grouped
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <Section key={group.key} title={group.label} subtitle={group.hint}>
              <div className="grid grid--2">
                {group.items.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onInvestigate={insight.link ? () => goTo(insight.link!.page, insight.link!.brand) : undefined}
                  />
                ))}
              </div>
            </Section>
          ))
      )}

      <Section
        title="Rules evaluated"
        subtitle="Every opportunity rule that ran against this selection, and whether it fired. A silent rule is a result, not an omission."
      >
        <Card flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Condition</th>
                  <th>Produces</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {catalogue.map((entry) => (
                  <tr key={entry.rule}>
                    <td className="strong">{entry.name}</td>
                    <td className="t-micro">{entry.condition}</td>
                    <td className="t-micro">{entry.produces}</td>
                    <td>
                      {firedRules.has(entry.rule) ? (
                        <Badge tone="accent" icon="check">
                          Fired
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Not triggered</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>
    </>
  );
}
