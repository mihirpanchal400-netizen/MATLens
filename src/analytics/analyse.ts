import type {
  Analysis,
  EntityKind,
  EntityMetrics,
  Filters,
  MarketMetrics,
  NormalizedRow,
} from '../types';
import {
  concentrationLabel,
  concentrationRatio,
  growthContributionPct,
  growthPct,
  hhi,
  rankChange,
  sharePct,
  shareChangePp,
  sumOrNull,
} from './metrics';

export const UNSPECIFIED = 'Unspecified';

/** Restricts the dataset to the current filter selection. Nulls never match a filter. */
export function applyFilters(rows: NormalizedRow[], filters: Filters): NormalizedRow[] {
  return rows.filter((row) => {
    if (filters.therapy && (row.therapy ?? UNSPECIFIED) !== filters.therapy) return false;
    if (filters.segment && (row.segment ?? UNSPECIFIED) !== filters.segment) return false;
    if (filters.molecule && (row.molecule ?? UNSPECIFIED) !== filters.molecule) return false;
    if (filters.company && (row.company ?? UNSPECIFIED) !== filters.company) return false;
    if (filters.region && (row.region ?? UNSPECIFIED) !== filters.region) return false;
    return true;
  });
}

export function distinctValues(rows: NormalizedRow[], key: keyof NormalizedRow): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

interface Accumulator {
  name: string;
  current: number;
  previous: number;
  hasPrevious: boolean;
  units: number;
  hasUnits: boolean;
  prevUnits: number;
  hasPrevUnits: boolean;
  rowCount: number;
  attributes: {
    company: Map<string, number>;
    molecule: Map<string, number>;
    segment: Map<string, number>;
    therapy: Map<string, number>;
    region: Map<string, number>;
  };
}

function bump(map: Map<string, number>, key: string | null, weight: number) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}

/** The attribute carrying the most value — a brand may straddle segments in a real extract. */
function dominant(map: Map<string, number>): string | null {
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const [key, value] of map) {
    if (value > bestValue) {
      best = key;
      bestValue = value;
    }
  }
  return best;
}

function groupBy(rows: NormalizedRow[], key: keyof NormalizedRow): Map<string, Accumulator> {
  const groups = new Map<string, Accumulator>();
  for (const row of rows) {
    const rawName = row[key];
    const name = typeof rawName === 'string' && rawName.trim() ? rawName : UNSPECIFIED;
    let acc = groups.get(name);
    if (!acc) {
      acc = {
        name,
        current: 0,
        previous: 0,
        hasPrevious: false,
        units: 0,
        hasUnits: false,
        prevUnits: 0,
        hasPrevUnits: false,
        rowCount: 0,
        attributes: {
          company: new Map(),
          molecule: new Map(),
          segment: new Map(),
          therapy: new Map(),
          region: new Map(),
        },
      };
      groups.set(name, acc);
    }
    const value = row.matValue ?? 0;
    acc.current += value;
    acc.rowCount += 1;
    if (row.prevMatValue !== null) {
      acc.previous += row.prevMatValue;
      acc.hasPrevious = true;
    }
    if (row.matUnits !== null) {
      acc.units += row.matUnits;
      acc.hasUnits = true;
    }
    if (row.prevMatUnits !== null) {
      acc.prevUnits += row.prevMatUnits;
      acc.hasPrevUnits = true;
    }
    bump(acc.attributes.company, row.company, value);
    bump(acc.attributes.molecule, row.molecule, value);
    bump(acc.attributes.segment, row.segment, value);
    bump(acc.attributes.therapy, row.therapy, value);
    bump(acc.attributes.region, row.region, value);
  }
  return groups;
}

function toMetrics(
  acc: Accumulator,
  kind: EntityKind,
  totals: { current: number; previous: number | null; absoluteChange: number | null },
): EntityMetrics {
  const previous = acc.hasPrevious ? acc.previous : null;
  const share = sharePct(acc.current, totals.current);
  const prevShare = previous !== null && totals.previous !== null ? sharePct(previous, totals.previous) : null;
  const absoluteChange = previous !== null ? acc.current - previous : null;

  const regionTotal = [...acc.attributes.region.values()].reduce((a, b) => a + b, 0);
  const topRegion = dominant(acc.attributes.region);
  const topRegionShare =
    topRegion && regionTotal > 0 ? ((acc.attributes.region.get(topRegion) ?? 0) / regionTotal) * 100 : null;

  return {
    key: `${kind}:${acc.name}`,
    name: acc.name,
    kind,
    matValue: acc.current,
    prevMatValue: previous,
    absoluteChange,
    growthPct: growthPct(acc.current, previous),
    matUnits: acc.hasUnits ? acc.units : null,
    prevMatUnits: acc.hasPrevUnits ? acc.prevUnits : null,
    unitGrowthPct: acc.hasUnits && acc.hasPrevUnits ? growthPct(acc.units, acc.prevUnits) : null,
    sharePct: share,
    prevSharePct: prevShare,
    shareChangePp: shareChangePp(share, prevShare),
    rank: null,
    prevRank: null,
    rankChange: null,
    growthContributionPct: growthContributionPct(absoluteChange, totals.absoluteChange),
    rowCount: acc.rowCount,
    company: kind === 'brand' ? dominant(acc.attributes.company) : null,
    molecule: kind === 'brand' ? dominant(acc.attributes.molecule) : null,
    segment: kind === 'brand' ? dominant(acc.attributes.segment) : null,
    therapy: kind === 'brand' ? dominant(acc.attributes.therapy) : null,
    topRegion,
    topRegionSharePct: topRegionShare,
  };
}

/** Ranks by current value, and by previous value where the history exists. */
function applyRanks(entities: EntityMetrics[]): EntityMetrics[] {
  const byCurrent = [...entities].sort((a, b) => b.matValue - a.matValue);
  byCurrent.forEach((entity, index) => {
    entity.rank = index + 1;
  });

  const withPrevious = entities.filter((e) => e.prevMatValue !== null);
  if (withPrevious.length === entities.length && entities.length > 0) {
    const byPrevious = [...entities].sort((a, b) => (b.prevMatValue ?? 0) - (a.prevMatValue ?? 0));
    byPrevious.forEach((entity, index) => {
      entity.prevRank = index + 1;
    });
    entities.forEach((entity) => {
      entity.rankChange = rankChange(entity.rank, entity.prevRank);
    });
  }

  return byCurrent;
}

function buildEntities(
  rows: NormalizedRow[],
  key: keyof NormalizedRow,
  kind: EntityKind,
  totals: { current: number; previous: number | null; absoluteChange: number | null },
): EntityMetrics[] {
  const groups = groupBy(rows, key);
  const entities = [...groups.values()].map((acc) => toMetrics(acc, kind, totals));
  return applyRanks(entities);
}

/**
 * The single analytical pass. Every screen reads from the object this returns,
 * so the same number can never differ between two views.
 */
export function analyse(rows: NormalizedRow[]): Analysis {
  const totalValue = rows.reduce((sum, row) => sum + (row.matValue ?? 0), 0);
  const previousValues = rows.map((row) => row.prevMatValue);
  const hasPrevious = previousValues.some((v) => v !== null);
  const totalPrevValue = hasPrevious ? sumOrNull(previousValues) : null;
  const absoluteChange = totalPrevValue !== null ? totalValue - totalPrevValue : null;
  const totals = { current: totalValue, previous: totalPrevValue, absoluteChange };

  const brands = buildEntities(rows, 'brand', 'brand', totals);
  const companies = buildEntities(rows, 'company', 'company', totals);
  const molecules = buildEntities(rows, 'molecule', 'molecule', totals);
  const segments = buildEntities(rows, 'segment', 'segment', totals);
  const therapies = buildEntities(rows, 'therapy', 'therapy', totals);
  const regions = buildEntities(rows, 'region', 'region', totals);

  const brandShares = brands.map((b) => b.sharePct ?? 0).sort((a, b) => b - a);
  const hhiValue = hhi(brandShares);

  const totalUnits = sumOrNull(rows.map((r) => r.matUnits));
  const totalPrevUnits = sumOrNull(rows.map((r) => r.prevMatUnits));

  const market: MarketMetrics = {
    totalValue,
    totalPrevValue,
    absoluteChange,
    growthPct: growthPct(totalValue, totalPrevValue),
    totalUnits,
    totalPrevUnits,
    unitGrowthPct: growthPct(totalUnits, totalPrevUnits),
    brandCount: brands.length,
    companyCount: companies.filter((c) => c.name !== UNSPECIFIED).length,
    moleculeCount: molecules.filter((m) => m.name !== UNSPECIFIED).length,
    segmentCount: segments.filter((s) => s.name !== UNSPECIFIED).length,
    regionCount: regions.filter((r) => r.name !== UNSPECIFIED).length,
    cr4: concentrationRatio(brandShares, 4),
    hhi: hhiValue,
    concentrationLabel: concentrationLabel(hhiValue),
  };

  const brandRegionValue = new Map<string, Map<string, { current: number; previous: number | null }>>();
  for (const row of rows) {
    const region = row.region ?? UNSPECIFIED;
    let regionMap = brandRegionValue.get(row.brand);
    if (!regionMap) {
      regionMap = new Map();
      brandRegionValue.set(row.brand, regionMap);
    }
    const entry = regionMap.get(region) ?? { current: 0, previous: null as number | null };
    entry.current += row.matValue ?? 0;
    if (row.prevMatValue !== null) entry.previous = (entry.previous ?? 0) + row.prevMatValue;
    regionMap.set(region, entry);
  }

  return {
    market,
    brands,
    companies,
    molecules,
    segments,
    therapies,
    regions,
    brandRegionValue,
    rowsAnalysed: rows.length,
  };
}

export function findBrand(analysis: Analysis, name: string | null): EntityMetrics | null {
  if (!name) return null;
  return analysis.brands.find((b) => b.name === name) ?? null;
}

/** Competitors sharing the focus brand's segment, largest first. */
export function competitorsOf(analysis: Analysis, brand: EntityMetrics | null, limit = 12): EntityMetrics[] {
  if (!brand) return [];
  const sameSegment = analysis.brands.filter((b) => b.name !== brand.name && b.segment && b.segment === brand.segment);
  const pool = sameSegment.length >= 3 ? sameSegment : analysis.brands.filter((b) => b.name !== brand.name);
  return pool.slice(0, limit);
}
