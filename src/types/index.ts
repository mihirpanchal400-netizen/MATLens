/**
 * MATLens domain types.
 *
 * The pipeline is deliberately linear and inspectable:
 *   RawTable -> ColumnMapping[] -> NormalizedRow[] -> Analysis -> Insight[]
 * Every downstream artefact can be traced back to the raw column it came from.
 */

/** Canonical fields MATLens understands. Everything else is carried as extra. */
export type FieldKey =
  | 'brand'
  | 'company'
  | 'molecule'
  | 'therapy'
  | 'segment'
  | 'region'
  | 'period'
  | 'matValue'
  | 'prevMatValue'
  | 'matUnits'
  | 'prevMatUnits'
  | 'growthPct'
  | 'marketSharePct'
  | 'rank';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface FieldDefinition {
  key: FieldKey;
  label: string;
  kind: 'dimension' | 'measure' | 'meta';
  /** Required for any analysis at all. */
  essential?: boolean;
  description: string;
}

export interface ColumnMapping {
  sourceColumn: string;
  field: FieldKey | null;
  confidence: Confidence;
  /** Why the mapper chose this — shown in the UI so mapping is never a black box. */
  reason: string;
  sampleValues: string[];
  /** True when a human overrode the automatic suggestion. */
  overridden?: boolean;
  /** Alternative candidates, best first — offered in the correction dropdown. */
  alternatives?: FieldKey[];
}

export interface RawTable {
  fileName: string;
  sheetName?: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface NormalizedRow {
  id: number;
  brand: string;
  company: string | null;
  molecule: string | null;
  therapy: string | null;
  segment: string | null;
  region: string | null;
  matValue: number | null;
  prevMatValue: number | null;
  matUnits: number | null;
  prevMatUnits: number | null;
  /** Growth as supplied in the file (percent). MATLens recomputes its own. */
  reportedGrowthPct: number | null;
  reportedSharePct: number | null;
  reportedRank: number | null;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface DataIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
  affectedRows: number;
  /** Row indices (1-based, as in the source file) for the first few offenders. */
  examples: number[];
}

export interface DataHealth {
  totalRows: number;
  usableRows: number;
  droppedRows: number;
  duplicateRows: number;
  emptyColumns: string[];
  issues: DataIssue[];
  checksPassed: string[];
}

/** What the dataset can and cannot support analytically. */
export interface Capabilities {
  hasValue: boolean;
  hasPreviousValue: boolean;
  previousValueDerivedFromGrowth: boolean;
  hasUnits: boolean;
  hasPreviousUnits: boolean;
  hasCompany: boolean;
  hasMolecule: boolean;
  hasSegment: boolean;
  hasTherapy: boolean;
  hasRegion: boolean;
  canComputeGrowth: boolean;
  canComputeShare: boolean;
  canComputeShareChange: boolean;
  canComputeRankChange: boolean;
  /** Human-readable notes about what is unavailable and why. */
  limitations: string[];
}

export interface Dataset {
  id: string;
  fileName: string;
  loadedAt: number;
  isSynthetic: boolean;
  /** e.g. "MAT Aug 2026" — read from the file where present. */
  period: string | null;
  valueUnitLabel: string;
  raw: RawTable;
  mappings: ColumnMapping[];
  rows: NormalizedRow[];
  health: DataHealth;
  capabilities: Capabilities;
  defaultFocusBrand: string | null;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export type EntityKind = 'brand' | 'company' | 'molecule' | 'segment' | 'therapy' | 'region';

export interface EntityMetrics {
  key: string;
  name: string;
  kind: EntityKind;
  matValue: number;
  prevMatValue: number | null;
  absoluteChange: number | null;
  growthPct: number | null;
  matUnits: number | null;
  prevMatUnits: number | null;
  unitGrowthPct: number | null;
  sharePct: number | null;
  prevSharePct: number | null;
  shareChangePp: number | null;
  rank: number | null;
  prevRank: number | null;
  /** Positive = moved up the table. */
  rankChange: number | null;
  /** Share of the market's absolute growth contributed by this entity (%). */
  growthContributionPct: number | null;
  rowCount: number;
  /** Dominant attributes, for brands. */
  company: string | null;
  molecule: string | null;
  segment: string | null;
  therapy: string | null;
  /** Regional concentration of a brand: share of its value in its top region (%). */
  topRegionSharePct?: number | null;
  topRegion?: string | null;
}

export interface MarketMetrics {
  totalValue: number;
  totalPrevValue: number | null;
  absoluteChange: number | null;
  growthPct: number | null;
  totalUnits: number | null;
  totalPrevUnits: number | null;
  unitGrowthPct: number | null;
  brandCount: number;
  companyCount: number;
  moleculeCount: number;
  segmentCount: number;
  regionCount: number;
  /** Combined share of the top 4 brands (%). */
  cr4: number | null;
  /** Herfindahl–Hirschman Index on brand shares (0–10,000). */
  hhi: number | null;
  concentrationLabel: string | null;
}

export interface Analysis {
  market: MarketMetrics;
  brands: EntityMetrics[];
  companies: EntityMetrics[];
  molecules: EntityMetrics[];
  segments: EntityMetrics[];
  therapies: EntityMetrics[];
  regions: EntityMetrics[];
  /** brand -> region -> value, for regional concentration analysis. */
  brandRegionValue: Map<string, Map<string, { current: number; previous: number | null }>>;
  rowsAnalysed: number;
}

/* ------------------------------------------------------------------ */
/* Insight engine                                                      */
/* ------------------------------------------------------------------ */

export type InsightSeverity = 'critical' | 'serious' | 'watch' | 'positive' | 'info';

export type InsightScope = 'brand' | 'market' | 'competitor' | 'category' | 'region' | 'data';

export interface EvidenceItem {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

export interface Insight {
  id: string;
  /** Rule identifier — stable, so a signal can be traced to the rule that fired. */
  rule: string;
  type: string;
  severity: InsightSeverity;
  scope: InsightScope;
  title: string;
  subject: string;
  /** What the data shows. Observed / derived only — no interpretation. */
  signal: string;
  /** What the metric could mean. Hedged language only. */
  interpretation: string;
  /** Why a Brand Manager should care. */
  implication: string;
  /** The next question, not an answer. */
  investigationQuestion: string;
  evidence: EvidenceItem[];
  calculation: string;
  /** Higher = surfaced earlier. */
  priority: number;
  link?: { page: PageId; brand?: string };
}

export type PageId =
  | 'overview'
  | 'market'
  | 'brand'
  | 'competitors'
  | 'opportunities'
  | 'insights'
  | 'explorer'
  | 'upload'
  | 'methodology';

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export interface Filters {
  therapy: string | null;
  segment: string | null;
  molecule: string | null;
  company: string | null;
  region: string | null;
}

export const EMPTY_FILTERS: Filters = {
  therapy: null,
  segment: null,
  molecule: null,
  company: null,
  region: null,
};
