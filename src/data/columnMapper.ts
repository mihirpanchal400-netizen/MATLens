import type { ColumnMapping, Confidence, FieldKey, RawTable } from '../types';
import { FIELD_PATTERNS } from './fields';

/** Lower-cases and strips everything that is not a letter or digit. */
export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Loose token split of a header: `MAT_Value (INR)` -> ["mat","value","inr"]. */
function tokens(header: string): string[] {
  return header
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const NUMERIC_RE = /^-?\(?\s*[₹$€£]?\s*-?[\d,]*\.?\d+\s*\)?%?$/;

/** Parses a spreadsheet cell into a number, tolerating ₹, commas, %, and (123) negatives. */
export function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text || text === '-' || text === '—' || /^(na|n\/a|null|nil|#n\/a)$/i.test(text)) return null;
  if (!NUMERIC_RE.test(text)) return null;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[()₹$€£,%\s]/g, '');
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return negative ? -num : num;
}

/** Share of non-empty sample values that parse as numbers. */
function numericRatio(values: unknown[]): number {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (!nonEmpty.length) return 0;
  return nonEmpty.filter((v) => parseNumeric(v) !== null).length / nonEmpty.length;
}

interface Candidate {
  field: FieldKey;
  score: number;
  reason: string;
}

function scoreColumn(header: string, values: unknown[]): Candidate[] {
  const norm = normaliseHeader(header);
  const toks = tokens(header);
  const ratio = numericRatio(values);
  const looksNumeric = ratio >= 0.8;
  const candidates: Candidate[] = [];

  for (const pattern of FIELD_PATTERNS) {
    if (pattern.reject?.some((token) => norm.includes(token))) continue;

    let score = 0;
    let reason = '';

    const exactIndex = pattern.exact.indexOf(norm);
    if (exactIndex !== -1) {
      // Aliases are listed best-first, so position breaks ties deterministically:
      // a column called "Brand" must beat one called "SKU" for the brand field.
      score = 100 - exactIndex * 0.5;
      reason = `Header "${header}" is a known alias for this field`;
    } else if (pattern.exact.some((alias) => norm === alias.replace(/[^a-z0-9]/g, ''))) {
      score = 96;
      reason = `Header "${header}" matches a known alias`;
    } else {
      const contains = pattern.contains ?? [];
      const hit = contains.find((frag) => norm.includes(frag));
      if (hit) {
        // Longer fragments relative to the header are stronger evidence.
        score = 55 + Math.round((hit.length / Math.max(norm.length, 1)) * 25);
        reason = `Header contains "${hit}"`;
      } else if (toks.some((t) => pattern.exact.includes(t))) {
        score = 58;
        reason = `Header token matches this field`;
      }
    }

    if (!score) continue;

    // Value-shape agreement is a strong confirmation, disagreement a strong veto.
    if (pattern.expect === 'number') {
      if (looksNumeric) {
        score += 12;
        reason += '; column values are numeric';
      } else {
        score -= 45;
        reason += '; but column values are not numeric';
      }
    } else if (pattern.expect === 'text') {
      if (ratio > 0.9) {
        score -= 30;
        reason += '; but column values look numeric';
      }
    }

    if (score > 0) candidates.push({ field: pattern.field, score, reason });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function confidenceFor(score: number): Confidence {
  if (score >= 94) return 'high';
  if (score >= 70) return 'medium';
  if (score >= 45) return 'low';
  return 'none';
}


/* ------------------------------------------------------------------ */
/* Period awareness                                                    */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export interface HeaderPeriod {
  /** Sortable: year * 100 + month. */
  key: number;
  label: string;
}

/**
 * Reads a period out of a header: "Mar-26 MAT Sales Value", "MAT Aug 2026",
 * "FY24 Value", "2025 Sales". Returns null when the header names no period.
 *
 * This matters because a basefile carries the same measure for several years —
 * five MAT value columns is normal. Without period awareness the mapper picks one
 * arbitrarily, and MATLens would silently analyse a four-year-old period.
 */
export function headerPeriod(header: string): HeaderPeriod | null {
  const monthYear = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-_/']*((?:19|20)?\d{2})\b/i.exec(header);
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase().slice(0, 3)];
    const rawYear = Number(monthYear[2]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (month && year >= 1990 && year <= 2100) {
      return { key: year * 100 + month, label: `${monthYear[1][0].toUpperCase()}${monthYear[1].slice(1, 3).toLowerCase()}-${String(year).slice(-2)}` };
    }
  }

  const fiscal = /\bfy\s?-?((?:19|20)?\d{2})\b/i.exec(header);
  if (fiscal) {
    const rawYear = Number(fiscal[1]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (year >= 1990 && year <= 2100) return { key: year * 100 + 3, label: `FY${String(year).slice(-2)}` };
  }

  const bareYear = /\b((?:19|20)\d{2})\b/.exec(header);
  if (bareYear) {
    const year = Number(bareYear[1]);
    return { key: year * 100 + 12, label: String(year) };
  }

  return null;
}

/** The header with its period token removed, so sibling columns can be grouped. */
function measureStem(header: string): string {
  return header
    .toLowerCase()
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-_/']*((?:19|20)?\d{2})\b/gi, ' ')
    .replace(/\bfy\s?-?((?:19|20)?\d{2})\b/gi, ' ')
    .replace(/\b((?:19|20)\d{2})\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

interface PeriodDecision {
  field: FieldKey | null;
  reason: string;
}

/**
 * Resolves families of same-measure, different-period columns.
 *
 * Given five "MAT Sales Value" columns spanning Mar-22 to Mar-26, the most recent
 * becomes MAT Value, the one before it becomes Previous MAT Value, and the rest
 * are explicitly set aside rather than competing. The same applies to units.
 */
function resolvePeriodFamilies(
  columns: string[],
  candidatesByColumn: Map<string, Candidate[]>,
): Map<string, PeriodDecision> {
  const decisions = new Map<string, PeriodDecision>();

  const families = new Map<string, Array<{ column: string; period: HeaderPeriod }>>();
  for (const column of columns) {
    const period = headerPeriod(column);
    if (!period) continue;
    const candidates = candidatesByColumn.get(column) ?? [];
    const wantsValue = candidates.some((c) => c.field === 'matValue' || c.field === 'prevMatValue');
    const wantsUnits = candidates.some((c) => c.field === 'matUnits' || c.field === 'prevMatUnits');
    if (!wantsValue && !wantsUnits) continue;
    const stem = `${wantsUnits && !wantsValue ? 'units' : 'value'}:${measureStem(column)}`;
    const family = families.get(stem) ?? [];
    family.push({ column, period });
    families.set(stem, family);
  }

  // Where several families compete for the same field — a MAT series and a YTD
  // series both offering a "value" column — the MAT series wins, because MATLens
  // analyses moving annual totals.
  const ordered = [...families.entries()].sort(
    (a, b) => (b[0].includes('mat') ? 1 : 0) - (a[0].includes('mat') ? 1 : 0),
  );
  const taken = new Set<FieldKey>();

  for (const [stem, members] of ordered) {
    if (members.length < 2) continue;
    members.sort((a, b) => b.period.key - a.period.key);
    const isUnits = stem.startsWith('units:');
    const currentField: FieldKey = isUnits ? 'matUnits' : 'matValue';
    const previousField: FieldKey = isUnits ? 'prevMatUnits' : 'prevMatValue';
    const measure = isUnits ? 'unit' : 'value';

    if (taken.has(currentField)) {
      for (const member of members) {
        decisions.set(member.column, {
          field: null,
          reason: `A more relevant ${measure} series was found in this file, so this ${member.period.label} column is not used. Map it manually to analyse it instead.`,
        });
      }
      continue;
    }
    taken.add(currentField);
    taken.add(previousField);

    decisions.set(members[0].column, {
      field: currentField,
      reason: `Most recent ${measure} period in this file (${members[0].period.label}) of ${members.length} available`,
    });
    decisions.set(members[1].column, {
      field: previousField,
      reason: `Second most recent ${measure} period (${members[1].period.label}) — used as the comparison period`,
    });
    for (const older of members.slice(2)) {
      decisions.set(older.column, {
        field: null,
        reason: `Earlier ${measure} period (${older.period.label}). MATLens compares the two most recent — map it manually to compare a different pair.`,
      });
    }
  }

  return decisions;
}

/**
 * Maps every source column to a MATLens field.
 *
 * Resolution is global rather than per-column: each field is claimed by the
 * single best-scoring column, so `MAT_VAL` and `MAT_VAL_LY` cannot both become
 * "MAT Value". Losing columns fall back to their next-best unclaimed field.
 */
export function mapColumns(table: RawTable): ColumnMapping[] {
  const sampleRows = table.rows.slice(0, 200);
  const perColumn = new Map<string, Candidate[]>();

  for (const column of table.columns) {
    const values = sampleRows.map((row) => row[column]);
    perColumn.set(column, scoreColumn(column, values));
  }

  // Same-measure columns for several periods are resolved first, so a five-year
  // basefile does not have five columns competing to be "MAT Value".
  const periodDecisions = resolvePeriodFamilies(table.columns, perColumn);

  const claimed = new Map<FieldKey, { column: string; score: number }>();
  const assignedByPeriod = new Map<string, Candidate>();
  for (const [column, decision] of periodDecisions) {
    if (!decision.field) continue;
    claimed.set(decision.field, { column, score: 1000 });
    assignedByPeriod.set(column, { field: decision.field, score: 1000, reason: decision.reason });
  }

  // Highest scoring (column, field) pairs claim their field first.
  const pairs = table.columns.flatMap((column) =>
    (perColumn.get(column) ?? []).map((candidate) => ({ column, ...candidate })),
  );
  pairs.sort((a, b) => b.score - a.score);

  const assigned = new Map<string, Candidate>(assignedByPeriod);
  for (const pair of pairs) {
    if (assigned.has(pair.column)) continue;
    // Columns set aside as earlier periods take no further part.
    if (periodDecisions.has(pair.column)) continue;
    const existing = claimed.get(pair.field);
    if (existing && existing.score >= pair.score) continue;
    if (existing) assigned.delete(existing.column);
    claimed.set(pair.field, { column: pair.column, score: pair.score });
    assigned.set(pair.column, { field: pair.field, score: pair.score, reason: pair.reason });
  }

  return table.columns.map((column) => {
    const winner = assigned.get(column);
    const values = sampleRows
      .map((row) => row[column])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .slice(0, 3)
      .map((v) => String(v));
    const alternatives = (perColumn.get(column) ?? [])
      .filter((c) => c.field !== winner?.field)
      .slice(0, 3)
      .map((c) => c.field);

    if (!winner) {
      const setAside = periodDecisions.get(column);
      return {
        sourceColumn: column,
        field: null,
        confidence: 'none',
        reason:
          setAside?.reason ??
          'No confident match to a MATLens field. Carried through to the Data Explorer but not used in calculations.',
        sampleValues: values,
        alternatives,
      } satisfies ColumnMapping;
    }

    return {
      sourceColumn: column,
      field: winner.field,
      confidence: confidenceFor(winner.score),
      reason: winner.reason,
      sampleValues: values,
      alternatives,
    } satisfies ColumnMapping;
  });
}

/** Applies a manual correction, releasing the field from whichever column held it. */
export function overrideMapping(
  mappings: ColumnMapping[],
  sourceColumn: string,
  field: FieldKey | null,
): ColumnMapping[] {
  return mappings.map((mapping) => {
    if (mapping.sourceColumn === sourceColumn) {
      return {
        ...mapping,
        field,
        confidence: field ? ('high' as Confidence) : ('none' as Confidence),
        reason: field ? 'Manually mapped by user' : 'Manually excluded by user',
        overridden: true,
      };
    }
    if (field && mapping.field === field) {
      return {
        ...mapping,
        field: null,
        confidence: 'none' as Confidence,
        reason: `Released — "${sourceColumn}" was mapped to this field instead`,
        overridden: true,
      };
    }
    return mapping;
  });
}

export function mappedColumnFor(mappings: ColumnMapping[], field: FieldKey): string | null {
  return mappings.find((m) => m.field === field)?.sourceColumn ?? null;
}
