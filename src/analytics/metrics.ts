/**
 * Deterministic metric primitives.
 *
 * Every number MATLens shows comes from one of these functions. They are pure,
 * total (they return null rather than Infinity or NaN), and each one is mirrored
 * by a plain-English formula in `FORMULAS` that the UI can display, so a Brand
 * Manager can always check the arithmetic.
 */

/** Growth % = (Current − Previous) ÷ Previous × 100. Undefined against a non-positive base. */
export function growthPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Market share % = Part ÷ Total × 100. */
export function sharePct(part: number | null, total: number | null): number | null {
  if (part === null || total === null || !Number.isFinite(part) || !Number.isFinite(total)) return null;
  if (total <= 0) return null;
  return (part / total) * 100;
}

/** Share change in percentage points = Current share − Previous share. */
export function shareChangePp(currentShare: number | null, previousShare: number | null): number | null {
  if (currentShare === null || previousShare === null) return null;
  return currentShare - previousShare;
}

/** Growth gap in percentage points = Entity growth − Reference growth. */
export function growthGapPp(entityGrowth: number | null, referenceGrowth: number | null): number | null {
  if (entityGrowth === null || referenceGrowth === null) return null;
  return entityGrowth - referenceGrowth;
}

/** Rank change: positive means the entity moved up the table (e.g. #4 → #2 = +2). */
export function rankChange(currentRank: number | null, previousRank: number | null): number | null {
  if (currentRank === null || previousRank === null) return null;
  return previousRank - currentRank;
}

/**
 * Contribution to market growth % = Entity absolute change ÷ Market absolute change × 100.
 * Only meaningful when the market itself grew; a contribution against a shrinking
 * market inverts sign and misleads, so it is withheld.
 */
export function growthContributionPct(
  entityAbsoluteChange: number | null,
  marketAbsoluteChange: number | null,
): number | null {
  if (entityAbsoluteChange === null || marketAbsoluteChange === null) return null;
  if (marketAbsoluteChange <= 0) return null;
  return (entityAbsoluteChange / marketAbsoluteChange) * 100;
}

/** Herfindahl–Hirschman Index over market shares expressed in percent (0–10,000). */
export function hhi(sharesPct: number[]): number | null {
  if (!sharesPct.length) return null;
  return sharesPct.reduce((sum, s) => sum + s * s, 0);
}

/** Combined share of the top N entities. */
export function concentrationRatio(sharesPctDescending: number[], n: number): number | null {
  if (sharesPctDescending.length < n) return null;
  return sharesPctDescending.slice(0, n).reduce((a, b) => a + b, 0);
}

/** Plain-language label for an HHI value, using the conventional competition bands. */
export function concentrationLabel(hhiValue: number | null): string | null {
  if (hhiValue === null) return null;
  if (hhiValue < 1500) return 'Fragmented';
  if (hhiValue < 2500) return 'Moderately concentrated';
  return 'Concentrated';
}

/** Sums a numeric field, returning null only when no row carried a value at all. */
export function sumOrNull(values: Array<number | null>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

/** The formula strings the UI shows under "How was this calculated?". */
export const FORMULAS = {
  growth: 'Growth % = (Current MAT − Previous MAT) ÷ Previous MAT × 100',
  share: 'Market Share % = Brand MAT Value ÷ Total Market MAT Value × 100',
  shareChange: 'Share Change (pp) = Current Market Share % − Previous Market Share %',
  previousShare: 'Previous Share % = Previous Brand MAT ÷ Previous Total Market MAT × 100',
  growthGap: 'Growth Gap (pp) = Brand Growth % − Market Growth %',
  rank: 'Rank = position of the brand when all brands are ordered by MAT Value, highest first',
  rankChange: 'Rank Change = Previous Rank − Current Rank  (positive = moved up)',
  contribution: 'Contribution to Market Growth % = Brand absolute change ÷ Market absolute change × 100',
  unitGrowth: 'Unit Growth % = (Current MAT Units − Previous MAT Units) ÷ Previous MAT Units × 100',
  priceMix: 'Price / Mix effect (pp) ≈ Value Growth % − Unit Growth %',
  hhi: 'HHI = Σ (brand share %)² across all brands in the selection',
  cr4: 'CR4 = combined market share % of the four largest brands',
  concentration: 'Regional concentration % = Brand value in its largest region ÷ Brand total value × 100',
} as const;
