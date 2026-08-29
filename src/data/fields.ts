import type { FieldDefinition, FieldKey } from '../types';

/**
 * The canonical MAT field dictionary.
 *
 * Real market extracts never share a header convention: one house exports
 * `MAT_VAL`, the next `MAT Value (INR)`, the next `Value Sales MAT`. The mapper
 * reconciles all of them to these keys, and the UI always shows the user which
 * source column ended up where.
 */
export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: 'brand', label: 'Brand', kind: 'dimension', essential: true, description: 'The marketed brand name. The unit of analysis for a Brand Manager.' },
  { key: 'company', label: 'Company', kind: 'dimension', description: 'Marketing company / corporation behind the brand.' },
  { key: 'molecule', label: 'Molecule', kind: 'dimension', description: 'Active ingredient or molecule combination.' },
  { key: 'therapy', label: 'Therapy Area', kind: 'dimension', description: 'Therapeutic area the brand competes in.' },
  { key: 'segment', label: 'Segment', kind: 'dimension', description: 'Market sub-segment / class within the therapy area.' },
  { key: 'region', label: 'Region', kind: 'dimension', description: 'Geography, zone or territory.' },
  { key: 'period', label: 'Period', kind: 'meta', description: 'MAT period label, e.g. MAT Aug 2026.' },
  { key: 'matValue', label: 'MAT Value', kind: 'measure', essential: true, description: 'Moving Annual Total value sales for the current period.' },
  { key: 'prevMatValue', label: 'Previous MAT Value', kind: 'measure', description: 'MAT value for the comparable prior period. Enables growth and share change.' },
  { key: 'matUnits', label: 'MAT Units', kind: 'measure', description: 'Moving Annual Total unit sales for the current period.' },
  { key: 'prevMatUnits', label: 'Previous MAT Units', kind: 'measure', description: 'Unit sales for the comparable prior period.' },
  { key: 'growthPct', label: 'MAT Growth %', kind: 'measure', description: 'Growth as reported in the source file. MATLens recomputes its own from values.' },
  { key: 'marketSharePct', label: 'Market Share %', kind: 'measure', description: 'Share as reported in the source file. MATLens recomputes share within the loaded universe.' },
  { key: 'rank', label: 'Rank', kind: 'measure', description: 'Rank as reported in the source file.' },
];

export const FIELD_BY_KEY: Record<FieldKey, FieldDefinition> = Object.fromEntries(
  FIELD_DEFINITIONS.map((f) => [f.key, f]),
) as Record<FieldKey, FieldDefinition>;

export function fieldLabel(key: FieldKey | null): string {
  return key ? FIELD_BY_KEY[key].label : 'Not mapped';
}

/**
 * Synonyms are matched against a normalised header (lower-case, alphanumeric only).
 * `exact` wins outright; `contains` is a weaker signal scored by coverage.
 */
interface FieldPattern {
  field: FieldKey;
  exact: string[];
  contains?: string[];
  /** Tokens that disqualify a match, e.g. "previous" for the current-period value. */
  reject?: string[];
  /** Expected value type — used to confirm or downgrade a textual match. */
  expect: 'text' | 'number';
}

const PREV_TOKENS = ['prev', 'previous', 'py', 'ly', 'lastyear', 'lyr', 'priorperiod', 'prior', 'base', 'yearago', 'ya'];

export const FIELD_PATTERNS: FieldPattern[] = [
  {
    field: 'brand',
    exact: ['brand', 'brandname', 'brnd', 'product', 'productname', 'sku', 'brandsku', 'item', 'itemname', 'pack', 'brandpack'],
    contains: ['brand', 'product'],
    reject: ['company', 'rank', 'value', 'growth', 'share', 'count'],
    expect: 'text',
  },
  {
    field: 'company',
    exact: ['company', 'companyname', 'comp', 'compname', 'corporate', 'corp', 'manufacturer', 'mfr', 'mfg', 'marketer', 'organisation', 'organization', 'player', 'firm'],
    contains: ['company', 'corporat', 'manufactur', 'marketer'],
    reject: ['brand', 'rank', 'share'],
    expect: 'text',
  },
  {
    field: 'molecule',
    exact: ['molecule', 'moleculename', 'mol', 'molname', 'activeingredient', 'ingredient', 'generic', 'genericname', 'composition', 'api', 'salt', 'saltname', 'inn'],
    contains: ['molecule', 'ingredient', 'generic', 'composition'],
    expect: 'text',
  },
  {
    field: 'therapy',
    exact: ['therapy', 'therapyarea', 'therapeuticarea', 'ta', 'therapeuticclass', 'therapyclass', 'speciality', 'specialty', 'indication', 'atc', 'atc1'],
    contains: ['therap', 'speciality', 'specialty'],
    expect: 'text',
  },
  {
    field: 'segment',
    exact: ['segment', 'subsegment', 'seg', 'subseg', 'category', 'subcategory', 'marketsegment', 'class', 'subclass', 'market', 'marketname', 'atc3', 'atc4'],
    contains: ['segment', 'categor', 'subclass'],
    reject: ['share', 'value', 'growth'],
    expect: 'text',
  },
  {
    field: 'region',
    exact: ['region', 'geography', 'geo', 'zone', 'territory', 'state', 'area', 'city', 'cluster', 'hq', 'market region'],
    contains: ['region', 'geograph', 'territor', 'zone'],
    expect: 'text',
  },
  {
    field: 'period',
    exact: ['period', 'mat', 'matperiod', 'timeperiod', 'periodname', 'matlabel', 'periodlabel'],
    contains: ['period'],
    // A per-row date such as "SKU Launch Date" is not the MAT period of the extract.
    reject: ['value', 'unit', 'growth', 'sales', 'share', 'prev', 'launch', 'expiry', 'start', 'end', 'birth'],
    expect: 'text',
  },
  {
    field: 'matValue',
    exact: [
      'matvalue', 'matval', 'matsales', 'matvaluesales', 'value', 'valuesales', 'sales', 'salesvalue',
      'matvalueinr', 'matinr', 'matvaluers', 'currentmat', 'currentmatvalue', 'matvaluecur', 'valuemat',
      'matvalcy', 'matvaluecy', 'turnover', 'revenue', 'matrevenue', 'matvaluelakhs', 'matvaluecr',
    ],
    contains: ['matvalue', 'matval', 'valuesales', 'salesvalue', 'matsales', 'value', 'sales', 'revenue'],
    reject: [...PREV_TOKENS, 'unit', 'growth', 'share', 'rank', 'percent', 'change'],
    expect: 'number',
  },
  {
    field: 'prevMatValue',
    exact: [
      'prevmatvalue', 'previousmatvalue', 'prevmatval', 'prevmat', 'previousmat', 'matvalueprev', 'matvaluely',
      'matvaluepy', 'matvallastyear', 'lymat', 'pymat', 'matvalueprevious', 'previousvalue', 'prevvalue',
      'matvaluelastyear', 'matvalueyearago', 'basevalue', 'valuely', 'valuepy', 'lastyearvalue', 'priormatvalue',
    ],
    contains: ['prevmat', 'previousmat', 'matprev', 'lastyear', 'matly', 'matpy', 'valuely', 'valuepy', 'priorvalue'],
    reject: ['unit', 'growth', 'share', 'rank'],
    expect: 'number',
  },
  {
    field: 'matUnits',
    exact: ['matunits', 'matunit', 'matsalesunit', 'matsalesunits', 'units', 'unit', 'unitsales', 'salesunit', 'salesunits', 'matunitsales', 'volume', 'matvolume', 'qty', 'quantity', 'packs', 'matpacks'],
    contains: ['matunit', 'matsalesunit', 'unitsales', 'salesunit', 'volume', 'quantity'],
    reject: [...PREV_TOKENS, 'growth', 'share', 'rank', 'value'],
    expect: 'number',
  },
  {
    field: 'prevMatUnits',
    exact: ['prevmatunits', 'previousmatunits', 'matunitsprev', 'matunitsly', 'matunitspy', 'unitsly', 'unitspy', 'prevunits', 'previousunits', 'lastyearunits', 'prevvolume'],
    contains: ['prevunit', 'previousunit', 'unitsly', 'unitspy', 'unitprev', 'prevvolume'],
    reject: ['value'],
    expect: 'number',
  },
  {
    field: 'growthPct',
    exact: ['growth', 'matgrowth', 'matgr', 'growthpct', 'growthpercent', 'growthrate', 'valuegrowth', 'matgrowthpct', 'growthvsly', 'yoy', 'yoygrowth', 'gr', 'matgrowthpercent', 'growthpercentage'],
    contains: ['growth', 'yoy'],
    reject: ['unit', 'share', 'rank'],
    expect: 'number',
  },
  {
    field: 'marketSharePct',
    exact: ['marketshare', 'share', 'sharepct', 'sharepercent', 'ms', 'mspct', 'valueshare', 'matshare', 'sharevalue', 'marketsharepct', 'sharepercentage'],
    contains: ['marketshare', 'valueshare', 'share'],
    reject: ['change', 'growth', 'prev', 'unit'],
    expect: 'number',
  },
  {
    field: 'rank',
    exact: ['rank', 'matrank', 'brandrank', 'position', 'rnk', 'ranking'],
    contains: ['rank'],
    reject: ['prev', 'change'],
    expect: 'number',
  },
];
