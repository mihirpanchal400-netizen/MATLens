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

    if (pattern.exact.includes(norm)) {
      score = 100;
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
  if (score >= 95) return 'high';
  if (score >= 70) return 'medium';
  if (score >= 45) return 'low';
  return 'none';
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

  const claimed = new Map<FieldKey, { column: string; score: number }>();

  // Highest scoring (column, field) pairs claim their field first.
  const pairs = table.columns.flatMap((column) =>
    (perColumn.get(column) ?? []).map((candidate) => ({ column, ...candidate })),
  );
  pairs.sort((a, b) => b.score - a.score);

  const assigned = new Map<string, Candidate>();
  for (const pair of pairs) {
    if (assigned.has(pair.column)) continue;
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
      return {
        sourceColumn: column,
        field: null,
        confidence: 'none',
        reason: 'No confident match to a MATLens field. Carried through to the Data Explorer but not used in calculations.',
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
