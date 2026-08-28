/**
 * Writes the synthetic demo files into /public/demo-data.
 *
 * The app generates its primary demo dataset in memory from the same module, so
 * these files exist for two other reasons: they let you upload a realistic file
 * through the real upload path, and the four variants deliberately break the
 * column conventions so the mapper and the validator can be proven, not assumed.
 *
 * Run with:  npm run gen:demo
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { generateDemoRows, DEMO_COLUMNS } from '../src/data/demoGenerator.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'demo-data');
mkdirSync(outDir, { recursive: true });

const rows = generateDemoRows();

function toCsv(columns, records) {
  const cell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const head = columns.map(cell).join(',');
  const body = records.map((record) => columns.map((column) => cell(record[column])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

function write(name, contents) {
  writeFileSync(join(outDir, name), contents, 'utf8');
  console.log(`  ${name.padEnd(46)} ${String(contents.split('\n').length - 2).padStart(5)} rows`);
}

console.log('Writing synthetic demo files to public/demo-data\n');

/* 1 — primary file, abbreviated audit-style headers ------------------------- */
write('matlens_demo_dermatology_MAT_Aug2026.csv', toCsv(DEMO_COLUMNS, rows));

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: DEMO_COLUMNS }), 'Master Data');
XLSX.writeFile(workbook, join(outDir, 'matlens_demo_dermatology_MAT_Aug2026.xlsx'));
console.log(`  matlens_demo_dermatology_MAT_Aug2026.xlsx      ${String(rows.length).padStart(5)} rows`);

/* 2 — verbose headers, units in brackets ----------------------------------- */
const verboseColumns = [
  'Brand Name', 'Company', 'Active Ingredient', 'Therapeutic Area', 'Sub Segment',
  'Geography', 'Period', 'MAT Value (INR)', 'MAT Value LY', 'MAT Units', 'MAT Units LY',
];
const verboseRows = rows.map((row) => ({
  'Brand Name': row.BRAND_NAME,
  Company: row.COMP_NAME,
  'Active Ingredient': row.MOLECULE_NAME,
  'Therapeutic Area': row.THERAPY_AREA,
  'Sub Segment': row.SEGMENT,
  Geography: row.REGION,
  Period: row.PERIOD,
  'MAT Value (INR)': row.MAT_VAL,
  'MAT Value LY': row.PREV_MAT_VAL,
  'MAT Units': row.MAT_UNITS,
  'MAT Units LY': row.PREV_MAT_UNITS,
}));
write('matlens_demo_verbose_headers.csv', toCsv(verboseColumns, verboseRows));

/* 3 — growth column instead of a previous-period value --------------------- */
const growthColumns = ['BRAND', 'COMPANY', 'MOLECULE', 'SEGMENT', 'REGION', 'MAT_SALES', 'MAT_GR'];
const growthRows = rows.map((row) => ({
  BRAND: row.BRAND_NAME,
  COMPANY: row.COMP_NAME,
  MOLECULE: row.MOLECULE_NAME,
  SEGMENT: row.SEGMENT,
  REGION: row.REGION,
  MAT_SALES: row.MAT_VAL,
  MAT_GR: Number((((row.MAT_VAL - row.PREV_MAT_VAL) / row.PREV_MAT_VAL) * 100).toFixed(2)),
}));
write('matlens_demo_growth_only.csv', toCsv(growthColumns, growthRows));

/* 4 — current period only, no history at all ------------------------------- */
const currentColumns = ['BRAND', 'COMPANY', 'MOLECULE', 'SEGMENT', 'REGION', 'MAT_VAL'];
const currentRows = rows.map((row) => ({
  BRAND: row.BRAND_NAME,
  COMPANY: row.COMP_NAME,
  MOLECULE: row.MOLECULE_NAME,
  SEGMENT: row.SEGMENT,
  REGION: row.REGION,
  MAT_VAL: row.MAT_VAL,
}));
write('matlens_demo_current_only.csv', toCsv(currentColumns, currentRows));

/* 5 — a deliberately messy export ------------------------------------------ */
const messyColumns = [...DEMO_COLUMNS, 'MKT_SHARE', 'REMARKS'];
const messyRows = rows.map((row, index) => {
  const record = { ...row, MKT_SHARE: '', REMARKS: '' };

  if (index % 41 === 0) record.MAT_VAL = '';                 // blank value
  if (index % 53 === 0) record.BRAND_NAME = '';              // no brand
  if (index % 67 === 0) record.MAT_VAL = 'N/A';              // text in a numeric column
  if (index % 79 === 0) record.MAT_VAL = 'not available';    // unparseable text
  if (index % 71 === 0) record.COMP_NAME = '';               // blank dimension
  if (index % 97 === 0) record.MAT_VAL = -Math.abs(Number(row.MAT_VAL)); // returns/corrections
  if (index % 37 === 0) record.MKT_SHARE = 142.6;            // impossible share
  if (index % 29 === 0) record.PREV_MAT_VAL = 0;             // zero base

  return record;
});
// Duplicate a handful of rows outright, the way a badly joined export does.
for (const index of [4, 40, 88, 140, 205, 260]) {
  if (messyRows[index]) messyRows.push({ ...messyRows[index] });
}
write('matlens_demo_messy.csv', toCsv(messyColumns, messyRows));

console.log('\nDone. All files are synthetic: invented brands, invented companies, invented numbers.');
