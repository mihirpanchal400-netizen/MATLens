import { useState } from 'react';
import { useApp } from '../state/AppState';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { InsightCard } from '../components/InsightCard';
import { NoDataState } from '../components/NoDataState';
import { Card, Section } from '../components/ui';
import type { InsightSeverity } from '../types';

const SEVERITY_ORDER: InsightSeverity[] = ['critical', 'serious', 'watch', 'positive', 'info'];

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  critical: 'Critical',
  serious: 'Attention',
  watch: 'Watch',
  positive: 'Positive',
  info: 'Context',
};

export function InsightCenter() {
  const { dataset, analysis, insights, goTo, focusBrand } = useApp();
  const [filter, setFilter] = useState<InsightSeverity | 'all'>('all');

  if (!dataset || !analysis) return <NoDataState what="the Insight Center" />;

  const counts = SEVERITY_ORDER.reduce<Record<string, number>>((acc, severity) => {
    acc[severity] = insights.filter((i) => i.severity === severity).length;
    return acc;
  }, {});

  const visible = filter === 'all' ? insights : insights.filter((i) => i.severity === filter);

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Card
        title="What should a Brand Manager pay attention to?"
        subtitle={`${insights.length} finding${insights.length === 1 ? '' : 's'} generated from ${analysis.rowsAnalysed.toLocaleString('en-IN')} rows in scope, ranked by how much they should change what you do next`}
      >
        <p className="t-sub" style={{ marginBottom: 14 }}>
          Each finding separates what the data <strong>shows</strong> from what it <strong>may mean</strong>. Signals and
          evidence are arithmetic on {dataset.fileName}. Interpretations and implications are readings, hedged on purpose.
          The investigation question is the actual deliverable — it points at evidence this file does not contain.
          Nothing here asserts a cause.
        </p>

        <div className="row row--wrap" style={{ gap: 8 }}>
          <button className={`btn btn--sm ${filter === 'all' ? 'btn--primary' : ''}`} onClick={() => setFilter('all')}>
            All ({insights.length})
          </button>
          {SEVERITY_ORDER.filter((severity) => counts[severity] > 0).map((severity) => (
            <button
              key={severity}
              className={`btn btn--sm ${filter === severity ? 'btn--primary' : ''}`}
              onClick={() => setFilter(severity)}
            >
              {SEVERITY_LABEL[severity]} ({counts[severity]})
            </button>
          ))}
        </div>
      </Card>

      <div style={{ height: 20 }} />

      {visible.length ? (
        <Section
          title={filter === 'all' ? 'All findings' : `${SEVERITY_LABEL[filter]} findings`}
          subtitle={focusBrand ? `Focus brand: ${focusBrand.name}` : undefined}
        >
          <div className="grid grid--2">
            {visible.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onInvestigate={insight.link ? () => goTo(insight.link!.page, insight.link!.brand) : undefined}
              />
            ))}
          </div>
        </Section>
      ) : (
        <Card>
          <p className="t-sub">No findings at this severity in the current selection.</p>
        </Card>
      )}
    </>
  );
}
