/**
 * Streaming converter for large pharma basefiles.
 *
 * Why this exists
 * ---------------
 * A market-audit basefile can hold a worksheet whose XML is larger than
 * JavaScript's maximum string length (512 MB). No browser and no Node build can
 * open such a sheet the ordinary way — the engine cannot hold it as a string, so
 * every non-streaming reader silently drops the sheet. A 211 MB PharmaTrac IPM
 * export, for example, decompresses to a 672 MB worksheet: 129 MB past the wall.
 *
 * This script streams the workbook row by row, never materialising it, and
 * writes a slim CSV containing only the columns MATLens actually analyses.
 * A 180-column basefile typically leaves as an 11-column file a fraction of the
 * size, which the browser then opens instantly.
 *
 * Everything happens on your machine. Nothing is uploaded anywhere.
 *
 * Usage
 * -----
 *   npm run convert -- --in "C:\\path\\BASEFILE.xlsx" --list
 *   npm run convert -- --in "C:\\path\\BASEFILE.xlsx"
 *   npm run convert -- --in "...xlsx" --therapy DERMATOLOGY --out derma.csv
 *   npm run convert -- --in "...xlsx" --sku-level
 *
 * Options
 *   --in <path>        Source .xlsx (required)
 *   --out <path>       Destination .csv (default: <source name>-matlens.csv next to the source)
 *   --list             Print every column with its index and exit
 *   --sheet <name>     Worksheet to read (default: the first with data)
 *   --therapy <text>   Keep only rows whose therapy contains this text (case-insensitive)
 *   --company <text>   Keep only rows whose company contains this text
 *   --sku-level        Keep one row per SKU instead of summing SKUs to brand level
 *   --limit <n>        Stop after n data rows (useful for a quick trial run)
 */
import { createWriteStream } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import ExcelJS from 'exceljs';

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args.flags.add(key);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.in) {
  console.error(
    'Missing --in.\n\n' +
      '  npm run convert -- --in "C:\\path\\BASEFILE.xlsx" --list\n' +
      '  npm run convert -- --in "C:\\path\\BASEFILE.xlsx" --therapy DERMATOLOGY\n',
  );
  process.exit(1);
}

const source = args.in;
const listOnly = args.flags.has('list');
// Brand is MATLens's unit of analysis, so SKU rows are summed unless asked otherwise.
const brandLevel = !args.flags.has('sku-level');
const rowLimit = args.limit ? Number(args.limit) : Infinity;
const destination =
  args.out ?? join(dirname(source), `${basename(source, extname(source))}-matlens.csv`);

/* ------------------------------------------------------------------ */
/* Column detection                                                    */
/* ------------------------------------------------------------------ */

/** Dimension columns MATLens understands, in preference order per canonical field. */
const DIMENSION_PREFERENCES = [
  { out: 'Brand', candidates: ['brand', 'brand name', 'mother brand', 'product'] },
  { out: 'Company', candidates: ['company', 'corporate', 'manufacturer', 'marketer'] },
  { out: 'Molecule', candidates: ['molecule', 'composition', 'generic name', 'generic', 'active ingredient', 'salt'] },
  { out: 'Therapy', candidates: ['therapy', 'therapeutic area', 'super group'] },
  { out: 'Segment', candidates: ['class', 'sub group', 'sub super group', 'segment', 'category'] },
  { out: 'Region', candidates: ['region', 'geography', 'zone', 'territory', 'state'] },
  { out: 'Division', candidates: ['division'] },
  { out: 'SKU', candidates: ['sku', 'pack'] },
];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Reads "Mar-26 MAT Sales Value" as a sortable period key, or null. */
function periodOf(header) {
  const match = /\b([a-z]{3})-(\d{2})\b/i.exec(header);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  const year = 2000 + Number(match[2]);
  return { year, month, key: year * 100 + month, label: `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}-${match[2]}` };
}

/** Finds the MAT value and MAT unit column pairs for the two most recent periods. */
function findMatColumns(headers) {
  const collect = (pattern) =>
    headers
      .map((header, index) => ({ header, index, period: periodOf(header) }))
      .filter((entry) => entry.period && pattern.test(entry.header))
      .sort((a, b) => b.period.key - a.period.key);

  const values = collect(/\bMAT\b[^a-z]*(sales\s*)?value/i);
  const units = collect(/\bMAT\b[^a-z]*(sales\s*)?units?/i);

  return {
    currentValue: values[0] ?? null,
    previousValue: values[1] ?? null,
    currentUnits: units[0] ?? null,
    previousUnits: units[1] ?? null,
    allValues: values,
  };
}

function findDimension(headers, candidates) {
  const normalised = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const exact = normalised.indexOf(candidate);
    if (exact !== -1) return exact;
  }
  for (const candidate of candidates) {
    const partial = normalised.findIndex((h) => h.includes(candidate));
    if (partial !== -1) return partial;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* CSV writing                                                         */
/* ------------------------------------------------------------------ */

/** Keeps up to six decimals: basefiles denominated in crores lose everything to Math.round. */
function round(value) {
  if (!Number.isFinite(value)) return '';
  return Number.isInteger(value) ? value : Number(value.toFixed(6));
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellValue(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object') {
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    if ('result' in cell) return cell.result ?? null;
    if ('text' in cell) return cell.text ?? null;
    if ('richText' in cell) return cell.richText.map((part) => part.text).join('');
    return null;
  }
  return cell;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\nReading  ${source}`);
  console.log('Streaming the workbook — the sheet is never held in memory in one piece.\n');

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(source, {
    worksheets: 'emit',
    sharedStrings: 'cache',
    entries: 'emit',
    styles: 'ignore',
  });

  let headers = null;
  let plan = null;
  let dataRows = 0;
  let written = 0;
  let skipped = 0;
  const started = Date.now();

  const aggregate = new Map();
  let out = null;

  const therapyFilter = args.therapy ? String(args.therapy).toLowerCase() : null;
  const companyFilter = args.company ? String(args.company).toLowerCase() : null;

  for await (const worksheet of reader) {
    if (args.sheet && worksheet.name !== args.sheet) continue;

    for await (const row of worksheet) {
      const values = row.values.slice(1).map(cellValue);

      /* ---- header row ---- */
      if (!headers) {
        headers = values.map((v) => String(v ?? '').trim());

        if (listOnly) {
          console.log(`Sheet "${worksheet.name}" — ${headers.length} columns:\n`);
          headers.forEach((header, index) => console.log(`  ${String(index + 1).padStart(3)}  ${header}`));
          const found = findMatColumns(headers);
          console.log('\nMAT periods detected:', found.allValues.map((v) => v.period.label).join(', ') || 'none');
          process.exit(0);
        }

        const mat = findMatColumns(headers);
        if (!mat.currentValue) {
          console.error(
            '\nNo MAT value column could be identified in this sheet.\n' +
              'Run again with --list to see every column, then re-export with a MAT value column included.\n',
          );
          process.exit(1);
        }

        plan = {
          dimensions: DIMENSION_PREFERENCES.map((pref) => ({
            out: pref.out,
            index: findDimension(headers, pref.candidates),
          })).filter((d) => d.index !== -1),
          mat,
          period: `MAT ${mat.currentValue.period.label}`,
        };

        console.log(`Sheet          ${worksheet.name}`);
        console.log(`Columns        ${headers.length} in source`);
        console.log(`Period         ${plan.period}  (previous: ${mat.previousValue ? `MAT ${mat.previousValue.period.label}` : 'not found'})`);
        console.log('\nKeeping:');
        for (const dimension of plan.dimensions) {
          console.log(`  ${dimension.out.padEnd(10)} <- ${headers[dimension.index]}`);
        }
        console.log(`  ${'MAT_VAL'.padEnd(10)} <- ${mat.currentValue.header}`);
        if (mat.previousValue) console.log(`  ${'PREV_MAT_VAL'.padEnd(10)} <- ${mat.previousValue.header}`);
        if (mat.currentUnits) console.log(`  ${'MAT_UNITS'.padEnd(10)} <- ${mat.currentUnits.header}`);
        if (mat.previousUnits) console.log(`  ${'PREV_MAT_UNITS'.padEnd(10)} <- ${mat.previousUnits.header}`);
        if (therapyFilter) console.log(`\nFilter         therapy contains "${args.therapy}"`);
        if (companyFilter) console.log(`Filter         company contains "${args.company}"`);
        console.log(brandLevel ? 'Aggregation    SKU rows summed to brand level (use --sku-level to keep SKUs)' : 'Aggregation    none — one row per SKU');
        console.log('');

        const outputColumns = [
          ...plan.dimensions.map((d) => d.out),
          'PERIOD',
          'MAT_VAL',
          ...(mat.previousValue ? ['PREV_MAT_VAL'] : []),
          ...(mat.currentUnits ? ['MAT_UNITS'] : []),
          ...(mat.previousUnits ? ['PREV_MAT_UNITS'] : []),
        ];
        plan.outputColumns = outputColumns;

        if (!brandLevel) {
          out = createWriteStream(destination, { encoding: 'utf8' });
          out.write(`${outputColumns.map(csvCell).join(',')}\n`);
        }
        continue;
      }

      /* ---- data row ---- */
      dataRows += 1;
      if (dataRows > rowLimit) break;

      const dimensionValues = plan.dimensions.map((d) => {
        const value = values[d.index];
        return value === null || value === undefined ? '' : String(value).trim();
      });

      const byName = Object.fromEntries(plan.dimensions.map((d, i) => [d.out, dimensionValues[i]]));

      if (therapyFilter && !String(byName.Therapy ?? '').toLowerCase().includes(therapyFilter)) {
        skipped += 1;
        continue;
      }
      if (companyFilter && !String(byName.Company ?? '').toLowerCase().includes(companyFilter)) {
        skipped += 1;
        continue;
      }
      if (!byName.Brand) {
        skipped += 1;
        continue;
      }

      const num = (entry) => {
        if (!entry) return null;
        const value = values[entry.index];
        if (value === null || value === undefined || value === '') return null;
        const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[₹,\s]/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const measures = {
        MAT_VAL: num(plan.mat.currentValue),
        PREV_MAT_VAL: num(plan.mat.previousValue),
        MAT_UNITS: num(plan.mat.currentUnits),
        PREV_MAT_UNITS: num(plan.mat.previousUnits),
      };

      if (measures.MAT_VAL === null) {
        skipped += 1;
        continue;
      }

      if (brandLevel) {
        // Everything except SKU forms the aggregation key.
        const keyParts = plan.dimensions.filter((d) => d.out !== 'SKU').map((d) => byName[d.out] ?? '');
        const key = keyParts.join('\u0001');
        let bucket = aggregate.get(key);
        if (!bucket) {
          bucket = {
            dims: keyParts,
            MAT_VAL: 0,
            PREV_MAT_VAL: 0,
            MAT_UNITS: 0,
            PREV_MAT_UNITS: 0,
            // A measure only exists for the brand if at least one SKU reported it.
            // Without this, a brand with no history would be written as 0 rather
            // than blank, turning "unknown" into "zero" — a fabrication.
            has: { PREV_MAT_VAL: false, MAT_UNITS: false, PREV_MAT_UNITS: false },
            skus: 0,
          };
          aggregate.set(key, bucket);
        }
        bucket.MAT_VAL += measures.MAT_VAL ?? 0;
        for (const measure of ['PREV_MAT_VAL', 'MAT_UNITS', 'PREV_MAT_UNITS']) {
          if (measures[measure] !== null) {
            bucket[measure] += measures[measure];
            bucket.has[measure] = true;
          }
        }
        bucket.skus += 1;
      } else {
        const line = [
          ...dimensionValues,
          plan.period,
          measures.MAT_VAL,
          ...(plan.mat.previousValue ? [measures.PREV_MAT_VAL] : []),
          ...(plan.mat.currentUnits ? [measures.MAT_UNITS] : []),
          ...(plan.mat.previousUnits ? [measures.PREV_MAT_UNITS] : []),
        ];
        out.write(`${line.map(csvCell).join(',')}\n`);
      }
      written += 1;

      if (dataRows % 25000 === 0) {
        process.stdout.write(`  ${dataRows.toLocaleString('en-IN')} rows read…\n`);
      }
    }
    break; // only the first worksheet with data
  }

  if (brandLevel) {
    const columns = plan.outputColumns.filter((c) => c !== 'SKU');
    out = createWriteStream(destination, { encoding: 'utf8' });
    out.write(`${columns.map(csvCell).join(',')}\n`);
    const dimensionNames = plan.dimensions.filter((d) => d.out !== 'SKU').map((d) => d.out);
    for (const bucket of aggregate.values()) {
      const measure = (name, present) => (present && bucket.has[name] ? round(bucket[name]) : '');
      const line = [
        ...bucket.dims,
        plan.period,
        round(bucket.MAT_VAL),
        ...(plan.mat.previousValue ? [measure('PREV_MAT_VAL', true)] : []),
        ...(plan.mat.currentUnits ? [measure('MAT_UNITS', true)] : []),
        ...(plan.mat.previousUnits ? [measure('PREV_MAT_UNITS', true)] : []),
      ];
      out.write(`${line.map(csvCell).join(',')}\n`);
    }
    console.log(`\n  ${dimensionNames.join(' · ')} aggregated to ${aggregate.size.toLocaleString('en-IN')} rows`);
    written = aggregate.size;
  }

  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on('error', reject);
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const { size } = await import('node:fs').then((fs) => fs.promises.stat(destination));

  console.log(`\nDone in ${seconds}s`);
  console.log(`  read     ${dataRows.toLocaleString('en-IN')} data rows`);
  console.log(`  written  ${written.toLocaleString('en-IN')} rows`);
  console.log(`  skipped  ${skipped.toLocaleString('en-IN')} rows (filtered out, or no brand / no MAT value)`);
  console.log(`  output   ${destination}  (${(size / 1048576).toFixed(1)} MB)`);
  console.log('\nOpen MATLens, go to Upload Data, and drop that CSV in.\n');
}

main().catch((error) => {
  console.error('\nConversion failed:', error.message);
  process.exit(1);
});
