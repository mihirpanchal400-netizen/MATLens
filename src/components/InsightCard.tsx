import { useState } from 'react';
import type { Insight, InsightSeverity } from '../types';
import { Icon } from './Icon';
import { Badge, type BadgeTone, Formula, Modal, ProvenanceTag } from './ui';

const SEVERITY_META: Record<InsightSeverity, { label: string; tone: BadgeTone; icon: 'alert' | 'info' | 'check' }> = {
  critical: { label: 'Critical', tone: 'critical', icon: 'alert' },
  serious: { label: 'Attention', tone: 'serious', icon: 'alert' },
  watch: { label: 'Watch', tone: 'warning', icon: 'info' },
  positive: { label: 'Positive', tone: 'good', icon: 'check' },
  info: { label: 'Context', tone: 'neutral', icon: 'info' },
};

function EvidenceGrid({ insight }: { insight: Insight }) {
  return (
    <div className="evidence">
      {insight.evidence.map((item) => (
        <div className="evidence__cell" key={`${item.label}-${item.value}`}>
          <div className="evidence__label">{item.label}</div>
          <div
            className={`evidence__value ${item.tone === 'positive' ? 'pos' : item.tone === 'negative' ? 'neg' : ''}`}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function InsightDetail({ insight, onClose, onInvestigate }: { insight: Insight; onClose: () => void; onInvestigate?: () => void }) {
  const meta = SEVERITY_META[insight.severity];
  return (
    <Modal title={insight.title} subtitle={`${insight.subject} · rule: ${insight.rule}`} onClose={onClose}>
      <div className="row row--wrap">
        <Badge tone={meta.tone} icon={meta.icon}>
          {meta.label}
        </Badge>
        <Badge tone="neutral">{insight.scope}</Badge>
        <Badge tone="neutral">{insight.type}</Badge>
      </div>

      <div>
        <ProvenanceTag kind="observed" label="Signal — what the data shows" />
        <p style={{ marginTop: 4 }}>{insight.signal}</p>
      </div>

      <EvidenceGrid insight={insight} />

      <div>
        <ProvenanceTag kind="interpretation" />
        <p style={{ marginTop: 4 }}>{insight.interpretation}</p>
      </div>

      <div>
        <ProvenanceTag kind="hypothesis" label="Business implication" />
        <p style={{ marginTop: 4 }}>{insight.implication}</p>
      </div>

      <div className="callout callout--accent">
        <strong style={{ display: 'block', marginBottom: 3 }}>Investigate next</strong>
        {insight.investigationQuestion}
      </div>

      <div>
        <ProvenanceTag kind="derived" label="How this was calculated" />
        <Formula>{insight.calculation}</Formula>
      </div>

      <p className="t-micro">
        MATLens states what the data shows and what it may mean. It does not assert causes — every implication above is
        a hypothesis for you to test against evidence the dataset does not contain.
      </p>

      {onInvestigate && (
        <div>
          <button
            className="btn btn--primary"
            onClick={() => {
              onClose();
              onInvestigate();
            }}
          >
            Investigate
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      )}
    </Modal>
  );
}

export function InsightCard({
  insight,
  onInvestigate,
  compact = false,
}: {
  insight: Insight;
  onInvestigate?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[insight.severity];

  return (
    <>
      <article className={`insight insight--${insight.severity}`}>
        <div className="insight__bar" />
        <header className="insight__head">
          <div style={{ minWidth: 0 }}>
            <div className="row row--wrap" style={{ marginBottom: 6 }}>
              <Badge tone={meta.tone} icon={meta.icon}>
                {meta.label}
              </Badge>
              <span className="t-eyebrow">{insight.type.replace(/-/g, ' ')}</span>
            </div>
            <h3 className="insight__title">{insight.title}</h3>
          </div>
        </header>

        <div className="insight__body">
          <div className="insight__block">
            <ProvenanceTag kind="observed" label="Signal" />
            <p>{insight.signal}</p>
          </div>

          {!compact && <EvidenceGrid insight={insight} />}

          <div className="insight__block">
            <ProvenanceTag kind="interpretation" />
            <p>{insight.interpretation}</p>
          </div>

          {!compact && (
            <div className="insight__block">
              <ProvenanceTag kind="hypothesis" label="Business implication" />
              <p>{insight.implication}</p>
            </div>
          )}

          <div className="insight__block insight__block--investigate">
            <ProvenanceTag kind="interpretation" label="Investigate" />
            <p>{insight.investigationQuestion}</p>
          </div>
        </div>

        <footer className="insight__foot">
          <button className="btn btn--sm" onClick={() => setOpen(true)}>
            How was this calculated?
          </button>
          {onInvestigate && (
            <button className="btn btn--sm btn--link" onClick={onInvestigate} style={{ marginLeft: 'auto' }}>
              Investigate
              <Icon name="arrowRight" size={13} />
            </button>
          )}
        </footer>
      </article>

      {open && <InsightDetail insight={insight} onClose={() => setOpen(false)} onInvestigate={onInvestigate} />}
    </>
  );
}
