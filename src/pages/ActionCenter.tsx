import { useMemo, useState } from 'react';
import { useApp } from '../state/AppState';
import {
  ACTION_CATEGORIES,
  EFFORT_LABEL,
  SCORING_NOTE,
  URGENCY_LABEL,
  type Action,
  type ActionCategory,
  type ActionStatus,
} from '../analytics/actionEngine';
import { FilterBar, ScopeNote } from '../components/FilterBar';
import { Icon } from '../components/Icon';
import { NoDataState } from '../components/NoDataState';
import { Badge, type BadgeTone, Callout, Card, Section } from '../components/ui';

const CATEGORY_TONE: Record<ActionCategory, BadgeTone> = {
  CRITICAL: 'critical',
  RISK: 'serious',
  OPPORTUNITY: 'good',
  TREND: 'neutral',
  WATCH: 'warning',
};

const STATUS_LABEL: Record<ActionStatus, string> = {
  new: 'Not decided',
  accepted: 'Accepted',
  investigating: 'Investigating',
  dismissed: 'Dismissed',
};

function ActionCard({
  action,
  status,
  onStatus,
  onOpenEvidence,
}: {
  action: Action;
  status: ActionStatus;
  onStatus: (status: ActionStatus) => void;
  onOpenEvidence: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className={`card action ${status === 'dismissed' ? 'action--dismissed' : ''}`}>
      <div className="card__body">
        <div className="row row--wrap" style={{ marginBottom: 8 }}>
          <Badge tone={CATEGORY_TONE[action.category]}>{action.category}</Badge>
          <span className="badge badge--neutral" title={action.scoreExplanation}>
            Priority {action.priorityScore}
          </span>
          <span className="t-micro">
            {URGENCY_LABEL[action.urgency]} · {EFFORT_LABEL[action.effort]} effort · {Math.round(action.confidence * 100)}% confidence
          </span>
          {status !== 'new' && (
            <span style={{ marginLeft: 'auto' }}>
              <Badge tone={status === 'dismissed' ? 'neutral' : 'accent'}>{STATUS_LABEL[status]}</Badge>
            </span>
          )}
        </div>

        <h3 className="t-h2" style={{ marginBottom: 6 }}>{action.title}</h3>
        <p className="t-sub">{action.objective}</p>

        <div className="action__meta">
          <div>
            <div className="evidence__label">Suggested owner</div>
            <div className="t-sub">{action.owner}</div>
          </div>
          <div>
            <div className="evidence__label">Applies to</div>
            <div className="t-sub">{action.target}</div>
          </div>
          <div>
            <div className="evidence__label">Expected outcome</div>
            <div className="t-sub">{action.expectedOutcome}</div>
          </div>
        </div>

        {open && (
          <div className="stack" style={{ marginTop: 14, gap: 12 }}>
            <div className="insight__block">
              <span className="prov prov--interpretation">Why this follows</span>
              <p>{action.rationale}</p>
            </div>

            <div className="evidence">
              {action.evidence.map((item) => (
                <div className="evidence__cell" key={`${item.label}-${item.value}`}>
                  <div className="evidence__label">{item.label}</div>
                  <div className={`evidence__value ${item.tone === 'positive' ? 'pos' : item.tone === 'negative' ? 'neg' : ''}`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid--2">
              <div className="insight__block">
                <span className="prov prov--hypothesis">Assumptions</span>
                <ul className="list-check" style={{ marginTop: 4 }}>
                  {action.assumptions.map((a) => (
                    <li key={a}>
                      <span style={{ color: 'var(--ink-400)', marginTop: 2 }}>
                        <Icon name="info" size={12} strokeWidth={2} />
                      </span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="insight__block">
                <span className="prov prov--observed">Depends on</span>
                {action.dependencies.length ? (
                  <ul className="list-check" style={{ marginTop: 4 }}>
                    {action.dependencies.map((d) => (
                      <li key={d}>
                        <span style={{ color: 'var(--ink-400)', marginTop: 2 }}>
                          <Icon name="info" size={12} strokeWidth={2} />
                        </span>
                        {d}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-sub" style={{ marginTop: 4 }}>Nothing outside the loaded dataset.</p>
                )}
              </div>
            </div>

            <div className="callout">
              <strong>How this was ranked.</strong> {action.scoreExplanation}
            </div>
          </div>
        )}
      </div>

      <footer className="insight__foot">
        <button className="btn btn--sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide detail' : 'Evidence & assumptions'}
        </button>
        <button className="btn btn--sm" onClick={onOpenEvidence}>
          Source finding
        </button>
        <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
          <button
            className={`btn btn--sm ${status === 'accepted' ? 'btn--primary' : ''}`}
            onClick={() => onStatus(status === 'accepted' ? 'new' : 'accepted')}
          >
            Accept
          </button>
          <button
            className={`btn btn--sm ${status === 'investigating' ? 'btn--primary' : ''}`}
            onClick={() => onStatus(status === 'investigating' ? 'new' : 'investigating')}
          >
            Investigate
          </button>
          <button
            className="btn btn--sm"
            onClick={() => onStatus(status === 'dismissed' ? 'new' : 'dismissed')}
          >
            {status === 'dismissed' ? 'Restore' : 'Dismiss'}
          </button>
        </div>
      </footer>
    </article>
  );
}

export function ActionCenter() {
  const { dataset, analysis, actions, actionStatus, setActionStatus, goTo } = useApp();
  const [filter, setFilter] = useState<ActionCategory | 'all' | 'decided'>('all');

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const category of ACTION_CATEGORIES) map[category] = actions.filter((a) => a.category === category).length;
    return map;
  }, [actions]);

  if (!dataset || !analysis) return <NoDataState what="the Action Center" />;

  const statusOf = (action: Action): ActionStatus => actionStatus[action.id] ?? 'new';
  const decidedCount = actions.filter((a) => statusOf(a) !== 'new').length;

  const visible = actions
    .filter((action) => {
      if (filter === 'all') return statusOf(action) !== 'dismissed';
      if (filter === 'decided') return statusOf(action) !== 'new';
      return action.category === filter && statusOf(action) !== 'dismissed';
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  return (
    <>
      <FilterBar />
      <ScopeNote />

      <Card
        title="What deserves attention first"
        subtitle={`${actions.length} recommended response${actions.length === 1 ? '' : 's'} derived from the current findings, ranked by priority`}
      >
        <p className="t-sub" style={{ marginBottom: 14 }}>
          Each of these is decision support, not an instruction. Every one carries the evidence of the finding it came
          from, states the assumptions it rests on, and can be argued with — the ranking is shown in full on each card.
        </p>

        <div className="row row--wrap" style={{ gap: 8 }}>
          <button className={`btn btn--sm ${filter === 'all' ? 'btn--primary' : ''}`} onClick={() => setFilter('all')}>
            All ({actions.filter((a) => statusOf(a) !== 'dismissed').length})
          </button>
          {ACTION_CATEGORIES.filter((category) => counts[category] > 0).map((category) => (
            <button
              key={category}
              className={`btn btn--sm ${filter === category ? 'btn--primary' : ''}`}
              onClick={() => setFilter(category)}
            >
              {category} ({counts[category]})
            </button>
          ))}
          <button
            className={`btn btn--sm ${filter === 'decided' ? 'btn--primary' : ''}`}
            onClick={() => setFilter('decided')}
            style={{ marginLeft: 'auto' }}
          >
            Decided ({decidedCount})
          </button>
          <button className="btn btn--sm" onClick={() => goTo('report')}>
            Build brief
            <Icon name="arrowRight" size={13} />
          </button>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      {visible.length ? (
        <Section
          title={filter === 'all' ? 'Ranked actions' : filter === 'decided' ? 'Decided' : `${filter} actions`}
          subtitle={SCORING_NOTE}
        >
          <div className="stack">
            {visible.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                status={statusOf(action)}
                onStatus={(status) => setActionStatus(action.id, status)}
                onOpenEvidence={() => goTo('insights')}
              />
            ))}
          </div>
        </Section>
      ) : (
        <Card>
          <Callout tone="accent" title={filter === 'decided' ? 'No decisions recorded yet' : 'Nothing to act on here'}>
            {filter === 'decided'
              ? 'Accept, investigate or dismiss an action and it will collect here.'
              : 'No finding in the current selection produced a recommended response of this kind. That is a result, not an omission — the findings themselves are on the Insight Center.'}
          </Callout>
        </Card>
      )}
    </>
  );
}
