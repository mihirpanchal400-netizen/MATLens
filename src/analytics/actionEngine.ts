import type { Capabilities, EvidenceItem, Insight } from '../types';

/**
 * The action layer.
 *
 * An insight ends at a question. A Product Manager's week ends at a decision,
 * so this maps each finding onto the commercial response it actually implies —
 * with an owner, an urgency, an effort estimate and the evidence that produced
 * it carried through.
 *
 * Two rules govern everything here:
 *
 *  1. Nothing is invented. Every action inherits the evidence of the insight it
 *     came from, and says which assumptions it rests on.
 *  2. Nothing is asserted as certain. These are decision support — framed as
 *     assessments to run and questions to answer, never as instructions, and
 *     never as a causal claim the data cannot carry.
 *
 * Scope is commercial: market, brand, competitor, pricing, positioning and
 * communication. Nothing here touches clinical, prescribing or patient matters.
 */

export type ActionStatus = 'new' | 'accepted' | 'investigating' | 'dismissed';
export type Urgency = 'now' | 'this-cycle' | 'monitor';
export type Effort = 'low' | 'medium' | 'high';
export type ActionCategory = 'CRITICAL' | 'RISK' | 'OPPORTUNITY' | 'TREND' | 'WATCH';

export interface Action {
  /** Stable across re-renders and focus changes, so saved state survives. */
  id: string;
  insightKey: string;
  insightTitle: string;
  insightRule: string;
  category: ActionCategory;

  title: string;
  objective: string;
  rationale: string;
  target: string;

  urgency: Urgency;
  effort: Effort;
  /** 1–5, derived from the insight's severity and the size of the movement. */
  impact: number;
  /** 0–1. Never 1: one MAT period against one prior period cannot be certain. */
  confidence: number;

  expectedOutcome: string;
  assumptions: string[];
  dependencies: string[];
  owner: string;
  nextStep: string;

  evidence: EvidenceItem[];
  priorityScore: number;
  scoreExplanation: string;
}

const URGENCY_WEIGHT: Record<Urgency, number> = { now: 1, 'this-cycle': 0.7, monitor: 0.4 };
const EFFORT_WEIGHT: Record<Effort, number> = { low: 1, medium: 1.4, high: 2 };

export const URGENCY_LABEL: Record<Urgency, string> = {
  now: 'Now',
  'this-cycle': 'This cycle',
  monitor: 'Monitor',
};
export const EFFORT_LABEL: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/**
 * Impact × urgency × confidence ÷ effort, scaled to 0–100.
 *
 * Deliberately simple and shown in full on every card: a Product Manager has to
 * be able to disagree with the ranking, which means seeing how it was reached.
 */
function score(action: Omit<Action, 'priorityScore' | 'scoreExplanation' | 'id'>): {
  priorityScore: number;
  scoreExplanation: string;
} {
  const raw = (action.impact * URGENCY_WEIGHT[action.urgency] * action.confidence) / EFFORT_WEIGHT[action.effort];
  // The maximum possible raw value is 5 × 1 × 0.9 ÷ 1 = 4.5.
  const priorityScore = Math.round((raw / 4.5) * 100);
  return {
    priorityScore,
    scoreExplanation:
      `Impact ${action.impact}/5 × urgency ${URGENCY_WEIGHT[action.urgency]} × confidence ${action.confidence.toFixed(2)} ` +
      `÷ effort ${EFFORT_WEIGHT[action.effort]} = ${raw.toFixed(2)} of a possible 4.50, scaled to ${priorityScore}.`,
  };
}

/**
 * Confidence reflects what the dataset can actually support, not how convincing
 * the sentence sounds. It is capped below certainty on purpose.
 */
function confidenceFor(insight: Insight, capabilities: Capabilities): number {
  let value = 0.5;
  if (insight.evidence.length >= 4) value += 0.12;
  if (capabilities.canComputeGrowth) value += 0.12;
  if (capabilities.hasPreviousValue && !capabilities.previousValueDerivedFromGrowth) value += 0.08;
  if (insight.scope === 'region' && capabilities.hasRegion) value += 0.04;
  if (insight.scope === 'category' && capabilities.hasMolecule) value += 0.04;
  if (capabilities.limitations.length > 2) value -= 0.08;
  // One period against one prior period is never conclusive.
  return Math.max(0.3, Math.min(0.86, Number(value.toFixed(2))));
}

function impactFor(insight: Insight): number {
  switch (insight.severity) {
    case 'critical':
      return 5;
    case 'serious':
      return 4;
    case 'watch':
      return 3;
    case 'positive':
      return 3;
    default:
      return 2;
  }
}

function categoryFor(insight: Insight): ActionCategory {
  if (insight.severity === 'critical') return 'CRITICAL';
  if (OPPORTUNITY_SHAPED.has(insight.type)) return 'OPPORTUNITY';
  if (insight.severity === 'serious') return 'RISK';
  if (insight.severity === 'info') return 'TREND';
  return 'WATCH';
}

const OPPORTUNITY_SHAPED = new Set([
  'category-opportunity-molecule',
  'category-opportunity-segment',
  'regional-opportunity',
  'high-growth-niche',
  'vulnerable-incumbent',
  'outperformance',
  'share-gain',
  'rank-gain',
]);

/** A template is chosen by insight type; everything else is filled from the finding. */
interface Playbook {
  title: (subject: string) => string;
  objective: string;
  rationale: string;
  expectedOutcome: string;
  assumptions: string[];
  dependencies: string[];
  owner: string;
  nextStep: string;
  urgency: Urgency;
  effort: Effort;
}

/**
 * The playbook. Adding a rule to the insight engine and a row here is the whole
 * cost of extending the product — no UI changes required.
 */
const PLAYBOOK: Record<string, Playbook> = {
  'relative-underperformance': {
    title: (s) => `Establish where ${s} is losing category growth`,
    objective: 'Locate the segments, molecules or regions absorbing the growth the brand is not capturing.',
    rationale:
      'The brand is growing more slowly than the market it competes in. That gap has to be accounted for somewhere in the mix, and the dataset can narrow the search before any field work begins.',
    expectedOutcome: 'A shortlist of two or three areas that account for most of the gap, ready for commercial review.',
    assumptions: ['The comparison period is genuinely comparable', 'The extract covers the brand’s full market'],
    dependencies: ['Segment and region splits in the source extract'],
    owner: 'Brand Manager with Market Intelligence',
    nextStep: 'Filter to the brand’s segment and compare regional growth gaps.',
    urgency: 'now',
    effort: 'low',
  },
  'share-loss': {
    title: (s) => `Reconstruct where ${s}'s share went`,
    objective: 'Identify which competitors gained the share this brand lost, and in which part of the market.',
    rationale:
      'Share is zero-sum within a defined market, so a loss has a counterparty. Naming it converts a symptom into a competitive question that can be acted on.',
    expectedOutcome: 'A named set of gaining competitors with the segments in which the switch occurred.',
    assumptions: ['The market definition in the extract matches the brand’s real competitive set'],
    dependencies: ['Competitor-level rows for the same period'],
    owner: 'Brand Manager',
    nextStep: 'Open Competitor Intelligence and sort by share change.',
    urgency: 'now',
    effort: 'low',
  },
  'competitor-momentum': {
    title: (s) => `Run a positioning and pricing assessment against ${s}`,
    objective: 'Understand what is behind a competitor growing materially faster than the brand at meaningful scale.',
    rationale:
      'A competitor combining scale with above-market growth is taking a disproportionate share of category expansion. The dataset establishes that it is happening; it cannot establish why, which is what the assessment is for.',
    expectedOutcome: 'A view of the competitor’s pack, price and coverage position relative to the brand.',
    assumptions: ['Growth is organic rather than a stocking or restatement effect'],
    dependencies: ['Price and pack data outside this extract', 'Field input on coverage'],
    owner: 'Product Marketing with Sales Operations',
    nextStep: 'Compare the competitor’s segment and regional footprint against the brand’s.',
    urgency: 'now',
    effort: 'medium',
  },
  'category-opportunity-molecule': {
    title: (s) => `Assess why the brand is under-capturing ${s} growth`,
    objective: 'Determine whether the shortfall against the molecule is a coverage, positioning or price question.',
    rationale:
      'Demand at molecule level is expanding faster than the brand. The constraint is therefore the brand’s share of that demand rather than the demand itself, which narrows the set of plausible responses.',
    expectedOutcome: 'A judgement on whether the gap is addressable commercially in the current cycle.',
    assumptions: ['The molecule mapping in the extract is correct'],
    dependencies: ['Molecule-level competitor detail'],
    owner: 'Product Marketing',
    nextStep: 'Open Molecule Explorer and review the brand league table inside the molecule.',
    urgency: 'this-cycle',
    effort: 'medium',
  },
  'category-opportunity-segment': {
    title: (s) => `Evaluate participation in ${s}`,
    objective: 'Decide whether the portfolio has a credible route into the fastest-growing part of the category.',
    rationale:
      'Category growth is concentrating in a segment where the portfolio is comparatively under-represented. Whether that is addressable depends on portfolio fit, which the data cannot judge.',
    expectedOutcome: 'A go / no-go view on participation, with the required investment named.',
    assumptions: ['Segment definitions match how the business plans'],
    dependencies: ['Portfolio and pipeline input'],
    owner: 'Product Marketing with Portfolio Strategy',
    nextStep: 'Review the segment’s molecule mix and competitive concentration.',
    urgency: 'this-cycle',
    effort: 'high',
  },
  'regional-opportunity': {
    title: (s) => `Test whether ${s}'s growth can be captured`,
    objective: 'Establish whether the brand’s under-representation in a fast-growing region is a coverage or demand issue.',
    rationale:
      'A disproportionate share of category growth is occurring where the brand is comparatively weak. Coverage, stockist reach and field deployment are the usual explanations, and all three are checkable.',
    expectedOutcome: 'A view on whether regional expansion is worth a plan in this cycle.',
    assumptions: ['Regional splits in the extract reflect actual territory structure'],
    dependencies: ['Field coverage and distribution data'],
    owner: 'Sales Operations with Brand Manager',
    nextStep: 'Compare the brand’s regional mix against the market’s on Brand Performance.',
    urgency: 'this-cycle',
    effort: 'medium',
  },
  'regional-concentration': {
    title: (s) => `Assess replication of ${s}'s regional strength`,
    objective: 'Determine whether what works in the brand’s strongest region can be reproduced elsewhere.',
    rationale:
      'The brand’s value is concentrated well above an even split. That is simultaneously a dependency risk and the clearest available template for growth.',
    expectedOutcome: 'A judgement on whether the strong region reflects a repeatable approach or local conditions.',
    assumptions: ['The concentration is a commercial outcome rather than a data artefact'],
    dependencies: ['Field input on what drives the lead region'],
    owner: 'Brand Manager with Regional Sales',
    nextStep: 'Review the regional performance table and pick one comparable region to test.',
    urgency: 'this-cycle',
    effort: 'medium',
  },
  'vulnerable-incumbent': {
    title: (s) => `Assess the business coming loose from ${s}`,
    objective: 'Establish whether a declining competitor’s volume is addressable by this brand.',
    rationale:
      'A brand of material size losing value in a growing category is releasing business that is being redistributed now. Whether this brand is positioned to take any of it is a separate question.',
    expectedOutcome: 'A view on which part of the declining brand’s business is realistically contestable.',
    assumptions: ['The decline is not a temporary supply interruption'],
    dependencies: ['Segment overlap analysis'],
    owner: 'Product Marketing',
    nextStep: 'Compare the declining brand’s segment and molecule footprint against the brand’s.',
    urgency: 'this-cycle',
    effort: 'medium',
  },
  'emerging-competitor': {
    title: (s) => `Add ${s} to the competitive watchlist`,
    objective: 'Track a small brand compounding fast enough to matter within a few cycles.',
    rationale:
      'High growth on a small base is volatile and may reflect a launch or stocking effect rather than demand. It is cheap to watch now and expensive to respond to late.',
    expectedOutcome: 'A tracked entry reviewed each period, escalated if the base becomes material.',
    assumptions: ['The growth rate is not an artefact of a very small base'],
    dependencies: [],
    owner: 'Market Intelligence',
    nextStep: 'Record the current base and revisit next period.',
    urgency: 'monitor',
    effort: 'low',
  },
  'price-volume-mix': {
    title: (s) => `Evaluate price and mix exposure for ${s}`,
    objective: 'Separate how much of the brand’s value movement is price or pack mix rather than underlying demand.',
    rationale:
      'Value and unit growth have diverged materially. Growth that is price-led carries different risk to growth that is volume-led, and the two call for different plans.',
    expectedOutcome: 'A split of value movement into price/mix and volume, with the exposure named.',
    assumptions: ['Unit definitions are consistent across the two periods'],
    dependencies: ['Pack-level price data outside this extract'],
    owner: 'Product Marketing with Finance',
    nextStep: 'Review value against unit growth on Brand Performance.',
    urgency: 'this-cycle',
    effort: 'medium',
  },
  'growth-capture-gap': {
    title: (s) => `Account for ${s}'s share of category growth`,
    objective: 'Explain why the brand’s contribution to growth differs from its share of the market.',
    rationale:
      'Contributing less growth than the brand’s size implies is share loss expressed in rupees. It usually localises to a small number of segments or regions.',
    expectedOutcome: 'The two or three areas that explain most of the contribution gap.',
    assumptions: ['The market grew over the comparison period'],
    dependencies: [],
    owner: 'Brand Manager',
    nextStep: 'Rank brands by absolute value added and compare the top contributors.',
    urgency: 'this-cycle',
    effort: 'low',
  },
  'high-growth-niche': {
    title: (s) => `Screen ${s} as an early category shift`,
    objective: 'Decide whether a small, fast-growing molecule warrants a position before it establishes.',
    rationale:
      'Category shifts usually appear first in small molecules growing far ahead of the market. They can equally be short-lived, and one period cannot separate the two.',
    expectedOutcome: 'A view on whether to track, or to begin assessing entry.',
    assumptions: ['The growth reflects demand rather than a single company’s push'],
    dependencies: ['Clinical and guideline context outside this dataset'],
    owner: 'Portfolio Strategy',
    nextStep: 'Check the molecule’s concentration and who is driving its growth.',
    urgency: 'monitor',
    effort: 'high',
  },
  'rank-loss': {
    title: (s) => `Prepare the narrative for ${s}'s rank change`,
    objective: 'Get ahead of the internal and customer-facing consequences of losing a rank position.',
    rationale:
      'Rank is a coarse measure, but it is the one used in detailing, tenders and internal reviews. The change will be noticed whether or not it is material.',
    expectedOutcome: 'An agreed position on how the change is described, and how far the gap is from recoverable.',
    assumptions: ['The ranking universe matches how the business defines the market'],
    dependencies: [],
    owner: 'Brand Manager',
    nextStep: 'Check the value gap to the position above and below.',
    urgency: 'this-cycle',
    effort: 'low',
  },
  'share-gain': {
    title: (s) => `Establish what drove ${s}'s share gain`,
    objective: 'Identify the driver behind the gain so it can be sustained or repeated.',
    rationale:
      'A share gain is only useful commercially if its source is understood. Unexplained gains are as likely to reverse as to continue.',
    expectedOutcome: 'A named driver, with a view on whether it is repeatable in other regions or segments.',
    assumptions: ['The gain is not a one-off stocking or tender effect'],
    dependencies: [],
    owner: 'Brand Manager',
    nextStep: 'Compare regional and segment performance to locate the gain.',
    urgency: 'this-cycle',
    effort: 'low',
  },
  outperformance: {
    title: (s) => `Document what is working for ${s}`,
    objective: 'Capture the source of above-market growth while the evidence is current.',
    rationale:
      'The brand is capturing more than a proportional share of category growth. Understanding which regions or segments drove it is what makes it repeatable.',
    expectedOutcome: 'A short written account of the driver, usable in the next brand review.',
    assumptions: ['The outperformance is not concentrated in a single non-recurring event'],
    dependencies: [],
    owner: 'Brand Manager',
    nextStep: 'Identify the top contributing regions and segments.',
    urgency: 'monitor',
    effort: 'low',
  },
  'data-limitation': {
    title: () => 'Close the gaps in the next data extract',
    objective: 'Restore the analysis that the current file cannot support.',
    rationale:
      'Several metrics are unavailable because fields are missing from the extract rather than because nothing is happening. Most are a request away.',
    expectedOutcome: 'A corrected extract specification for the next refresh.',
    assumptions: ['The missing fields exist in the source system'],
    dependencies: ['Data provider or internal reporting team'],
    owner: 'Market Intelligence',
    nextStep: 'Review the limitations on MAT Data Upload and list the fields to request.',
    urgency: 'this-cycle',
    effort: 'low',
  },
};

/** Stable identity so accept/dismiss survives a re-render or a focus-brand change. */
export function actionId(insight: Insight): string {
  return `${insight.rule}|${insight.subject}|${insight.type}`;
}

/**
 * Builds the ranked action list from the findings already on screen.
 * Insights with no commercial response worth proposing produce nothing —
 * the product should not manufacture an action to fill a card.
 */
export function generateActions(insights: Insight[], capabilities: Capabilities): Action[] {
  const actions: Action[] = [];

  for (const insight of insights) {
    const play = PLAYBOOK[insight.type];
    if (!play) continue;

    const confidence = confidenceFor(insight, capabilities);
    const impact = impactFor(insight);
    const base = {
      insightKey: actionId(insight),
      insightTitle: insight.title,
      insightRule: insight.rule,
      category: categoryFor(insight),
      title: play.title(insight.subject),
      objective: play.objective,
      rationale: play.rationale,
      target: insight.subject,
      urgency: play.urgency,
      effort: play.effort,
      impact,
      confidence,
      expectedOutcome: play.expectedOutcome,
      assumptions: play.assumptions,
      dependencies: play.dependencies,
      owner: play.owner,
      nextStep: play.nextStep,
      evidence: insight.evidence,
    };

    actions.push({ id: base.insightKey, ...base, ...score(base) });
  }

  return actions.sort((a, b) => b.priorityScore - a.priorityScore);
}

export const ACTION_CATEGORIES: ActionCategory[] = ['CRITICAL', 'RISK', 'OPPORTUNITY', 'TREND', 'WATCH'];

/** How the ranking works, shown in the interface so it can be argued with. */
export const SCORING_NOTE =
  'Priority = impact × urgency × confidence ÷ effort, scaled to 100. Impact comes from the severity of the ' +
  'underlying finding, urgency and effort from the type of response, and confidence from what this dataset can ' +
  'actually support. Confidence is capped below certainty because one MAT period against one prior period cannot ' +
  'establish cause.';
