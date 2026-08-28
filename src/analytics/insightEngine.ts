import type { Analysis, Capabilities, EntityMetrics, Insight, InsightSeverity } from '../types';
import { formatPct, formatPp, formatRank, formatValue } from '../utils/format';
import { FORMULAS, growthGapPp, sharePct } from './metrics';
import { UNSPECIFIED } from './analyse';

/**
 * The MATLens rule engine.
 *
 * Rules are data, not UI. Each one reads the analysis object, tests an explicit
 * condition, and — if it fires — returns a structured Insight with its evidence
 * and its formula attached. No screen hard-codes a finding, and no rule invents a
 * cause: every rule states what the data shows, hedges the interpretation, and
 * ends with a question rather than an answer.
 */

/** Published thresholds. Shown verbatim on the Methodology screen. */
export const THRESHOLDS = {
  /** Growth gap (pp) beyond which brand vs market divergence is called out. */
  growthGapMaterial: 2.0,
  growthGapSerious: 5.0,
  /** Share movement (pp) that counts as a real move rather than rounding. */
  shareMoveMaterial: 0.15,
  shareMoveSerious: 0.5,
  /** A competitor must hold at least this share (%) to be treated as material. */
  competitorMinSharePct: 1.0,
  /** Growth (pp) above the focus brand before a competitor is flagged for momentum. */
  competitorGrowthLead: 5.0,
  /** Growth (%) above which a small brand is treated as an emerging entrant. */
  emergingGrowthPct: 35.0,
  emergingMaxSharePct: 3.0,
  emergingMinSharePct: 0.15,
  /** Category (molecule / segment) growth lead (pp) over the brand. */
  categoryGrowthLead: 5.0,
  /** Region growth lead (pp) over the market. */
  regionGrowthLead: 3.0,
  /** Regional concentration multiple of an even split before it is flagged. */
  concentrationMultiple: 1.6,
  /** Value-vs-unit growth divergence (pp) worth commenting on. */
  priceMixGap: 4.0,
  /** HHI below this is described as a fragmented market. */
  fragmentedHhi: 1500,
} as const;

/** Insight types that represent an opportunity rather than a performance read-out. */
export const OPPORTUNITY_TYPES = new Set([
  'category-opportunity-molecule',
  'category-opportunity-segment',
  'regional-opportunity',
  'competitor-momentum',
  'emerging-competitor',
  'vulnerable-incumbent',
  'fragmented-market',
  'high-growth-niche',
  'regional-concentration',
  'growth-capture-gap',
]);

interface RuleContext {
  analysis: Analysis;
  focus: EntityMetrics | null;
  capabilities: Capabilities;
}

type Rule = (ctx: RuleContext) => Insight[];

let sequence = 0;
function makeInsight(insight: Omit<Insight, 'id'>): Insight {
  sequence += 1;
  return { ...insight, id: `${insight.rule}-${sequence}` };
}

function severityFromGap(gap: number): InsightSeverity {
  const magnitude = Math.abs(gap);
  if (magnitude >= THRESHOLDS.growthGapSerious * 2) return 'critical';
  if (magnitude >= THRESHOLDS.growthGapSerious) return 'serious';
  return 'watch';
}

/* ------------------------------------------------------------------ */
/* Rule 1 — brand growth versus market growth                          */
/* ------------------------------------------------------------------ */
const brandVsMarket: Rule = ({ analysis, focus }) => {
  if (!focus || focus.growthPct === null || analysis.market.growthPct === null) return [];
  const gap = growthGapPp(focus.growthPct, analysis.market.growthPct);
  if (gap === null) return [];

  const evidence = [
    { label: 'Brand growth', value: formatPct(focus.growthPct, { signed: true }), tone: focus.growthPct >= 0 ? ('positive' as const) : ('negative' as const) },
    { label: 'Market growth', value: formatPct(analysis.market.growthPct, { signed: true }), tone: 'neutral' as const },
    { label: 'Growth gap', value: formatPp(gap), tone: gap >= 0 ? ('positive' as const) : ('negative' as const) },
    { label: 'Brand MAT', value: formatValue(focus.matValue), tone: 'neutral' as const },
  ];

  if (Math.abs(gap) < THRESHOLDS.growthGapMaterial) {
    return [
      makeInsight({
        rule: 'brand-vs-market',
        type: 'in-line-growth',
        severity: 'info',
        scope: 'brand',
        title: `${focus.name} is growing broadly in line with the market`,
        subject: focus.name,
        signal: `${focus.name} grew ${formatPct(focus.growthPct, { signed: true })} against market growth of ${formatPct(analysis.market.growthPct, { signed: true })} — a gap of ${formatPp(gap)}.`,
        interpretation: 'A gap of this size is within normal period-to-period variation and does not by itself indicate a change in competitive position.',
        implication: 'The brand is holding its relative position. Momentum questions are better answered at segment, molecule or regional level, where averages can hide divergence.',
        investigationQuestion: 'Does this in-line national picture hold in every region and segment, or are gains in one area offsetting losses in another?',
        evidence,
        calculation: `${FORMULAS.growthGap}\n${FORMULAS.growth}`,
        priority: 40,
        link: { page: 'brand', brand: focus.name },
      }),
    ];
  }

  const underperforming = gap < 0;
  const marketGrowing = analysis.market.growthPct > 0;
  const brandGrowing = focus.growthPct > 0;

  if (underperforming) {
    return [
      makeInsight({
        rule: 'brand-vs-market',
        type: 'relative-underperformance',
        severity: severityFromGap(gap),
        scope: 'brand',
        title: `${focus.name} is growing slower than its market`,
        subject: focus.name,
        signal:
          brandGrowing && marketGrowing
            ? `${focus.name} grew ${formatPct(focus.growthPct, { signed: true })} while the market grew ${formatPct(analysis.market.growthPct, { signed: true })}. The growth gap is ${formatPp(gap)}.`
            : `${focus.name} grew ${formatPct(focus.growthPct, { signed: true })} against market growth of ${formatPct(analysis.market.growthPct, { signed: true })}, a gap of ${formatPp(gap)}.`,
        interpretation:
          brandGrowing && marketGrowing
            ? 'The brand is growing in absolute terms but slower than the category, which may indicate a loss of relative momentum rather than an absolute decline.'
            : 'The brand is trailing the category. This could suggest competitive pressure, distribution gaps or portfolio mix, none of which the dataset alone can confirm.',
        implication:
          'If this persists, market share erodes even while sales rise. Incremental category growth is being captured elsewhere.',
        investigationQuestion:
          'Which competitors, molecules, segments or regions are capturing the incremental category growth that this brand is not?',
        evidence,
        calculation: `${FORMULAS.growthGap}\n${FORMULAS.growth}`,
        priority: 100 + Math.min(Math.abs(gap), 30),
        link: { page: 'competitors', brand: focus.name },
      }),
    ];
  }

  return [
    makeInsight({
      rule: 'brand-vs-market',
      type: 'outperformance',
      severity: 'positive',
      scope: 'brand',
      title: `${focus.name} is outgrowing its market`,
      subject: focus.name,
      signal: `${focus.name} grew ${formatPct(focus.growthPct, { signed: true })} against market growth of ${formatPct(analysis.market.growthPct, { signed: true })} — a gap of ${formatPp(gap)}.`,
      interpretation:
        'The brand is capturing more than its proportional share of category growth. The data shows the outcome, not the reason.',
      implication:
        'Relative position is strengthening. Understanding which regions, segments or molecules drove this is what makes it repeatable.',
      investigationQuestion:
        'Which regions or segments drove the outperformance, and is that driver scalable to the areas where the brand is not growing?',
      evidence,
      calculation: `${FORMULAS.growthGap}\n${FORMULAS.growth}`,
      priority: 80 + Math.min(gap, 20),
      link: { page: 'brand', brand: focus.name },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 2 — market share movement                                      */
/* ------------------------------------------------------------------ */
const shareMovement: Rule = ({ focus, analysis }) => {
  if (!focus || focus.shareChangePp === null || focus.sharePct === null || focus.prevSharePct === null) return [];
  const change = focus.shareChangePp;
  if (Math.abs(change) < THRESHOLDS.shareMoveMaterial) return [];

  const losing = change < 0;
  const severity: InsightSeverity = losing
    ? Math.abs(change) >= THRESHOLDS.shareMoveSerious
      ? 'critical'
      : 'serious'
    : 'positive';

  const evidence = [
    { label: 'Previous share', value: formatPct(focus.prevSharePct, { decimals: 2 }), tone: 'neutral' as const },
    { label: 'Current share', value: formatPct(focus.sharePct, { decimals: 2 }), tone: 'neutral' as const },
    { label: 'Share change', value: formatPp(change, 2), tone: losing ? ('negative' as const) : ('positive' as const) },
    { label: 'Market growth', value: formatPct(analysis.market.growthPct, { signed: true }), tone: 'neutral' as const },
  ];

  return [
    makeInsight({
      rule: 'share-movement',
      type: losing ? 'share-loss' : 'share-gain',
      severity,
      scope: 'brand',
      title: losing
        ? `${focus.name} lost ${formatPct(Math.abs(change), { decimals: 2, suffix: ' pp' })} of market share`
        : `${focus.name} gained ${formatPct(change, { decimals: 2, suffix: ' pp' })} of market share`,
      subject: focus.name,
      signal: `Share moved from ${formatPct(focus.prevSharePct, { decimals: 2 })} to ${formatPct(focus.sharePct, { decimals: 2 })} within the current selection — a change of ${formatPp(change, 2)}.`,
      interpretation: losing
        ? 'Share is a relative measure: it can fall while sales rise. This movement means the rest of the market grew faster than the brand did.'
        : 'The brand grew faster than the rest of the market over the same period, which is what a share gain represents.',
      implication: losing
        ? 'Relative market position is weakening. Share loss compounds — the base against which next year is measured shrinks in relative terms.'
        : 'Relative market position is strengthening, which typically strengthens negotiating and investment cases internally.',
      investigationQuestion: losing
        ? 'Which competitor gained share over the same period, and in which segment or region did the switch happen?'
        : 'Which competitor lost the share this brand gained, and is that shift defensible or a one-off?',
      evidence,
      calculation: `${FORMULAS.shareChange}\n${FORMULAS.share}\n${FORMULAS.previousShare}`,
      priority: losing ? 95 + Math.abs(change) * 10 : 70 + change * 10,
      link: { page: 'competitors', brand: focus.name },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 3 — rank movement                                              */
/* ------------------------------------------------------------------ */
const rankMovement: Rule = ({ focus, analysis }) => {
  if (!focus || focus.rank === null || focus.prevRank === null || focus.rankChange === null) return [];
  if (focus.rankChange === 0) return [];
  const lost = focus.rankChange < 0;
  const overtaker = analysis.brands.find(
    (b) => b.name !== focus.name && b.rank !== null && b.prevRank !== null && b.rank < (focus.rank ?? 0) && b.prevRank > (focus.prevRank ?? 0),
  );

  return [
    makeInsight({
      rule: 'rank-movement',
      type: lost ? 'rank-loss' : 'rank-gain',
      severity: lost ? 'serious' : 'positive',
      scope: 'brand',
      title: lost
        ? `${focus.name} moved down from ${formatRank(focus.prevRank)} to ${formatRank(focus.rank)}`
        : `${focus.name} moved up from ${formatRank(focus.prevRank)} to ${formatRank(focus.rank)}`,
      subject: focus.name,
      signal: `Ranked by MAT value within the current selection, ${focus.name} is ${formatRank(focus.rank)} this period against ${formatRank(focus.prevRank)} in the previous period.${overtaker ? ` ${overtaker.name} moved above it over the same period.` : ''}`,
      interpretation:
        'Rank is a coarse measure — a one-position move can come from a small value difference. It matters mainly because internal and customer-facing conversations use it.',
      implication: lost
        ? 'Leadership language in detailing, tender documents and internal reviews may need to change, and competitors will use the new ordering.'
        : 'A higher rank strengthens the brand narrative with prescribers, trade and internal stakeholders.',
      investigationQuestion: overtaker
        ? `What drove ${overtaker.name}'s move — a specific segment, region or new presentation?`
        : 'How wide is the value gap to the position above and below, and how quickly could it close again?',
      evidence: [
        { label: 'Previous rank', value: formatRank(focus.prevRank), tone: 'neutral' },
        { label: 'Current rank', value: formatRank(focus.rank), tone: lost ? 'negative' : 'positive' },
        { label: 'Brand MAT', value: formatValue(focus.matValue), tone: 'neutral' },
        ...(overtaker ? [{ label: `${overtaker.name} growth`, value: formatPct(overtaker.growthPct, { signed: true }), tone: 'neutral' as const }] : []),
      ],
      calculation: `${FORMULAS.rank}\n${FORMULAS.rankChange}`,
      priority: lost ? 88 : 66,
      link: { page: 'competitors', brand: focus.name },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 4 — competitor momentum                                        */
/* ------------------------------------------------------------------ */
const competitorMomentum: Rule = ({ analysis, focus }) => {
  if (!focus || focus.growthPct === null) return [];
  const candidates = analysis.brands
    .filter(
      (b) =>
        b.name !== focus.name &&
        b.growthPct !== null &&
        (b.sharePct ?? 0) >= THRESHOLDS.competitorMinSharePct &&
        b.growthPct - (focus.growthPct ?? 0) >= THRESHOLDS.competitorGrowthLead,
    )
    .sort((a, b) => (b.absoluteChange ?? 0) - (a.absoluteChange ?? 0))
    .slice(0, 2);

  return candidates.map((competitor) =>
    makeInsight({
      rule: 'competitor-momentum',
      type: 'competitor-momentum',
      severity: (competitor.sharePct ?? 0) >= (focus.sharePct ?? 0) ? 'critical' : 'serious',
      scope: 'competitor',
      title: `${competitor.name} is growing materially faster than ${focus.name}`,
      subject: competitor.name,
      signal: `${competitor.name} (${competitor.company ?? 'company not identified'}) holds ${formatPct(competitor.sharePct, { decimals: 2 })} share and grew ${formatPct(competitor.growthPct, { signed: true })}, against ${formatPct(focus.growthPct, { signed: true })} for ${focus.name}. It added ${formatValue(competitor.absoluteChange)} of MAT value.`,
      interpretation:
        'A competitor combining meaningful scale with above-market growth is taking a disproportionate share of category expansion. The dataset shows the movement, not what is driving it.',
      implication: `If this rate persists, ${competitor.name} closes the gap to ${focus.name} on the current trajectory, and does so using growth the category is already generating.`,
      investigationQuestion: `Where is ${competitor.name} winning — which regions, segments or molecules — and is it converting new patients or switching existing ones?`,
      evidence: [
        { label: `${competitor.name} growth`, value: formatPct(competitor.growthPct, { signed: true }), tone: 'negative' },
        { label: `${focus.name} growth`, value: formatPct(focus.growthPct, { signed: true }), tone: 'neutral' },
        { label: 'Their share', value: formatPct(competitor.sharePct, { decimals: 2 }), tone: 'neutral' },
        { label: 'Share change', value: formatPp(competitor.shareChangePp, 2), tone: 'negative' },
        { label: 'Value added', value: formatValue(competitor.absoluteChange), tone: 'neutral' },
      ],
      calculation: `${FORMULAS.growth}\n${FORMULAS.shareChange}\nAbsolute change = Current MAT − Previous MAT`,
      priority: 92 + (competitor.shareChangePp ?? 0) * 5,
      link: { page: 'competitors', brand: competitor.name },
    }),
  );
};

/* ------------------------------------------------------------------ */
/* Rule 5 — emerging competitor                                        */
/* ------------------------------------------------------------------ */
const emergingCompetitor: Rule = ({ analysis, focus }) => {
  const candidates = analysis.brands
    .filter(
      (b) =>
        b.name !== focus?.name &&
        b.growthPct !== null &&
        b.growthPct >= THRESHOLDS.emergingGrowthPct &&
        (b.sharePct ?? 0) <= THRESHOLDS.emergingMaxSharePct &&
        (b.sharePct ?? 0) >= THRESHOLDS.emergingMinSharePct,
    )
    .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
    .slice(0, 2);

  return candidates.map((brand) =>
    makeInsight({
      rule: 'emerging-competitor',
      type: 'emerging-competitor',
      severity: 'watch',
      scope: 'competitor',
      title: `${brand.name} is a small brand growing at ${formatPct(brand.growthPct, { signed: true })}`,
      subject: brand.name,
      signal: `${brand.name} (${brand.company ?? 'company not identified'}) holds only ${formatPct(brand.sharePct, { decimals: 2 })} share but grew ${formatPct(brand.growthPct, { signed: true })} on a base of ${formatValue(brand.prevMatValue)}${brand.molecule ? `, on ${brand.molecule}` : ''}.`,
      interpretation:
        'High growth on a small base is volatile and may reflect a launch, a stocking effect, or expanded distribution rather than sustained demand. It is a watch item, not yet a threat.',
      implication:
        'Entrants that scale usually do so from exactly this position. Noticing them a year early is cheaper than responding a year late.',
      investigationQuestion: `Is ${brand.name}'s growth coming from new geographies, a new presentation, or price positioning — and is the base large enough for the rate to be meaningful?`,
      evidence: [
        { label: 'Growth', value: formatPct(brand.growthPct, { signed: true }), tone: 'negative' },
        { label: 'Share', value: formatPct(brand.sharePct, { decimals: 2 }), tone: 'neutral' },
        { label: 'MAT value', value: formatValue(brand.matValue), tone: 'neutral' },
        { label: 'Previous MAT', value: formatValue(brand.prevMatValue), tone: 'neutral' },
      ],
      calculation: `${FORMULAS.growth}\n${FORMULAS.share}\nFlagged when growth ≥ ${THRESHOLDS.emergingGrowthPct}% and share is between ${THRESHOLDS.emergingMinSharePct}% and ${THRESHOLDS.emergingMaxSharePct}%`,
      priority: 62,
      link: { page: 'competitors', brand: brand.name },
    }),
  );
};

/* ------------------------------------------------------------------ */
/* Rule 6 — molecule (category) opportunity                            */
/* ------------------------------------------------------------------ */
const moleculeOpportunity: Rule = ({ analysis, focus }) => {
  if (!focus || !focus.molecule || focus.growthPct === null) return [];
  const molecule = analysis.molecules.find((m) => m.name === focus.molecule);
  if (!molecule || molecule.growthPct === null) return [];
  const gap = growthGapPp(molecule.growthPct, focus.growthPct);
  if (gap === null || gap < THRESHOLDS.categoryGrowthLead) return [];

  const rivals = analysis.brands
    .filter((b) => b.molecule === molecule.name && b.name !== focus.name && (b.growthPct ?? 0) > (focus.growthPct ?? 0))
    .sort((a, b) => (b.absoluteChange ?? 0) - (a.absoluteChange ?? 0))
    .slice(0, 3);

  return [
    makeInsight({
      rule: 'molecule-opportunity',
      type: 'category-opportunity-molecule',
      severity: gap >= THRESHOLDS.categoryGrowthLead * 2 ? 'critical' : 'serious',
      scope: 'category',
      title: `${molecule.name} is growing faster than ${focus.name}`,
      subject: molecule.name,
      signal: `The ${molecule.name} molecule grew ${formatPct(molecule.growthPct, { signed: true })} to ${formatValue(molecule.matValue)}, while ${focus.name} grew ${formatPct(focus.growthPct, { signed: true })} — a gap of ${formatPp(gap)}.`,
      interpretation:
        'The brand competes in a molecule that is expanding faster than the brand itself. That growth is being captured by someone, and the dataset can name who.',
      implication:
        'Incremental molecule growth is flowing to other brands. Molecule-level demand is not the constraint here — the brand’s share of it is.',
      investigationQuestion: rivals.length
        ? `${rivals.map((r) => r.name).join(', ')} grew faster on the same molecule. What are they doing differently in coverage, presentation or pricing?`
        : 'Which brands on this molecule are absorbing the incremental growth, and in which regions?',
      evidence: [
        { label: 'Molecule growth', value: formatPct(molecule.growthPct, { signed: true }), tone: 'positive' },
        { label: `${focus.name} growth`, value: formatPct(focus.growthPct, { signed: true }), tone: 'negative' },
        { label: 'Gap', value: formatPp(gap), tone: 'negative' },
        { label: 'Molecule MAT', value: formatValue(molecule.matValue), tone: 'neutral' },
      ],
      calculation: `Molecule growth uses ${FORMULAS.growth.toLowerCase()}, aggregated across every brand carrying the molecule.\nGap (pp) = Molecule growth % − Brand growth %`,
      priority: 90 + Math.min(gap, 20),
      link: { page: 'opportunities', brand: focus.name },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 7 — segment opportunity                                        */
/* ------------------------------------------------------------------ */
const segmentOpportunity: Rule = ({ analysis, focus }) => {
  if (analysis.market.growthPct === null) return [];
  const segments = analysis.segments.filter((s) => s.name !== UNSPECIFIED && s.growthPct !== null && (s.sharePct ?? 0) >= 3);
  if (segments.length < 2) return [];
  const fastest = [...segments].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))[0];
  const gap = growthGapPp(fastest.growthPct, analysis.market.growthPct);
  if (gap === null || gap < THRESHOLDS.categoryGrowthLead) return [];

  const focusCompany = focus?.company ?? null;
  const companyValueInSegment = focusCompany
    ? analysis.brands
        .filter((b) => b.company === focusCompany && b.segment === fastest.name)
        .reduce((sum, b) => sum + b.matValue, 0)
    : 0;
  const companyShareOfSegment = sharePct(companyValueInSegment, fastest.matValue);
  const isFocusSegment = focus?.segment === fastest.name;

  return [
    makeInsight({
      rule: 'segment-opportunity',
      type: 'category-opportunity-segment',
      severity: 'watch',
      scope: 'category',
      title: `${fastest.name} is the fastest-growing segment in the selection`,
      subject: fastest.name,
      signal: `${fastest.name} grew ${formatPct(fastest.growthPct, { signed: true })} to ${formatValue(fastest.matValue)}, against market growth of ${formatPct(analysis.market.growthPct, { signed: true })} — ${formatPp(gap)} above the market.${focusCompany && !isFocusSegment ? ` ${focusCompany} holds ${formatPct(companyShareOfSegment, { decimals: 2 })} of this segment.` : ''}`,
      interpretation:
        'Segment growth of this size usually reflects a shift in prescribing preference or category expansion. Whether it is addressable depends on portfolio fit, which the data cannot judge.',
      implication:
        isFocusSegment
          ? 'The brand already competes here, so the question is share of a growing pool rather than entry.'
          : 'Category growth is concentrated in a segment where the portfolio is comparatively under-represented.',
      investigationQuestion: isFocusSegment
        ? 'Is the brand growing at least as fast as its own segment, or is segment growth flowing to other brands within it?'
        : `Does the current portfolio have a credible entry into ${fastest.name}, and what would participation require?`,
      evidence: [
        { label: 'Segment growth', value: formatPct(fastest.growthPct, { signed: true }), tone: 'positive' },
        { label: 'Market growth', value: formatPct(analysis.market.growthPct, { signed: true }), tone: 'neutral' },
        { label: 'Gap vs market', value: formatPp(gap), tone: 'positive' },
        { label: 'Segment MAT', value: formatValue(fastest.matValue), tone: 'neutral' },
      ],
      calculation: `Segment growth uses ${FORMULAS.growth.toLowerCase()}, aggregated across all brands in the segment.\nGap (pp) = Segment growth % − Market growth %`,
      priority: 74,
      link: { page: 'market' },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 8 — regional opportunity                                       */
/* ------------------------------------------------------------------ */
const regionalOpportunity: Rule = ({ analysis, focus, capabilities }) => {
  if (!capabilities.hasRegion || analysis.market.growthPct === null) return [];
  const regions = analysis.regions.filter((r) => r.name !== UNSPECIFIED && r.growthPct !== null);
  if (regions.length < 2) return [];
  const fastest = [...regions].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))[0];
  const gap = growthGapPp(fastest.growthPct, analysis.market.growthPct);
  if (gap === null || gap < THRESHOLDS.regionGrowthLead) return [];

  const brandRegions = focus ? analysis.brandRegionValue.get(focus.name) : undefined;
  const brandInRegion = brandRegions?.get(fastest.name)?.current ?? 0;
  const brandTotal = focus?.matValue ?? 0;
  const brandRegionMix = sharePct(brandInRegion, brandTotal);
  const marketRegionMix = sharePct(fastest.matValue, analysis.market.totalValue);
  const underIndexed =
    brandRegionMix !== null && marketRegionMix !== null && brandRegionMix < marketRegionMix - 3;

  return [
    makeInsight({
      rule: 'regional-opportunity',
      type: 'regional-opportunity',
      severity: underIndexed ? 'serious' : 'watch',
      scope: 'region',
      title: `${fastest.name} is growing ${formatPp(gap)} faster than the market`,
      subject: fastest.name,
      signal: `${fastest.name} grew ${formatPct(fastest.growthPct, { signed: true })} against a market rate of ${formatPct(analysis.market.growthPct, { signed: true })}.${focus && brandRegionMix !== null && marketRegionMix !== null ? ` ${focus.name} takes ${formatPct(brandRegionMix, { decimals: 1 })} of its value from this region, against ${formatPct(marketRegionMix, { decimals: 1 })} for the market overall.` : ''}`,
      interpretation: underIndexed
        ? 'The brand is under-indexed in the region growing fastest, which may indicate a coverage, distribution or field-force gap rather than a demand problem.'
        : 'The region is expanding faster than the national market. Whether the brand is positioned to participate depends on its footprint there.',
      implication: underIndexed
        ? 'A disproportionate part of category growth is happening where this brand is comparatively weak.'
        : 'Regional momentum can be a source of growth that national averages hide.',
      investigationQuestion: underIndexed
        ? `What limits the brand in ${fastest.name} — field coverage, stockist reach, key-account access, or price positioning?`
        : `Is the brand growing at least as fast as ${fastest.name} is, or is regional growth accruing to competitors?`,
      evidence: [
        { label: `${fastest.name} growth`, value: formatPct(fastest.growthPct, { signed: true }), tone: 'positive' },
        { label: 'Market growth', value: formatPct(analysis.market.growthPct, { signed: true }), tone: 'neutral' },
        { label: 'Region MAT', value: formatValue(fastest.matValue), tone: 'neutral' },
        ...(focus && brandRegionMix !== null
          ? [{ label: `${focus.name} mix here`, value: formatPct(brandRegionMix, { decimals: 1 }), tone: underIndexed ? ('negative' as const) : ('neutral' as const) }]
          : []),
      ],
      calculation: `Region growth uses ${FORMULAS.growth.toLowerCase()}, aggregated across all brands in the region.\nBrand regional mix % = Brand value in region ÷ Brand total value × 100`,
      priority: underIndexed ? 84 : 60,
      link: { page: 'opportunities' },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 9 — regional concentration of the focus brand                  */
/* ------------------------------------------------------------------ */
const regionalConcentration: Rule = ({ analysis, focus, capabilities }) => {
  if (!capabilities.hasRegion || !focus || focus.topRegionSharePct === null || focus.topRegionSharePct === undefined) return [];
  const regionCount = analysis.market.regionCount;
  if (regionCount < 3) return [];
  const evenShare = 100 / regionCount;
  if (focus.topRegionSharePct < evenShare * THRESHOLDS.concentrationMultiple) return [];

  return [
    makeInsight({
      rule: 'regional-concentration',
      type: 'regional-concentration',
      severity: 'watch',
      scope: 'region',
      title: `${focus.name}'s value is concentrated in ${focus.topRegion}`,
      subject: focus.name,
      signal: `${formatPct(focus.topRegionSharePct, { decimals: 1 })} of ${focus.name}'s MAT value comes from ${focus.topRegion}, against ${formatPct(evenShare, { decimals: 1 })} if it were spread evenly across the ${regionCount} regions in the data.`,
      interpretation:
        'Concentration can reflect genuine regional strength or simply limited presence elsewhere. The dataset shows the distribution, not the reason for it.',
      implication:
        'Both the risk and the headroom sit in the same fact: a single region carries the brand, and the remaining regions are largely untapped.',
      investigationQuestion: `Is the concentration in ${focus.topRegion} a deliberate focus, or the result of weak coverage elsewhere — and what would replicating it in one more region cost?`,
      evidence: [
        { label: 'Top region', value: String(focus.topRegion ?? '—'), tone: 'neutral' },
        { label: 'Share of brand', value: formatPct(focus.topRegionSharePct, { decimals: 1 }), tone: 'neutral' },
        { label: 'Even split', value: formatPct(evenShare, { decimals: 1 }), tone: 'neutral' },
        { label: 'Regions in data', value: String(regionCount), tone: 'neutral' },
      ],
      calculation: `${FORMULAS.concentration}\nFlagged when the top region exceeds ${THRESHOLDS.concentrationMultiple}× an even split`,
      priority: 58,
      link: { page: 'opportunities', brand: focus.name },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 10 — vulnerable incumbents (declining large brands)            */
/* ------------------------------------------------------------------ */
const vulnerableIncumbent: Rule = ({ analysis, focus }) => {
  if (analysis.market.growthPct === null || analysis.market.growthPct <= 0) return [];
  const candidates = analysis.brands
    .filter((b) => b.name !== focus?.name && (b.sharePct ?? 0) >= THRESHOLDS.competitorMinSharePct && (b.growthPct ?? 1) < 0)
    .sort((a, b) => (a.absoluteChange ?? 0) - (b.absoluteChange ?? 0))
    .slice(0, 2);

  return candidates.map((brand) =>
    makeInsight({
      rule: 'vulnerable-incumbent',
      type: 'vulnerable-incumbent',
      severity: 'watch',
      scope: 'competitor',
      title: `${brand.name} is declining in a growing market`,
      subject: brand.name,
      signal: `${brand.name} (${brand.company ?? 'company not identified'}) holds ${formatPct(brand.sharePct, { decimals: 2 })} share but declined ${formatPct(brand.growthPct, { signed: true })} while the market grew ${formatPct(analysis.market.growthPct, { signed: true })}. It lost ${formatValue(Math.abs(brand.absoluteChange ?? 0))} of MAT value.`,
      interpretation:
        'A brand of this size losing value in a growing category is releasing volume that other brands are absorbing. The dataset cannot say whether the cause is supply, pricing, promotion or portfolio.',
      implication: `Roughly ${formatValue(Math.abs(brand.absoluteChange ?? 0))} of business is in play${brand.molecule ? ` on ${brand.molecule}` : ''}, and it is being redistributed now, not later.`,
      investigationQuestion: `Which brands are absorbing ${brand.name}'s decline${brand.segment ? ` in ${brand.segment}` : ''}, and is there a credible route to capturing part of it?`,
      evidence: [
        { label: `${brand.name} growth`, value: formatPct(brand.growthPct, { signed: true }), tone: 'negative' },
        { label: 'Market growth', value: formatPct(analysis.market.growthPct, { signed: true }), tone: 'positive' },
        { label: 'Value lost', value: formatValue(Math.abs(brand.absoluteChange ?? 0)), tone: 'neutral' },
        { label: 'Their share', value: formatPct(brand.sharePct, { decimals: 2 }), tone: 'neutral' },
      ],
      calculation: `${FORMULAS.growth}\nAbsolute change = Current MAT − Previous MAT\nFlagged when share ≥ ${THRESHOLDS.competitorMinSharePct}% and growth < 0 in a growing market`,
      priority: 68,
      link: { page: 'competitors', brand: brand.name },
    }),
  );
};

/* ------------------------------------------------------------------ */
/* Rule 11 — growth capture gap (contribution vs share)                */
/* ------------------------------------------------------------------ */
const growthCaptureGap: Rule = ({ analysis, focus }) => {
  if (!focus || focus.growthContributionPct === null || focus.sharePct === null) return [];
  const gap = focus.growthContributionPct - focus.sharePct;
  if (Math.abs(gap) < 1) return [];
  const shortfall = gap < 0;

  return [
    makeInsight({
      rule: 'growth-capture',
      type: 'growth-capture-gap',
      severity: shortfall ? 'serious' : 'positive',
      scope: 'brand',
      title: shortfall
        ? `${focus.name} captured less of market growth than its size implies`
        : `${focus.name} captured more of market growth than its size implies`,
      subject: focus.name,
      signal: `${focus.name} holds ${formatPct(focus.sharePct, { decimals: 2 })} of the market but contributed ${formatPct(focus.growthContributionPct, { decimals: 1 })} of the market's absolute growth of ${formatValue(analysis.market.absoluteChange)}.`,
      interpretation: shortfall
        ? 'Contributing less growth than the brand’s share would imply is the arithmetic definition of losing share — expressed in rupees rather than percentage points.'
        : 'Contributing more growth than the brand’s share implies is what a share gain looks like in absolute terms.',
      implication: shortfall
        ? 'The incremental rupees in this market are going elsewhere, even where the brand’s own sales are rising.'
        : 'The brand is a disproportionate driver of category growth, which is a strong internal investment argument.',
      investigationQuestion: shortfall
        ? 'Which three brands contributed the most absolute growth this period, and what do they have in common?'
        : 'Which part of the portfolio drove the disproportionate contribution, and can that be repeated?',
      evidence: [
        { label: 'Share of market', value: formatPct(focus.sharePct, { decimals: 2 }), tone: 'neutral' },
        { label: 'Share of growth', value: formatPct(focus.growthContributionPct, { decimals: 1 }), tone: shortfall ? 'negative' : 'positive' },
        { label: 'Gap', value: formatPp(gap, 1), tone: shortfall ? 'negative' : 'positive' },
        { label: 'Brand value added', value: formatValue(focus.absoluteChange), tone: 'neutral' },
      ],
      calculation: `${FORMULAS.contribution}\n${FORMULAS.share}`,
      priority: shortfall ? 78 : 64,
      link: { page: 'brand', brand: focus.name },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 12 — value vs volume divergence                                */
/* ------------------------------------------------------------------ */
const priceVolumeMix: Rule = ({ focus, capabilities }) => {
  if (!capabilities.hasUnits || !capabilities.hasPreviousUnits) return [];
  if (!focus || focus.growthPct === null || focus.unitGrowthPct === null) return [];
  const gap = focus.growthPct - focus.unitGrowthPct;
  if (Math.abs(gap) < THRESHOLDS.priceMixGap) return [];
  const priceLed = gap > 0;

  return [
    makeInsight({
      rule: 'price-volume-mix',
      type: 'price-volume-mix',
      severity: priceLed ? 'watch' : 'info',
      scope: 'brand',
      title: priceLed
        ? `${focus.name}'s value growth is running ahead of its volume growth`
        : `${focus.name}'s volume growth is running ahead of its value growth`,
      subject: focus.name,
      signal: `Value grew ${formatPct(focus.growthPct, { signed: true })} while units grew ${formatPct(focus.unitGrowthPct, { signed: true })} — a divergence of ${formatPp(gap)}.`,
      interpretation: priceLed
        ? 'Value growth exceeding unit growth is consistent with price increases or a richer pack/presentation mix. The dataset cannot separate the two without price data.'
        : 'Unit growth exceeding value growth is consistent with price erosion, trade discounting, or a shift to lower-priced packs.',
      implication: priceLed
        ? 'Growth that is price-led is more exposed to price control, tender pressure and trade resistance than growth that is volume-led.'
        : 'The brand is winning units without matching value, which compresses contribution per pack.',
      investigationQuestion: priceLed
        ? 'How much of this growth would survive a flat-price scenario, and is underlying prescription volume actually rising?'
        : 'Where is the price or mix erosion happening — a specific pack, channel or region?',
      evidence: [
        { label: 'Value growth', value: formatPct(focus.growthPct, { signed: true }), tone: 'neutral' },
        { label: 'Unit growth', value: formatPct(focus.unitGrowthPct, { signed: true }), tone: 'neutral' },
        { label: 'Price / mix effect', value: formatPp(gap), tone: priceLed ? 'positive' : 'negative' },
      ],
      calculation: `${FORMULAS.unitGrowth}\n${FORMULAS.priceMix}`,
      priority: 56,
      link: { page: 'brand', brand: focus.name },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 13 — market structure                                          */
/* ------------------------------------------------------------------ */
const marketStructure: Rule = ({ analysis }) => {
  const { hhi: hhiValue, cr4, brandCount, concentrationLabel: label } = analysis.market;
  if (hhiValue === null || cr4 === null || brandCount < 5) return [];
  const fragmented = hhiValue < THRESHOLDS.fragmentedHhi;

  return [
    makeInsight({
      rule: 'market-structure',
      type: fragmented ? 'fragmented-market' : 'concentrated-market',
      severity: 'info',
      scope: 'market',
      title: fragmented
        ? `The market is fragmented — ${brandCount} brands, CR4 of ${formatPct(cr4, { decimals: 1 })}`
        : `The market is ${String(label).toLowerCase()} — CR4 of ${formatPct(cr4, { decimals: 1 })}`,
      subject: 'Market structure',
      signal: `${brandCount} brands compete in the current selection. The top four hold ${formatPct(cr4, { decimals: 1 })} combined, and the Herfindahl–Hirschman Index is ${Math.round(hhiValue).toLocaleString('en-IN')}.`,
      interpretation: fragmented
        ? 'A fragmented structure means no brand sets the category agenda alone, and share can move in small increments across many players.'
        : 'A concentrated structure means a small number of brands set price and promotional norms, and share moves are usually zero-sum between them.',
      implication: fragmented
        ? 'Share gains are more likely to come from many small switches than from one competitive battle, which favours reach and coverage over head-to-head positioning.'
        : 'Competitive response is fast and visible: a move by one leading brand tends to provoke a counter-move.',
      investigationQuestion: fragmented
        ? 'Is the long tail growing faster than the leaders, and if so, what is it offering that the leaders are not?'
        : 'How stable has this concentration been, and is any leading brand losing its grip on the category?',
      evidence: [
        { label: 'Brands', value: brandCount.toLocaleString('en-IN'), tone: 'neutral' },
        { label: 'CR4', value: formatPct(cr4, { decimals: 1 }), tone: 'neutral' },
        { label: 'HHI', value: Math.round(hhiValue).toLocaleString('en-IN'), tone: 'neutral' },
        { label: 'Structure', value: String(label ?? '—'), tone: 'neutral' },
      ],
      calculation: `${FORMULAS.hhi}\n${FORMULAS.cr4}\nHHI < 1,500 fragmented · 1,500–2,500 moderately concentrated · > 2,500 concentrated`,
      priority: 44,
      link: { page: 'market' },
    }),
  ];
};

/* ------------------------------------------------------------------ */
/* Rule 14 — high-growth niche                                         */
/* ------------------------------------------------------------------ */
const highGrowthNiche: Rule = ({ analysis }) => {
  if (analysis.market.growthPct === null) return [];
  const niches = analysis.molecules
    .filter(
      (m) =>
        m.name !== UNSPECIFIED &&
        m.growthPct !== null &&
        (m.sharePct ?? 0) < 6 &&
        (m.sharePct ?? 0) > 0.5 &&
        m.growthPct - (analysis.market.growthPct ?? 0) >= 10,
    )
    .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
    .slice(0, 1);

  return niches.map((molecule) =>
    makeInsight({
      rule: 'high-growth-niche',
      type: 'high-growth-niche',
      severity: 'watch',
      scope: 'category',
      title: `${molecule.name} is a small molecule growing at ${formatPct(molecule.growthPct, { signed: true })}`,
      subject: molecule.name,
      signal: `${molecule.name} holds ${formatPct(molecule.sharePct, { decimals: 2 })} of the market at ${formatValue(molecule.matValue)}, but grew ${formatPct(molecule.growthPct, { signed: true })} against market growth of ${formatPct(analysis.market.growthPct, { signed: true })}.`,
      interpretation:
        'Small, fast-growing molecules are where category shifts usually appear first. They can equally be short-lived, and one period of data cannot distinguish the two.',
      implication:
        'If the trend holds, participation becomes materially more expensive once the molecule is established.',
      investigationQuestion: `Is ${molecule.name} growing because of new clinical evidence, a guideline change, or a single company's promotional push — and does the portfolio have a route in?`,
      evidence: [
        { label: 'Molecule growth', value: formatPct(molecule.growthPct, { signed: true }), tone: 'positive' },
        { label: 'Market growth', value: formatPct(analysis.market.growthPct, { signed: true }), tone: 'neutral' },
        { label: 'Molecule share', value: formatPct(molecule.sharePct, { decimals: 2 }), tone: 'neutral' },
        { label: 'Molecule MAT', value: formatValue(molecule.matValue), tone: 'neutral' },
      ],
      calculation: `${FORMULAS.growth}\nFlagged when molecule share < 6% and growth exceeds market growth by ≥ 10 pp`,
      priority: 54,
      link: { page: 'opportunities' },
    }),
  );
};

/* ------------------------------------------------------------------ */
/* Rule 15 — data limitations surfaced as first-class findings         */
/* ------------------------------------------------------------------ */
const dataLimitations: Rule = ({ capabilities }) => {
  if (!capabilities.limitations.length) return [];
  const blocking = !capabilities.canComputeGrowth;
  return [
    makeInsight({
      rule: 'data-limitations',
      type: 'data-limitation',
      severity: blocking ? 'serious' : 'info',
      scope: 'data',
      title: blocking
        ? 'Momentum analysis is unavailable for this dataset'
        : `${capabilities.limitations.length} analytical limitation${capabilities.limitations.length === 1 ? '' : 's'} in this dataset`,
      subject: 'Dataset',
      signal: capabilities.limitations.join(' '),
      interpretation:
        'MATLens reports what a dataset can and cannot support rather than filling gaps with estimates. Every metric that depends on a missing field is withheld, not approximated.',
      implication: blocking
        ? 'Growth, share change and rank movement all require a comparable prior period. Without it, only the current-period structure of the market can be described.'
        : 'Some signals cannot fire on this dataset. Their absence is a property of the file, not evidence that nothing is happening.',
      investigationQuestion: blocking
        ? 'Can the source extract be re-run with the previous MAT period included as an additional column?'
        : 'Which of the missing dimensions could be added to the next extract at no extra cost?',
      evidence: capabilities.limitations.slice(0, 4).map((limitation, index) => ({
        label: `Limitation ${index + 1}`,
        value: limitation.length > 60 ? `${limitation.slice(0, 57)}…` : limitation,
        tone: 'neutral' as const,
      })),
      calculation: 'Derived from the column mapping: each canonical field that is absent disables the metrics that depend on it.',
      priority: blocking ? 86 : 20,
      link: { page: 'upload' },
    }),
  ];
};

const RULES: Rule[] = [
  brandVsMarket,
  shareMovement,
  rankMovement,
  competitorMomentum,
  moleculeOpportunity,
  segmentOpportunity,
  regionalOpportunity,
  regionalConcentration,
  emergingCompetitor,
  vulnerableIncumbent,
  growthCaptureGap,
  priceVolumeMix,
  highGrowthNiche,
  marketStructure,
  dataLimitations,
];

/** Runs every rule and returns findings ranked by priority, highest first. */
export function generateInsights(
  analysis: Analysis,
  focus: EntityMetrics | null,
  capabilities: Capabilities,
): Insight[] {
  sequence = 0;
  const ctx: RuleContext = { analysis, focus, capabilities };
  const insights = RULES.flatMap((rule) => {
    try {
      return rule(ctx);
    } catch {
      // A single misbehaving rule must never take down the Insight Center.
      return [];
    }
  });
  return insights.sort((a, b) => b.priority - a.priority);
}

export function opportunitiesFrom(insights: Insight[]): Insight[] {
  return insights.filter((insight) => OPPORTUNITY_TYPES.has(insight.type));
}

export function attentionFrom(insights: Insight[], limit = 3): Insight[] {
  const order: Record<string, number> = { critical: 0, serious: 1, watch: 2, positive: 3, info: 4 };
  return [...insights]
    .filter((i) => i.severity === 'critical' || i.severity === 'serious' || i.severity === 'watch')
    .sort((a, b) => order[a.severity] - order[b.severity] || b.priority - a.priority)
    .slice(0, limit);
}

/** The published rule catalogue — shown on the Methodology and Opportunity screens. */
export const RULE_CATALOGUE: Array<{ rule: string; name: string; condition: string; produces: string }> = [
  { rule: 'brand-vs-market', name: 'Brand versus market growth', condition: `|Brand growth − Market growth| ≥ ${THRESHOLDS.growthGapMaterial} pp`, produces: 'Relative underperformance, outperformance, or in-line growth' },
  { rule: 'share-movement', name: 'Market share movement', condition: `|Share change| ≥ ${THRESHOLDS.shareMoveMaterial} pp`, produces: 'Share loss or share gain' },
  { rule: 'rank-movement', name: 'Rank movement', condition: 'Current rank ≠ previous rank', produces: 'Rank loss or rank gain, and who overtook whom' },
  { rule: 'competitor-momentum', name: 'Competitor momentum', condition: `Competitor share ≥ ${THRESHOLDS.competitorMinSharePct}% and growth ≥ brand growth + ${THRESHOLDS.competitorGrowthLead} pp`, produces: 'Named competitors taking a disproportionate share of category growth' },
  { rule: 'molecule-opportunity', name: 'Molecule opportunity', condition: `Molecule growth ≥ brand growth + ${THRESHOLDS.categoryGrowthLead} pp`, produces: 'Category growing faster than the brand on its own molecule' },
  { rule: 'segment-opportunity', name: 'Segment opportunity', condition: `Fastest segment (≥ 3% of market) growth ≥ market growth + ${THRESHOLDS.categoryGrowthLead} pp`, produces: 'Where category growth is concentrated, and the portfolio’s position in it' },
  { rule: 'regional-opportunity', name: 'Regional opportunity', condition: `Fastest region growth ≥ market growth + ${THRESHOLDS.regionGrowthLead} pp`, produces: 'Growing geographies, flagged harder where the brand is under-indexed' },
  { rule: 'regional-concentration', name: 'Regional concentration', condition: `Top region > ${THRESHOLDS.concentrationMultiple}× an even split of the brand’s value`, produces: 'Concentration risk and untapped-geography headroom' },
  { rule: 'emerging-competitor', name: 'Emerging competitor', condition: `Growth ≥ ${THRESHOLDS.emergingGrowthPct}% with share between ${THRESHOLDS.emergingMinSharePct}% and ${THRESHOLDS.emergingMaxSharePct}%`, produces: 'Small brands compounding fast enough to matter later' },
  { rule: 'vulnerable-incumbent', name: 'Vulnerable incumbent', condition: `Share ≥ ${THRESHOLDS.competitorMinSharePct}% with negative growth in a growing market`, produces: 'Business in play, and roughly how much of it' },
  { rule: 'growth-capture', name: 'Growth capture gap', condition: '|Share of market growth − share of market| ≥ 1 pp', produces: 'Whether the brand is capturing its proportional part of category growth' },
  { rule: 'price-volume-mix', name: 'Value versus volume', condition: `|Value growth − Unit growth| ≥ ${THRESHOLDS.priceMixGap} pp`, produces: 'Whether growth is price-led or volume-led' },
  { rule: 'high-growth-niche', name: 'High-growth niche', condition: 'Molecule share < 6% and growth ≥ market growth + 10 pp', produces: 'Small molecules shifting faster than the category' },
  { rule: 'market-structure', name: 'Market structure', condition: 'At least 5 brands in scope', produces: 'Fragmented / moderately concentrated / concentrated, with CR4 and HHI' },
  { rule: 'data-limitations', name: 'Data limitations', condition: 'Any canonical field missing from the mapping', produces: 'What cannot be calculated on this file, and why' },
];
