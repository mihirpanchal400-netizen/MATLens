import { useState } from 'react';
import { insightKey, useApp } from '../state/AppState';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { InsightCard } from '../components/InsightCard';
import { NoDataState } from '../components/NoDataState';
import { Icon } from '../components/Icon';
import { Card, Section } from '../components/ui';
import type { Insight, InsightSeverity } from '../types';

const SEVERITY_ORDER: InsightSeverity[] = ['critical', 'serious', 'watch', 'positive', 'info'];

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  critical: 'Critical',
  serious: 'Attention',
  watch: 'Watch',
  positive: 'Positive',
  info: 'Context',
};

/** Renders saved findings as a plain-text brief a PM can paste into a review deck. */
function exportBrief(saved: Insight[], datasetName: string, period: string | null) {
  const lines = [
    '# MATLens brief',
    `Dataset: ${datasetName}${period ? ` · ${period}` : ''}`,
    `Exported: ${new Date().toLocaleString('en-IN')}`,
    '',
    ...saved.flatMap((insight) => [
      `## ${insight.title}`,
      `**Signal.** ${insight.signal}`,
      `**Interpretation.** ${insight.interpretation}`,
      `**Implication.** ${insight.implication}`,
      `**Investigate.** ${insight.investigationQuestion}`,
      `**Evidence.** ${insight.evidence.map((e) => `${e.label}: ${e.value}`).join(' · ')}`,
      `**Calculation.** ${insight.calculation.replace(/\n/g, ' / ')}`,
      '',
    ]),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'matlens-brief.md';
  link.click();
  URL.revokeObjectURL(url);
}

export function InsightCenter() {
  const { dataset, analysis, insights, goTo, focusBrand, savedInsights, toggleSavedInsight } = useApp();
  const [filter, setFilter] = useState<InsightSeverity | 'all' | 'saved'>('all');

  if (!dataset || !analysis) return <NoDataState what="the Insight Center" />;

  const counts = SEVERITY_ORDER.reduce<Record<string, number>>((acc, severity) => {
    acc[severity] = insights.filter((i) => i.severity === severity).length;
    return acc;
  }, {});

  const savedList = insights.filter((i) => savedInsights.has(insightKey(i)));
  const visible =
    filter === 'all' ? insights : filter === 'saved' ? savedList : insights.filter((i) => i.severity === filter);

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
          <span style={{ flex: 1 }} />
          <button
            className={`btn btn--sm ${filter === 'saved' ? 'btn--primary' : ''}`}
            onClick={() => setFilter('saved')}
          >
            Saved ({savedList.length})
          </button>
          <button
            className="btn btn--sm"
            disabled={savedList.length === 0}
            onClick={() => exportBrief(savedList, dataset.fileName, dataset.period)}
            title={savedList.length ? 'Download the saved findings as a brief' : 'Save a finding first'}
          >
            <Icon name="download" size={13} />
            Export brief
          </button>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      {visible.length ? (
        <Section
          title={filter === 'all' ? 'All findings' : filter === 'saved' ? 'Saved findings' : `${SEVERITY_LABEL[filter]} findings`}
          subtitle={focusBrand ? `Focus brand: ${focusBrand.name}` : undefined}
        >
          <div className="grid grid--2">
            {visible.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onInvestigate={insight.link ? () => goTo(insight.link!.page, insight.link!.brand) : undefined}
                saved={savedInsights.has(insightKey(insight))}
                onToggleSave={() => toggleSavedInsight(insight)}
              />
            ))}
          </div>
        </Section>
      ) : (
        <Card>
          <p className="t-sub">
            {filter === 'saved'
              ? 'Nothing saved yet. Use Save on any finding to collect it here, then export the set as a brief.'
              : 'No findings at this severity in the current selection.'}
          </p>
        </Card>
      )}
    </>
  );
}
