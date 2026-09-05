import { useMemo, useState } from 'react';
import { insightKey, useApp } from '../state/AppState';
import { EFFORT_LABEL, URGENCY_LABEL } from '../analytics/actionEngine';
import { FORMULAS } from '../analytics/metrics';
import { Icon } from '../components/Icon';
import { NoDataState } from '../components/NoDataState';
import { Callout, Card, Section } from '../components/ui';
import { formatDateTime, formatPct, formatValue } from '../utils/format';
import type { Insight } from '../types';

/**
 * The execution layer: turn the findings and the decisions taken on them into a
 * document someone can put in front of a management team.
 *
 * The narrative is assembled from the analysis itself rather than written by a
 * model. That is deliberate — every sentence traces to a number on screen, the
 * same input produces the same brief, and there is no API key between the user
 * and their output.
 */
export function BriefBuilder() {
  const { dataset, analysis, focusBrand, insights, actions, actionStatus, savedInsights, goTo } = useApp();

  const [selected, setSelected] = useState<Set<string> | null>(null);

  const defaultSelection = useMemo(() => {
    const saved = insights.filter((i) => savedInsights.has(insightKey(i)));
    const pool = saved.length ? saved : insights.filter((i) => i.severity === 'critical' || i.severity === 'serious');
    return new Set(pool.slice(0, 6).map((i) => insightKey(i)));
  }, [insights, savedInsights]);

  const chosen = selected ?? defaultSelection;

  if (!dataset || !analysis) return <NoDataState what="the brief builder" />;

  const chosenInsights = insights.filter((i) => chosen.has(insightKey(i)));
  const includedActions = actions
    .filter((a) => chosen.has(a.insightKey) && (actionStatus[a.id] ?? 'new') !== 'dismissed')
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const period = dataset.period ?? 'the current period';
  const marketGrowth = analysis.market.growthPct;

  /** One paragraph that states the position, built from the numbers themselves. */
  const conclusion = (() => {
    if (!focusBrand) return 'No focus brand is selected, so this brief covers the market as a whole.';
    const parts: string[] = [];
    parts.push(
      `In ${period}, the market in scope stands at ${formatValue(analysis.market.totalValue)}` +
        (marketGrowth !== null ? `, growing ${formatPct(marketGrowth, { signed: true })}` : '') + '.',
    );
    if (focusBrand.growthPct !== null && marketGrowth !== null) {
      const gap = focusBrand.growthPct - marketGrowth;
      parts.push(
        `${focusBrand.name} grew ${formatPct(focusBrand.growthPct, { signed: true })}, ` +
          `${gap < 0 ? 'below' : 'ahead of'} the market by ${Math.abs(gap).toFixed(1)} percentage points, ` +
          `and holds ${formatPct(focusBrand.sharePct, { decimals: 2 })} share` +
          (focusBrand.shareChangePp !== null
            ? ` (${focusBrand.shareChangePp >= 0 ? '+' : ''}${focusBrand.shareChangePp.toFixed(2)} pp).`
            : '.'),
      );
    }
    const criticals = chosenInsights.filter((i) => i.severity === 'critical' || i.severity === 'serious').length;
    if (criticals) {
      parts.push(
        `${criticals} finding${criticals === 1 ? '' : 's'} in this brief ${criticals === 1 ? 'requires' : 'require'} a decision, ` +
          `with ${includedActions.length} recommended response${includedActions.length === 1 ? '' : 's'} set out below.`,
      );
    }
    return parts.join(' ');
  })();

  const markdown = () => {
    const lines: string[] = [
      `# ${focusBrand?.name ?? 'Market'} review — ${period}`,
      '',
      `**Market:** ${formatValue(analysis.market.totalValue)} · ${analysis.market.brandCount.toLocaleString('en-IN')} brands`,
      `**Source:** ${dataset.fileName}${dataset.isSynthetic ? ' (synthetic demonstration data)' : ''}`,
      `**Prepared:** ${formatDateTime(Date.now())}`,
      '',
      '## Executive conclusion',
      conclusion,
      '',
      '## What changed',
      ...chosenInsights.flatMap((i) => [
        `### ${i.title}`,
        i.signal,
        `*Interpretation.* ${i.interpretation}`,
        `*Evidence.* ${i.evidence.map((e) => `${e.label}: ${e.value}`).join(' · ')}`,
        '',
      ]),
      '## Why it matters',
      ...chosenInsights.map((i) => `- **${i.subject}.** ${i.implication}`),
      '',
      '## Recommended actions',
      ...includedActions.flatMap((a) => [
        `### ${a.title}`,
        `**Objective.** ${a.objective}`,
        `**Priority ${a.priorityScore}** · ${URGENCY_LABEL[a.urgency]} · ${EFFORT_LABEL[a.effort]} effort · ${Math.round(a.confidence * 100)}% confidence · Owner: ${a.owner}`,
        `**Rationale.** ${a.rationale}`,
        `**Next step.** ${a.nextStep}`,
        `**Assumptions.** ${a.assumptions.join('; ')}`,
        '',
      ]),
      '## Method and limitations',
      FORMULAS.growth,
      FORMULAS.share,
      FORMULAS.growthGap,
      '',
      'Figures are calculated from the loaded extract. Interpretations are hedged readings, not established causes:',
      'one MAT period against one prior period cannot establish why a movement occurred.',
      ...dataset.capabilities.limitations.map((l) => `- ${l}`),
    ];
    return lines.join('\n');
  };

  const download = () => {
    const blob = new Blob([markdown()], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `matlens-brief-${(focusBrand?.name ?? 'market').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const evidenceLine = (insight: Insight) =>
    insight.evidence.map((e) => `${e.label}: ${e.value}`).join(' · ');

  return (
    <>
      <Card
        title="Build a brief"
        subtitle="Select the findings that belong in the review. The narrative and the recommended actions follow from them."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--sm" onClick={download}>
              <Icon name="download" size={13} />
              Markdown
            </button>
            <button className="btn btn--sm btn--primary" onClick={() => window.print()}>
              <Icon name="file" size={13} />
              Print / PDF
            </button>
          </div>
        }
      >
        <div className="brief-picker">
          {insights.map((insight) => {
            const key = insightKey(insight);
            return (
              <label key={key} className={`brief-pick ${chosen.has(key) ? 'brief-pick--on' : ''}`}>
                <input type="checkbox" checked={chosen.has(key)} onChange={() => toggle(key)} />
                <span>
                  <strong>{insight.title}</strong>
                  <span className="t-micro" style={{ display: 'block' }}>
                    {insight.severity} · {insight.subject}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {!insights.length && (
          <Callout tone="accent" title="No findings to include yet">
            Load a dataset and the rule engine will produce findings you can assemble into a brief.
          </Callout>
        )}
      </Card>

      <div style={{ height: 20 }} />

      {/* Everything below is what prints. */}
      <div className="brief" id="matlens-brief">
        <header className="brief__head">
          <h1 className="brief__title">{focusBrand?.name ?? 'Market'} review — {period}</h1>
          <p className="t-sub">
            {formatValue(analysis.market.totalValue)} market · {analysis.market.brandCount.toLocaleString('en-IN')} brands ·
            source: {dataset.fileName}
            {dataset.isSynthetic ? ' (synthetic demonstration data)' : ''} · prepared {formatDateTime(Date.now())}
          </p>
        </header>

        <Section title="Executive conclusion">
          <Card>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--ink-700)' }}>{conclusion}</p>
          </Card>
        </Section>

        <Section title="What changed" subtitle="Observed movements, with the figures behind each one">
          <div className="stack">
            {chosenInsights.map((insight) => (
              <Card key={insight.id}>
                <h3 className="t-h2" style={{ marginBottom: 6 }}>{insight.title}</h3>
                <p className="t-sub">{insight.signal}</p>
                <p className="t-micro" style={{ marginTop: 8 }}>{evidenceLine(insight)}</p>
              </Card>
            ))}
            {!chosenInsights.length && (
              <Card>
                <p className="t-sub">No findings selected. Choose at least one above.</p>
              </Card>
            )}
          </div>
        </Section>

        {chosenInsights.length > 0 && (
          <Section title="Why it matters" subtitle="The commercial reading of each movement — a hypothesis, not a proven cause">
            <Card>
              <ul className="list-check">
                {chosenInsights.map((insight) => (
                  <li key={insight.id}>
                    <span style={{ color: 'var(--accent)', marginTop: 2 }}>
                      <Icon name="arrowRight" size={13} strokeWidth={2} />
                    </span>
                    <span>
                      <strong>{insight.subject}.</strong> {insight.implication}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        )}

        {includedActions.length > 0 && (
          <Section title="Recommended actions" subtitle="Ranked by impact × urgency × confidence ÷ effort">
            <div className="stack">
              {includedActions.map((action) => (
                <Card key={action.id}>
                  <div className="row row--wrap" style={{ marginBottom: 6 }}>
                    <span className="badge badge--accent">Priority {action.priorityScore}</span>
                    <span className="t-micro">
                      {URGENCY_LABEL[action.urgency]} · {EFFORT_LABEL[action.effort]} effort ·{' '}
                      {Math.round(action.confidence * 100)}% confidence · {action.owner}
                    </span>
                  </div>
                  <h3 className="t-h2" style={{ marginBottom: 6 }}>{action.title}</h3>
                  <p className="t-sub">{action.objective}</p>
                  <p className="t-sub" style={{ marginTop: 8 }}>{action.rationale}</p>
                  <p className="t-micro" style={{ marginTop: 8 }}>
                    <strong>Next step.</strong> {action.nextStep} · <strong>Assumes.</strong>{' '}
                    {action.assumptions.join('; ')}
                  </p>
                </Card>
              ))}
            </div>
          </Section>
        )}

        <Section title="Method and limitations">
          <Card>
            <pre className="formula">{[FORMULAS.growth, FORMULAS.share, FORMULAS.growthGap].join('\n')}</pre>
            <p className="t-sub" style={{ marginTop: 12 }}>
              Every figure is calculated from the loaded extract, and the same file produces the same brief.
              Interpretations are hedged readings rather than established causes — one MAT period against one prior
              period cannot establish why a movement occurred.
            </p>
            {dataset.capabilities.limitations.length > 0 && (
              <ul className="list-check" style={{ marginTop: 10 }}>
                {dataset.capabilities.limitations.map((limitation) => (
                  <li key={limitation}>
                    <span style={{ color: 'var(--warning-ink)', marginTop: 2 }}>
                      <Icon name="info" size={12} strokeWidth={2} />
                    </span>
                    {limitation}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </div>

      <div className="no-print" style={{ marginTop: 8 }}>
        <button className="btn btn--sm" onClick={() => goTo('actions')}>
          Back to Action Center
        </button>
      </div>
    </>
  );
}
