import type {
  Capabilities,
  ColumnMapping,
  DataHealth,
  DataIssue,
  Dataset,
  FieldKey,
  NormalizedRow,
  RawTable,
} from '../types';
import { mappedColumnFor, parseNumeric } from './columnMapper';

const MAX_EXAMPLES = 5;

/**
 * Market extracts are not always denominated in rupees. A PharmaTrac-style IPM
 * basefile is commonly in crores; other exports use thousands or lakhs. Reading
 * crores as rupees understates a market by seven orders of magnitude, so the
 * unit is an explicit, user-visible setting rather than an assumption.
 */
export const VALUE_SCALES: Array<{ scale: number; label: string; short: string }> = [
  { scale: 1, label: 'Rupees (₹)', short: '₹' },
  { scale: 1e3, label: "Thousands (₹ '000)", short: "₹ '000" },
  { scale: 1e5, label: 'Lakhs (₹ Lakh)', short: '₹ L' },
  { scale: 1e7, label: 'Crores (₹ Cr)', short: '₹ Cr' },
];

export function valueScaleLabel(scale: number): string {
  return VALUE_SCALES.find((s) => s.scale === scale)?.label ?? 'Rupees (₹)';
}

/**
 * A pharmaceutical market — even a single therapy area — sits well above ₹10 Cr.
 * A total below that means the value column is almost certainly not in rupees.
 *
 * MATLens deliberately does not guess *which* unit it is: thousands, lakhs and
 * crores are each plausible for a given file, and picking wrongly misstates
 * every figure. It flags the uncertainty and shows the user the total under each
 * option instead, which makes the right answer obvious to anyone who knows the
 * market.
 */
const PLAUSIBLE_MARKET_FLOOR = 10 * 1e7;

function valueUnitLooksWrong(totalInRupees: number): boolean {
  return totalInRupees > 0 && totalInRupees < PLAUSIBLE_MARKET_FLOOR;
}

interface IssueBucket {
  severity: DataIssue['severity'];
  title: string;
  detail: string;
  rows: number[];
  /** Set when the count is known up front and is not one-entry-per-row. */
  count?: number;
}

class IssueCollector {
  private buckets = new Map<string, IssueBucket>();

  add(id: string, severity: DataIssue['severity'], title: string, detail: string, rowNumber: number) {
    const bucket = this.buckets.get(id) ?? { severity, title, detail, rows: [] };
    bucket.rows.push(rowNumber);
    this.buckets.set(id, bucket);
  }

  /** Records a dataset-level finding whose count is already known. */
  addSummary(id: string, severity: DataIssue['severity'], title: string, detail: string, count: number) {
    this.buckets.set(id, { severity, title, detail, rows: [], count });
  }

  toIssues(): DataIssue[] {
    return [...this.buckets.entries()]
      .map(([id, b]) => ({
        id,
        severity: b.severity,
        title: b.title,
        detail: b.detail,
        affectedRows: b.count ?? b.rows.length,
        examples: b.rows.slice(0, MAX_EXAMPLES),
      }))
      .sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2 } as const;
        return order[a.severity] - order[b.severity] || b.affectedRows - a.affectedRows;
      });
  }
}

function cellText(row: Record<string, unknown>, column: string | null): string | null {
  if (!column) return null;
  const value = row[column];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^(na|n\/a|null|nil|-|—)$/i.test(text)) return null;
  return text;
}

/**
 * Turns a raw table plus a column mapping into validated, analysis-ready rows.
 *
 * Rules of the house:
 *  - Nothing is invented. A value that cannot be parsed becomes null and is reported.
 *  - A row without a brand or without a current MAT value cannot be analysed, so it
 *    is dropped — loudly, never silently.
 *  - Previous-period value may be *derived* from a reported growth rate, and when it
 *    is, the dataset says so.
 */
export function buildDataset(params: {
  raw: RawTable;
  mappings: ColumnMapping[];
  isSynthetic?: boolean;
  defaultFocusBrand?: string | null;
  notes?: string[];
  /** Multiplier converting the file's value column into rupees. */
  valueScale?: number;
}): Dataset {
  const { raw, mappings, isSynthetic = false, valueScale = 1 } = params;
  const col = (field: FieldKey) => mappedColumnFor(mappings, field);

  const brandCol = col('brand');
  const companyCol = col('company');
  const moleculeCol = col('molecule');
  const therapyCol = col('therapy');
  const segmentCol = col('segment');
  const regionCol = col('region');
  const periodCol = col('period');
  const valueCol = col('matValue');
  const prevValueCol = col('prevMatValue');
  const unitsCol = col('matUnits');
  const prevUnitsCol = col('prevMatUnits');
  const growthCol = col('growthPct');
  const shareCol = col('marketSharePct');
  const rankCol = col('rank');

  const issues = new IssueCollector();
  const rows: NormalizedRow[] = [];
  const seen = new Map<string, number>();
  const grainKeys = new Set<string>();
  let duplicateRows = 0;
  let derivedPrevCount = 0;
  const periods = new Set<string>();

  raw.rows.forEach((raws, index) => {
    const rowNumber = index + 2; // +1 for zero-index, +1 for the header line

    const brand = cellText(raws, brandCol);
    if (!brand) {
      issues.add(
        'missing-brand',
        'error',
        'Rows without a brand name',
        'A row with no brand cannot be attributed to a competitor and is excluded from analysis.',
        rowNumber,
      );
      return;
    }

    const rawValue = valueCol ? raws[valueCol] : null;
    const matValue = parseNumeric(rawValue);
    if (matValue === null) {
      const hadText = rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '';
      issues.add(
        hadText ? 'invalid-value' : 'missing-value',
        'error',
        hadText ? 'Non-numeric MAT value' : 'Rows without a MAT value',
        hadText
          ? 'The MAT value column contained text that could not be read as a number. These rows are excluded rather than guessed.'
          : 'MAT value is blank. Without a current value the row cannot contribute to market size, share or growth.',
        rowNumber,
      );
      return;
    }
    if (matValue < 0) {
      issues.add(
        'negative-value',
        'warning',
        'Negative MAT value',
        'Negative sales values usually indicate returns or corrections. They are retained but will pull totals down.',
        rowNumber,
      );
    }

    let prevMatValue = prevValueCol ? parseNumeric(raws[prevValueCol]) : null;
    const reportedGrowthPct = growthCol ? parseNumeric(raws[growthCol]) : null;

    if (prevMatValue === null && reportedGrowthPct !== null && reportedGrowthPct > -100) {
      prevMatValue = matValue / (1 + reportedGrowthPct / 100);
      derivedPrevCount += 1;
    }
    if (prevMatValue !== null && prevMatValue <= 0) {
      // Growth against a zero or negative base is undefined, not infinite.
      issues.add(
        'zero-base',
        'warning',
        'Previous-period value is zero or negative',
        'Growth cannot be calculated against a zero or negative base, so growth is left blank for these rows.',
        rowNumber,
      );
      prevMatValue = null;
    }

    const reportedSharePct = shareCol ? parseNumeric(raws[shareCol]) : null;
    if (reportedSharePct !== null && (reportedSharePct < 0 || reportedSharePct > 100)) {
      issues.add(
        'impossible-share',
        'warning',
        'Market share outside 0–100%',
        'Reported share values fall outside a possible range. MATLens recomputes share from values, so analysis is unaffected.',
        rowNumber,
      );
    }

    // A duplicate is a row identical across *every* source column. Rows that
    // differ only in an unmapped column — SKU, pack, strength — are a finer
    // grain, not a defect, and are counted separately below.
    const key = raw.columns.map((column) => String(raws[column] ?? '').trim().toLowerCase()).join('');
    const previousRow = seen.get(key);
    if (previousRow !== undefined) {
      duplicateRows += 1;
      issues.add(
        'duplicate-row',
        'warning',
        'Identical rows repeated in the file',
        `These rows match an earlier row in every column, so their values are counted twice in every total. The first occurrence of each is at file row ${previousRow}.`,
        rowNumber,
      );
    } else {
      seen.set(key, rowNumber);
    }

    const grainKey = [
      brand.toLowerCase(),
      (cellText(raws, companyCol) ?? '').toLowerCase(),
      (cellText(raws, regionCol) ?? '').toLowerCase(),
      (cellText(raws, segmentCol) ?? '').toLowerCase(),
      (cellText(raws, moleculeCol) ?? '').toLowerCase(),
    ].join('');
    grainKeys.add(grainKey);

    const period = cellText(raws, periodCol);
    if (period) periods.add(period);

    rows.push({
      id: index,
      brand,
      company: cellText(raws, companyCol),
      molecule: cellText(raws, moleculeCol),
      therapy: cellText(raws, therapyCol),
      segment: cellText(raws, segmentCol),
      region: cellText(raws, regionCol),
      matValue: matValue * valueScale,
      prevMatValue: prevMatValue === null ? null : prevMatValue * valueScale,
      matUnits: unitsCol ? parseNumeric(raws[unitsCol]) : null,
      prevMatUnits: prevUnitsCol ? parseNumeric(raws[prevUnitsCol]) : null,
      reportedGrowthPct,
      reportedSharePct,
      reportedRank: rankCol ? parseNumeric(raws[rankCol]) : null,
    });
  });

  // Row grain finer than brand (SKU- or pack-level extracts) is normal, not a
  // defect — but the user should know their rows are being summed.
  if (rows.length > grainKeys.size && grainKeys.size > 0) {
    issues.addSummary(
      'finer-grain',
      'info',
      'Rows are finer-grained than brand',
      `${rows.length.toLocaleString('en-IN')} rows describe ${grainKeys.size.toLocaleString('en-IN')} brand and dimension combinations — typical of a SKU- or pack-level extract. MATLens sums them to brand level, which is the intended behaviour.`,
      rows.length - grainKeys.size,
    );
  }

  // Dimension completeness — a warning, never a blocker.
  const dimensionChecks: Array<[FieldKey, string | null, keyof NormalizedRow]> = [
    ['company', companyCol, 'company'],
    ['molecule', moleculeCol, 'molecule'],
    ['region', regionCol, 'region'],
    ['segment', segmentCol, 'segment'],
  ];
  for (const [field, column, prop] of dimensionChecks) {
    if (!column) continue;
    const blanks = rows.filter((r) => !r[prop]).length;
    if (blanks > 0) {
      issues.addSummary(
        `missing-${field}`,
        'warning',
        `Blank ${field} values`,
        `These rows are grouped as "Unspecified" in ${field} breakdowns rather than dropped.`,
        blanks,
      );
    }
  }

  const totalValue = rows.reduce((sum, row) => sum + (row.matValue ?? 0), 0);
  const unitUncertain = valueUnitLooksWrong(totalValue);
  if (unitUncertain) {
    issues.addSummary(
      'value-unit',
      'warning',
      'The value column may not be in rupees',
      `Adding up every row gives ${(totalValue / 1e7).toFixed(2)} Cr at the current unit setting, which is small for a pharmaceutical market. Market audits are often denominated in thousands, lakhs or crores. Set the value unit on this screen — growth, share and rank are ratios and will not change.`,
      rows.length,
    );
  }

  const emptyColumns = raw.columns.filter((c) =>
    raw.rows.every((r) => r[c] === null || r[c] === undefined || String(r[c]).trim() === ''),
  );
  if (emptyColumns.length) {
    issues.addSummary(
      'empty-columns',
      'info',
      'Empty columns detected',
      `${emptyColumns.length} column(s) contain no data at all: ${emptyColumns.slice(0, 6).join(', ')}.`,
      0,
    );
  }

  const rowsWithPrev = rows.filter((r) => r.prevMatValue !== null && r.prevMatValue > 0).length;
  const rowsWithUnits = rows.filter((r) => r.matUnits !== null).length;
  const rowsWithPrevUnits = rows.filter((r) => r.prevMatUnits !== null).length;

  const capabilities: Capabilities = {
    hasValue: rows.length > 0,
    hasPreviousValue: rowsWithPrev > 0,
    previousValueDerivedFromGrowth: derivedPrevCount > 0 && !prevValueCol,
    hasUnits: rowsWithUnits > 0,
    hasPreviousUnits: rowsWithPrevUnits > 0,
    hasCompany: rows.some((r) => r.company),
    hasMolecule: rows.some((r) => r.molecule),
    hasSegment: rows.some((r) => r.segment),
    hasTherapy: rows.some((r) => r.therapy),
    hasRegion: rows.some((r) => r.region),
    canComputeGrowth: rowsWithPrev > 0,
    canComputeShare: rows.length > 0,
    canComputeShareChange: rowsWithPrev > 0,
    canComputeRankChange: rowsWithPrev > 0,
    limitations: [],
  };

  if (!capabilities.hasPreviousValue) {
    capabilities.limitations.push(
      'No previous-period MAT value was found, and none could be derived from a growth column. Growth, share change, rank change and every signal that depends on momentum are unavailable for this dataset.',
    );
  }
  if (capabilities.previousValueDerivedFromGrowth) {
    capabilities.limitations.push(
      'Previous-period values were derived from the reported growth column: Previous = Current ÷ (1 + Growth ÷ 100). They are reconstructions, not observed figures.',
    );
  }
  if (!capabilities.hasCompany) capabilities.limitations.push('No company column was identified, so corporate-level competitor analysis is unavailable.');
  if (!capabilities.hasMolecule) capabilities.limitations.push('No molecule column was identified, so molecule growth comparisons are unavailable.');
  if (!capabilities.hasRegion) capabilities.limitations.push('No region column was identified, so regional signals are unavailable.');
  if (!capabilities.hasSegment) capabilities.limitations.push('No segment column was identified, so segment growth comparisons are unavailable.');
  if (!capabilities.hasUnits) capabilities.limitations.push('No unit sales column was identified, so price/volume mix cannot be separated from value growth.');

  const checksPassed: string[] = [];
  if (rows.length) checksPassed.push(`${rows.length.toLocaleString('en-IN')} usable records built`);
  checksPassed.push('Numeric fields parsed and range-checked');
  if (!duplicateRows) checksPassed.push('No duplicate brand / dimension combinations detected');
  if (capabilities.canComputeGrowth) checksPassed.push('Previous-period values available — growth analysis enabled');
  if (capabilities.hasRegion) checksPassed.push('Regional dimension available');

  const health: DataHealth = {
    totalRows: raw.rows.length,
    usableRows: rows.length,
    droppedRows: raw.rows.length - rows.length,
    duplicateRows,
    emptyColumns,
    issues: issues.toIssues(),
    checksPassed,
  };

  const notes = [...(params.notes ?? [])];
  if (derivedPrevCount > 0) {
    notes.push(
      `Previous MAT value was reconstructed from the reported growth column for ${derivedPrevCount.toLocaleString('en-IN')} row(s).`,
    );
  }

  const defaultFocusBrand =
    params.defaultFocusBrand ?? pickDefaultFocusBrand(rows);

  return {
    id: `${Date.now()}`,
    fileName: raw.fileName,
    loadedAt: Date.now(),
    isSynthetic,
    period: periods.size === 1 ? [...periods][0] : periods.size > 1 ? `${periods.size} periods in file` : null,
    valueScale,
    valueScaleLabel: valueScaleLabel(valueScale),
    valueUnitUncertain: unitUncertain,
    raw,
    mappings,
    rows,
    health,
    capabilities,
    defaultFocusBrand,
    notes,
  };
}

/** Without an explicit choice, the largest brand is the most useful starting point. */
function pickDefaultFocusBrand(rows: NormalizedRow[]): string | null {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.brand, (totals.get(row.brand) ?? 0) + (row.matValue ?? 0));
  }
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const [brand, value] of totals) {
    if (value > bestValue) {
      best = brand;
      bestValue = value;
    }
  }
  return best;
}
