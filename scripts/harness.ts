/**
 * End-to-end verification of the MATLens pipeline, run outside the browser.
 *
 * It exercises the real application modules — the same parser, mapper,
 * validator, analytics and rule engine the UI calls — against the demo dataset
 * and every synthetic variant, then checks the arithmetic independently.
 *
 * Run with:  npm run verify
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyse, applyFilters, brandOptions } from '../src/analytics/analyse';
import { generateInsights, opportunitiesFrom } from '../src/analytics/insightEngine';
import { buildDataset } from '../src/data/buildDataset';
import { headerPeriod, mapColumns } from '../src/data/columnMapper';
import { canStreamXlsx, readXlsxStreaming } from '../src/data/xlsxStream';
import { loadDemoDataset } from '../src/data/demoDataset';
import { parseFile } from '../src/data/parseFile';
import { EMPTY_FILTERS, type Dataset } from '../src/types';
import { PAGES, renderLanding, renderPage } from './renderCheck';

const DEMO_DIR = join(process.cwd(), 'public', 'demo-data');

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function near(actual: number | null, expected: number, tolerance: number): boolean {
  return actual !== null && Math.abs(actual - expected) <= tolerance;
}

function heading(text: string) {
  console.log(`\n${text}\n${'-'.repeat(text.length)}`);
}

async function loadLocal(fileName: string): Promise<Dataset> {
  const buffer = readFileSync(join(DEMO_DIR, fileName));
  const file = new File([buffer], fileName);
  const raw = await parseFile(file);
  return buildDataset({ raw, mappings: mapColumns(raw) });
}

async function main() {
  console.log('MATLens pipeline verification');

  /* ---------------------------------------------------------------- */
  heading('1. Demo dataset (in-memory, the path the "Explore demo" button uses)');
  const demo = loadDemoDataset();
  check('dataset builds', demo.rows.length > 0, `${demo.rows.length} usable rows`);
  check('no rows dropped', demo.health.droppedRows === 0);
  check('no duplicate rows', demo.health.duplicateRows === 0);
  check('marked synthetic', demo.isSynthetic);
  check('period detected', demo.period === 'MAT Aug 2026', String(demo.period));
  check(
    'every column mapped with high confidence',
    demo.mappings.every((m) => m.field !== null && m.confidence === 'high'),
    demo.mappings.map((m) => `${m.sourceColumn}→${m.field}(${m.confidence})`).join(' '),
  );
  check('all capabilities available', demo.capabilities.canComputeGrowth && demo.capabilities.canComputeShare && demo.capabilities.hasRegion && demo.capabilities.hasUnits);
  check('no limitations reported', demo.capabilities.limitations.length === 0, demo.capabilities.limitations.join(' | '));

  const analysis = analyse(demo.rows);
  console.log(
    `\n  market ${(analysis.market.totalValue / 1e7).toFixed(1)} Cr · growth ${analysis.market.growthPct?.toFixed(2)}% · ` +
      `${analysis.market.brandCount} brands · ${analysis.market.companyCount} companies · ${analysis.market.moleculeCount} molecules · ` +
      `CR4 ${analysis.market.cr4?.toFixed(1)}% · HHI ${Math.round(analysis.market.hhi ?? 0)} (${analysis.market.concentrationLabel})\n`,
  );

  /* ---------------------------------------------------------------- */
  heading('2. Analytics — checked against an independent recomputation');
  const rawTotal = demo.rows.reduce((sum, r) => sum + (r.matValue ?? 0), 0);
  const rawPrev = demo.rows.reduce((sum, r) => sum + (r.prevMatValue ?? 0), 0);
  check('market total equals the sum of rows', Math.abs(analysis.market.totalValue - rawTotal) < 1);
  check(
    'market growth equals (cur−prev)/prev',
    near(analysis.market.growthPct, ((rawTotal - rawPrev) / rawPrev) * 100, 1e-9),
    `${analysis.market.growthPct?.toFixed(4)}%`,
  );
  check(
    'brand values sum to the market total',
    Math.abs(analysis.brands.reduce((s, b) => s + b.matValue, 0) - analysis.market.totalValue) < 1,
  );
  check(
    'brand shares sum to 100%',
    near(analysis.brands.reduce((s, b) => s + (b.sharePct ?? 0), 0), 100, 1e-6),
  );
  check(
    'previous shares sum to 100%',
    near(analysis.brands.reduce((s, b) => s + (b.prevSharePct ?? 0), 0), 100, 1e-6),
  );
  check(
    'share changes sum to zero (share is zero-sum)',
    near(analysis.brands.reduce((s, b) => s + (b.shareChangePp ?? 0), 0), 0, 1e-6),
  );
  check(
    'growth contributions sum to 100%',
    near(analysis.brands.reduce((s, b) => s + (b.growthContributionPct ?? 0), 0), 100, 1e-6),
  );
  check('ranks are 1..n with no gaps', analysis.brands.every((b, i) => b.rank === i + 1));
  check(
    'rank change equals previous rank − current rank',
    analysis.brands.every((b) => b.rankChange === (b.prevRank ?? 0) - (b.rank ?? 0)),
  );
  check(
    'segment totals reconcile to the market total',
    Math.abs(analysis.segments.reduce((s, x) => s + x.matValue, 0) - analysis.market.totalValue) < 1,
  );
  check(
    'region totals reconcile to the market total',
    Math.abs(analysis.regions.reduce((s, x) => s + x.matValue, 0) - analysis.market.totalValue) < 1,
  );

  const soranil = analysis.brands.find((b) => b.name === 'Soranil')!;
  const dermazol = analysis.brands.find((b) => b.name === 'Dermazol')!;
  check('focus brand present', Boolean(soranil));
  check('Soranil is now #2', soranil.rank === 2, `rank ${soranil.rank}, previously ${soranil.prevRank}`);
  check('Soranil was previously #1', soranil.prevRank === 1);
  check('Dermazol overtook it', dermazol.rank === 1 && dermazol.prevRank === 2);
  check('Soranil lost share', (soranil.shareChangePp ?? 0) < 0, `${soranil.shareChangePp?.toFixed(2)} pp`);
  check(
    'Soranil grows slower than the market',
    (soranil.growthPct ?? 0) < (analysis.market.growthPct ?? 0),
    `${soranil.growthPct?.toFixed(1)}% vs ${analysis.market.growthPct?.toFixed(1)}%`,
  );
  check('unit growth trails value growth (price effect present)', (soranil.unitGrowthPct ?? 0) < (soranil.growthPct ?? 0));

  /* ---------------------------------------------------------------- */
  heading('3. Filters');
  const filtered = applyFilters(demo.rows, { ...EMPTY_FILTERS, segment: 'Antifungals' });
  const segmentAnalysis = analyse(filtered);
  const antifungals = analysis.segments.find((s) => s.name === 'Antifungals')!;
  check('filtered row count is a strict subset', filtered.length > 0 && filtered.length < demo.rows.length, `${filtered.length} of ${demo.rows.length}`);
  check(
    'filtered market equals that segment’s total in the unfiltered analysis',
    Math.abs(segmentAnalysis.market.totalValue - antifungals.matValue) < 1,
  );
  check('share is recomputed within the selection', near(segmentAnalysis.brands.reduce((s, b) => s + (b.sharePct ?? 0), 0), 100, 1e-6));
  const regionFiltered = analyse(applyFilters(demo.rows, { ...EMPTY_FILTERS, region: 'South' }));
  check('region filter reconciles too', Math.abs(regionFiltered.market.totalValue - analysis.regions.find((r) => r.name === 'South')!.matValue) < 1);

  /* ---------------------------------------------------------------- */
  heading('4. Insight engine');
  const insights = generateInsights(analysis, soranil, demo.capabilities);
  check('insights generated', insights.length >= 5, `${insights.length} findings`);
  check('sorted by priority', insights.every((x, i) => i === 0 || insights[i - 1].priority >= x.priority));
  check(
    'every insight is complete',
    insights.every((x) => x.title && x.signal && x.interpretation && x.implication && x.investigationQuestion && x.calculation && x.evidence.length > 0),
  );
  check('every investigation question is a question', insights.every((x) => x.investigationQuestion.trim().endsWith('?')));
  check('insight ids are unique', new Set(insights.map((x) => x.id)).size === insights.length);
  const opportunities = opportunitiesFrom(insights);
  check('opportunity signals detected', opportunities.length >= 3, `${opportunities.length} opportunities`);

  const fired = new Set(insights.map((x) => x.rule));
  for (const rule of [
    'brand-vs-market',
    'share-movement',
    'rank-movement',
    'competitor-momentum',
    'molecule-opportunity',
    'segment-opportunity',
    'regional-opportunity',
    'regional-concentration',
    'emerging-competitor',
    'vulnerable-incumbent',
    'growth-capture',
    'price-volume-mix',
    'high-growth-niche',
    'market-structure',
  ]) {
    check(`rule fires on demo data: ${rule}`, fired.has(rule));
  }
  check('data-limitation rule stays silent on a complete dataset', !fired.has('data-limitations'));

  console.log('\n  Findings, ranked:');
  for (const insight of insights) {
    console.log(`   [${insight.severity.padEnd(8)}] ${insight.title}`);
  }

  /* ---------------------------------------------------------------- */
  heading('5. File upload path — .xlsx');
  const xlsx = await loadLocal('matlens_demo_dermatology_MAT_Aug2026.xlsx');
  const xlsxAnalysis = analyse(xlsx.rows);
  check('xlsx parses', xlsx.rows.length === demo.rows.length, `${xlsx.rows.length} rows`);
  check('xlsx sheet name captured', xlsx.raw.sheetName === 'Master Data', String(xlsx.raw.sheetName));
  check('xlsx totals match the in-memory demo', Math.abs(xlsxAnalysis.market.totalValue - analysis.market.totalValue) < 1);

  /* ---------------------------------------------------------------- */
  heading('6. Variant A — verbose headers');
  const verbose = await loadLocal('matlens_demo_verbose_headers.csv');
  const verboseAnalysis = analyse(verbose.rows);
  check('all columns mapped', verbose.mappings.every((m) => m.field !== null),
    verbose.mappings.map((m) => `${m.sourceColumn}→${m.field}`).join(' '));
  check('previous value mapped, not confused with current', verbose.capabilities.hasPreviousValue && !verbose.capabilities.previousValueDerivedFromGrowth);
  check('totals identical to the primary file', Math.abs(verboseAnalysis.market.totalValue - analysis.market.totalValue) < 1);
  check('growth identical to the primary file', near(verboseAnalysis.market.growthPct, analysis.market.growthPct ?? 0, 1e-9));

  /* ---------------------------------------------------------------- */
  heading('7. Variant B — growth column, no previous value');
  const growthOnly = await loadLocal('matlens_demo_growth_only.csv');
  const growthAnalysis = analyse(growthOnly.rows);
  check('growth column mapped', growthOnly.mappings.some((m) => m.field === 'growthPct'));
  check('previous value reconstructed from growth', growthOnly.capabilities.previousValueDerivedFromGrowth);
  check('reconstruction is flagged in the limitations', growthOnly.capabilities.limitations.some((l) => l.includes('derived from the reported growth')));
  check('reconstruction noted for the user', growthOnly.notes.some((n) => n.includes('reconstructed')));
  check(
    'reconstructed market growth matches the true rate',
    near(growthAnalysis.market.growthPct, analysis.market.growthPct ?? 0, 0.05),
    `${growthAnalysis.market.growthPct?.toFixed(3)}% vs ${analysis.market.growthPct?.toFixed(3)}%`,
  );
  check('growth insights still fire', generateInsights(growthAnalysis, growthAnalysis.brands.find((b) => b.name === 'Soranil') ?? null, growthOnly.capabilities).length >= 5);

  /* ---------------------------------------------------------------- */
  heading('8. Variant C — current period only (graceful degradation)');
  const currentOnly = await loadLocal('matlens_demo_current_only.csv');
  const currentAnalysis = analyse(currentOnly.rows);
  check('rows still parse', currentOnly.rows.length === demo.rows.length);
  check('market size still calculated', Math.abs(currentAnalysis.market.totalValue - analysis.market.totalValue) < 1);
  check('growth is withheld, not guessed', currentAnalysis.market.growthPct === null && !currentOnly.capabilities.canComputeGrowth);
  check('share is still available', currentAnalysis.brands.every((b) => b.sharePct !== null));
  check('share change is withheld', currentAnalysis.brands.every((b) => b.shareChangePp === null));
  check('rank change is withheld', currentAnalysis.brands.every((b) => b.rankChange === null));
  check('the limitation is explained', currentOnly.capabilities.limitations.some((l) => l.includes('No previous-period MAT value')));
  const currentInsights = generateInsights(currentAnalysis, currentAnalysis.brands[0], currentOnly.capabilities);
  check('engine does not crash without history', currentInsights.length > 0, `${currentInsights.length} findings`);
  check('the data limitation is raised as a finding', currentInsights.some((x) => x.rule === 'data-limitations'));
  check('no growth-dependent finding is fabricated', !currentInsights.some((x) => ['brand-vs-market', 'share-movement', 'competitor-momentum'].includes(x.rule)));

  /* ---------------------------------------------------------------- */
  heading('9. Variant D — messy export (validation)');
  const messy = await loadLocal('matlens_demo_messy.csv');
  const ids = messy.health.issues.map((i) => i.id);
  console.log(`  rows ${messy.health.totalRows} → usable ${messy.health.usableRows} (${messy.health.droppedRows} excluded)`);
  for (const issue of messy.health.issues) {
    console.log(`   [${issue.severity}] ${issue.id}: ${issue.affectedRows} row(s)`);
  }
  check('bad rows are excluded, not silently kept', messy.health.droppedRows > 0);
  check('rows without a brand are caught', ids.includes('missing-brand'));
  check('blank MAT values are caught', ids.includes('missing-value'));
  check('non-numeric MAT values are caught', ids.includes('invalid-value'));
  check('duplicate rows are caught', ids.includes('duplicate-row') && messy.health.duplicateRows > 0);
  check('negative values are flagged but retained', ids.includes('negative-value'));
  check('a zero previous-period base is handled', ids.includes('zero-base'));
  check('impossible share values are flagged', ids.includes('impossible-share'));
  check('empty columns are reported', ids.includes('empty-columns') && messy.health.emptyColumns.includes('REMARKS'));
  check('analysis still completes on a messy file', analyse(messy.rows).brands.length > 0);
  check('no growth is reported against a zero base', analyse(messy.rows).brands.every((b) => b.growthPct === null || Number.isFinite(b.growthPct)));

  /* ---------------------------------------------------------------- */
  heading('10. Error handling');
  const cases: Array<[string, File]> = [
    ['empty file', new File([], 'empty.csv')],
    ['unsupported extension', new File([new Uint8Array([1, 2, 3])], 'notes.pdf')],
    ['header with no rows', new File(['BRAND,MAT_VAL\n'], 'headeronly.csv')],
    ['not a spreadsheet at all', new File(['just some prose, nothing tabular'], 'prose.xlsx')],
  ];
  for (const [label, file] of cases) {
    try {
      await parseFile(file);
      check(`rejects ${label}`, false, 'no error was thrown');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const hint = (error as { hint?: string }).hint ?? '';
      check(`rejects ${label} with a usable message`, Boolean(message && hint), message);
    }
  }

  const noValue = await (async () => {
    const file = new File(['BRAND,NOTES\nAlpha,hello\nBeta,world\n'], 'novalue.csv');
    const raw = await parseFile(file);
    return buildDataset({ raw, mappings: mapColumns(raw) });
  })();
  check('a file with no MAT value yields zero usable rows rather than crashing', noValue.rows.length === 0);
  check('and explains why', noValue.health.issues.some((i) => i.id === 'missing-value' || i.id === 'invalid-value'));

  /* ---------------------------------------------------------------- */
  heading('11. Screen rendering — every page, against three very different datasets');
  const scenarios: Array<[string, Dataset]> = [
    ['full demo dataset', demo],
    ['current period only', currentOnly],
    ['messy export', messy],
  ];
  for (const [label, data] of scenarios) {
    for (const page of PAGES) {
      try {
        const html = renderPage(page.id, data);
        check(`renders ${page.label} · ${label}`, html.length > 400 && html.includes('MATLens'), `${html.length} chars`);
      } catch (error) {
        check(`renders ${page.label} · ${label}`, false, error instanceof Error ? error.message : String(error));
      }
    }
  }

  try {
    const landing = renderLanding();
    check(
      'renders the empty-state landing screen',
      landing.includes('From market data to brand decisions') && landing.includes('Explore demo dataset'),
    );
    check('landing offers an upload route', landing.includes('Upload your own Excel or CSV'));
  } catch (error) {
    check('renders the empty-state landing screen', false, error instanceof Error ? error.message : String(error));
  }

  const overviewHtml = renderPage('overview', demo);
  check('Overview marks the data as synthetic', overviewHtml.includes('Synthetic demo data'));
  check('Overview renders the market size KPI', /3,?361|3361/.test(overviewHtml));
  check('Overview surfaces attention items', overviewHtml.includes('Attention required'));
  check('Overview separates observed data from interpretation', overviewHtml.includes('Signal') && overviewHtml.includes('Interpretation'));

  const insightHtml = renderPage('insights', demo);
  check('Insight Center shows its calculations affordance', insightHtml.includes('How was this calculated?'));
  check('Insight Center ends findings with a question', insightHtml.includes('Investigate'));
  check(
    'Insight Center hedges its language',
    /may indicate|could suggest|worth investigating|may reflect|can equally|usually/i.test(insightHtml),
  );

  const noHistoryHtml = renderPage('market', currentOnly);
  check('a withheld metric is explained rather than left blank', noHistoryHtml.includes('is unavailable'));

  /* ---------------------------------------------------------------- */
  heading('13. Scale — a large file, and a file not denominated in rupees');

  // Built at test time rather than committed: a repo should not carry a 15 MB fixture.
  const bigHeader = 'BRAND_NAME,COMP_NAME,MOLECULE_NAME,THERAPY_AREA,SEGMENT,REGION,MAT_VAL,PREV_MAT_VAL';
  const bigLines: string[] = [bigHeader];
  for (let i = 0; i < 60000; i += 1) {
    const value = 100000 + ((i * 7919) % 900000);
    const previous = Math.round(value / (1 + (((i * 31) % 40) - 10) / 100));
    bigLines.push(
      `Brand ${i % 12000},Company ${i % 400},Molecule ${i % 90},Dermatology,Segment ${i % 24},Region ${i % 6},${value},${previous}`,
    );
  }
  const bigCsv = bigLines.join('\n');
  const bigFile = new File([bigCsv], 'large-synthetic.csv');

  let started = Date.now();
  const bigRaw = await parseFile(bigFile);
  const parseSeconds = (Date.now() - started) / 1000;
  check('a 60,000-row CSV parses', bigRaw.rows.length === 60000, `${parseSeconds.toFixed(1)}s, ${(bigCsv.length / 1048576).toFixed(1)} MB`);
  check('parsing stays well inside a usable time', parseSeconds < 20, `${parseSeconds.toFixed(1)}s`);

  const bigDataset = buildDataset({ raw: bigRaw, mappings: mapColumns(bigRaw) });
  started = Date.now();
  const bigAnalysis = analyse(bigDataset.rows);
  const analyseSeconds = (Date.now() - started) / 1000;
  check('analysis completes on 60,000 rows', bigAnalysis.brands.length === 12000, `${analyseSeconds.toFixed(2)}s, ${bigAnalysis.brands.length.toLocaleString('en-IN')} brands`);
  check('analysis stays fast at scale', analyseSeconds < 10, `${analyseSeconds.toFixed(2)}s`);
  check(
    'integrity holds at scale — shares still sum to 100%',
    near(bigAnalysis.brands.reduce((s, b) => s + (b.sharePct ?? 0), 0), 100, 1e-6),
  );
  check('ranks are still contiguous at scale', bigAnalysis.brands.every((b, i) => b.rank === i + 1));
  started = Date.now();
  const bigInsights = generateInsights(bigAnalysis, bigAnalysis.brands[0], bigDataset.capabilities);
  check('the rule engine runs at scale', bigInsights.length > 0, `${((Date.now() - started) / 1000).toFixed(2)}s, ${bigInsights.length} findings`);
  check(
    'a 12,000-brand dropdown is capped rather than rendered whole',
    brandOptions(bigAnalysis, bigAnalysis.brands[0].name).options.length <= 251,
    `${brandOptions(bigAnalysis, bigAnalysis.brands[0].name).options.length} options, ${brandOptions(bigAnalysis, bigAnalysis.brands[0].name).truncated.toLocaleString('en-IN')} hidden`,
  );
  check(
    'a brand outside the cap is still selectable when focused',
    brandOptions(bigAnalysis, bigAnalysis.brands[11999].name).options.some((b) => b.name === bigAnalysis.brands[11999].name),
  );

  // A file denominated in crores: values look tiny until the unit is set.
  const croreCsv = [
    'BRAND_NAME,COMP_NAME,SEGMENT,MAT_VAL,PREV_MAT_VAL',
    'Alpha,Acme,Derm,198,172',
    'Beta,Acme,Derm,186,173',
    'Gamma,Zeta,Derm,174,140',
  ].join('\n');
  const croreRaw = await parseFile(new File([croreCsv], 'crores.csv'));
  const croreMappings = mapColumns(croreRaw);
  const asRupees = buildDataset({ raw: croreRaw, mappings: croreMappings });
  check('a total too small to be rupees is flagged', asRupees.valueUnitUncertain, `${(asRupees.rows.reduce((s, r) => s + (r.matValue ?? 0), 0) / 1e7).toFixed(4)} Cr`);
  check('and raised in data health', asRupees.health.issues.some((i) => i.id === 'value-unit'));
  check('MATLens does not silently rescale', asRupees.valueScale === 1);

  const asCrores = buildDataset({ raw: croreRaw, mappings: croreMappings, valueScale: 1e7 });
  const rupeeAnalysis = analyse(asRupees.rows);
  const croreAnalysis = analyse(asCrores.rows);
  check('setting the unit rescales absolute values', Math.abs(croreAnalysis.market.totalValue - 558 * 1e7) < 1, `${(croreAnalysis.market.totalValue / 1e7).toFixed(0)} Cr`);
  check('the flag clears once the unit is set', !asCrores.valueUnitUncertain);
  check(
    'growth is unchanged by the unit — it is a ratio',
    near(croreAnalysis.market.growthPct, rupeeAnalysis.market.growthPct ?? 0, 1e-9),
  );
  check(
    'share is unchanged by the unit',
    near(croreAnalysis.brands[0].sharePct, rupeeAnalysis.brands[0].sharePct ?? 0, 1e-9),
  );
  check('unit sales are never rescaled', asCrores.rows.every((r) => r.matUnits === null));

  // Rows finer than brand are described, not mistaken for duplicates.
  const skuCsv = [
    'BRAND,COMPANY,SKU,SEGMENT,MAT_VAL,PREV_MAT_VAL',
    'Alpha,Acme,10mg,Derm,500000,400000',
    'Alpha,Acme,20mg,Derm,300000,250000',
    'Alpha,Acme,20mg,Derm,300000,250000',
  ].join('\n');
  const skuDataset = await (async () => {
    const raw = await parseFile(new File([skuCsv], 'sku.csv'));
    return buildDataset({ raw, mappings: mapColumns(raw) });
  })();
  check('SKU-level rows are not misreported as duplicates', skuDataset.health.issues.some((i) => i.id === 'finer-grain'));
  check('a genuinely identical row still is', skuDataset.health.duplicateRows === 1, `${skuDataset.health.duplicateRows} duplicate(s)`);

  /* ---------------------------------------------------------------- */
  heading('14. Streaming XLSX reader — the path large workbooks take');

  check('the platform supports streaming decompression', canStreamXlsx());

  // A workbook written by SheetJS, then read back by the streaming reader. The two
  // must agree exactly: same headers, same rows, same values, same types.
  const XLSX = await import('xlsx');
  const trickyRows = [
    { BRAND_NAME: 'Alpha & Co', COMP_NAME: 'Acme <Pharma>', SEGMENT: 'Derm', MAT_VAL: 1234567.89, PREV_MAT_VAL: 1000000 },
    { BRAND_NAME: 'Beta "Quoted"', COMP_NAME: 'Zeta', SEGMENT: 'Derm', MAT_VAL: 0, PREV_MAT_VAL: 5 },
    { BRAND_NAME: 'Gamma — dash', COMP_NAME: 'Zeta', SEGMENT: 'Cardio', MAT_VAL: 42, PREV_MAT_VAL: null },
    { BRAND_NAME: 'Delta ünïcode', COMP_NAME: '', SEGMENT: 'Cardio', MAT_VAL: -17.5, PREV_MAT_VAL: 20 },
  ];
  for (let i = 0; i < 2500; i += 1) {
    trickyRows.push({
      BRAND_NAME: `Brand ${i}`,
      COMP_NAME: `Company ${i % 50}`,
      SEGMENT: `Segment ${i % 7}`,
      MAT_VAL: 1000 + i,
      PREV_MAT_VAL: 900 + i,
    });
  }
  const columnsOrder = ['BRAND_NAME', 'COMP_NAME', 'SEGMENT', 'MAT_VAL', 'PREV_MAT_VAL'];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(trickyRows, { header: columnsOrder }), 'Master Data');
  const workbookBytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const workbookFile = new File([workbookBytes], 'roundtrip.xlsx');

  const streamed = await readXlsxStreaming(workbookFile);
  check('streaming reader finds the sheet by name', streamed.sheetName === 'Master Data', String(streamed.sheetName));
  check('streaming reader reads every row', streamed.rows.length === trickyRows.length, `${streamed.rows.length} of ${trickyRows.length}`);
  check('streaming reader reads every column', streamed.columns.join(',') === columnsOrder.join(','), streamed.columns.join(','));

  const sheetJsTable = await parseFile(new File([workbookBytes], 'roundtrip-sheetjs.xlsx'));
  check('row counts agree with SheetJS', streamed.rows.length === sheetJsTable.rows.length, `${streamed.rows.length} vs ${sheetJsTable.rows.length}`);
  const mismatches = streamed.rows.filter((row, index) => {
    const other = sheetJsTable.rows[index];
    return columnsOrder.some((column) => String(row[column] ?? '') !== String(other?.[column] ?? ''));
  });
  check('every cell agrees with SheetJS', mismatches.length === 0, `${mismatches.length} mismatched row(s)`);

  check('ampersands and angle brackets survive', String(streamed.rows[0].BRAND_NAME) === 'Alpha & Co' && String(streamed.rows[0].COMP_NAME) === 'Acme <Pharma>');
  check('quotes survive', String(streamed.rows[1].BRAND_NAME) === 'Beta "Quoted"');
  check('non-ASCII survives', String(streamed.rows[3].BRAND_NAME) === 'Delta ünïcode');
  check('a genuine zero is kept, not treated as blank', streamed.rows[1].MAT_VAL === 0);
  check('negatives and decimals survive', streamed.rows[3].MAT_VAL === -17.5 && streamed.rows[0].MAT_VAL === 1234567.89);
  check('an empty cell reads as blank, not as a neighbour', String(streamed.rows[3].COMP_NAME ?? '') === '');

  const streamedDataset = buildDataset({ raw: streamed, mappings: mapColumns(streamed) });
  check('a streamed workbook flows through the whole pipeline', analyse(streamedDataset.rows).brands.length > 0);

  /* ---------------------------------------------------------------- */
  heading('15. Period-aware column mapping — multi-period basefiles');

  check('a month-year header is recognised', headerPeriod('Mar-26 MAT Sales Value')?.label === 'Mar-26');
  check('a spelled-out month is recognised', headerPeriod('MAT August 2026 Value')?.label === 'Aug-26');
  check('a fiscal-year header is recognised', headerPeriod('FY24 Sales')?.label === 'FY24');
  check('a header with no period returns nothing', headerPeriod('Brand Name') === null);
  check('periods sort chronologically', (headerPeriod('Mar-26')?.key ?? 0) > (headerPeriod('Mar-25')?.key ?? 0));

  // The shape of a real basefile: five MAT periods for value and for units, plus
  // YTD and monthly series that must not be mistaken for the MAT series.
  const basefileHeaders = [
    'Brand', 'Company', 'Therapy', 'Class', 'SKU', 'SKU Launch Date',
    'Mar-22 MAT Sales Value', 'Mar-23 MAT Sales Value', 'Mar-24 MAT Sales Value',
    'Mar-25 MAT Sales Value', 'Mar-26 MAT Sales Value',
    'Mar-22 MAT Sales Unit', 'Mar-25 MAT Sales Unit', 'Mar-26 MAT Sales Unit',
    'Mar-25 APR YTD Sales Value', 'Mar-26 APR YTD Sales Value',
    'Jan-26 Sales Value', 'Feb-26 Sales Value',
  ];
  const basefileRows = Array.from({ length: 30 }, (_, i) => {
    const row: Record<string, unknown> = {
      Brand: `Brand ${i}`,
      Company: `Company ${i % 5}`,
      Therapy: 'DERMATOLOGY',
      Class: 'ANTIFUNGALS',
      SKU: `${i} 10mg`,
      'SKU Launch Date': '2019-04-01',
    };
    for (const header of basefileHeaders.slice(6)) row[header] = 100 + i;
    return row;
  });
  const basefileMappings = mapColumns({ fileName: 'basefile.csv', columns: basefileHeaders, rows: basefileRows });
  const mappedTo = (field: string) => basefileMappings.find((m) => m.field === field)?.sourceColumn ?? null;

  check('the most recent MAT value period becomes MAT Value', mappedTo('matValue') === 'Mar-26 MAT Sales Value', String(mappedTo('matValue')));
  check('the one before it becomes Previous MAT Value', mappedTo('prevMatValue') === 'Mar-25 MAT Sales Value', String(mappedTo('prevMatValue')));
  check('the most recent MAT unit period becomes MAT Units', mappedTo('matUnits') === 'Mar-26 MAT Sales Unit', String(mappedTo('matUnits')));
  check('the one before it becomes Previous MAT Units', mappedTo('prevMatUnits') === 'Mar-25 MAT Sales Unit', String(mappedTo('prevMatUnits')));
  check(
    'earlier periods are set aside, not left competing',
    ['Mar-22 MAT Sales Value', 'Mar-23 MAT Sales Value', 'Mar-24 MAT Sales Value'].every(
      (column) => basefileMappings.find((m) => m.sourceColumn === column)?.field === null,
    ),
  );
  check(
    'and the reason says why',
    /Earlier value period/.test(basefileMappings.find((m) => m.sourceColumn === 'Mar-22 MAT Sales Value')?.reason ?? ''),
    basefileMappings.find((m) => m.sourceColumn === 'Mar-22 MAT Sales Value')?.reason,
  );
  check('a YTD series does not displace the MAT series', mappedTo('matValue') !== 'Mar-26 APR YTD Sales Value');
  check('a per-row launch date is not mistaken for the MAT period', mappedTo('period') !== 'SKU Launch Date', String(mappedTo('period')));
  check('"Brand" wins over "SKU" for the brand field', mappedTo('brand') === 'Brand', String(mappedTo('brand')));

  /* ---------------------------------------------------------------- */
  heading('16. Molecule detection and the Molecule Explorer');

  // A basefile that hides the molecule behind an opaque header. PharmaTrac names
  // the hierarchy Super Group > Sub Super Group > Sub Group, and the lowest level
  // is the molecule — which no header-matching rule can know.
  const hierarchyHeaders = ['Super Group', 'Sub Super Group', 'Sub Group', 'Brand', 'Company', 'Class', 'Mar-26 MAT Sales Value', 'Mar-25 MAT Sales Value'];
  const hierarchyValues: Record<string, string[]> = {
    'Super Group': ['RESPIRATORY', 'VITAMINS', 'SEX STIMULANTS'],
    'Sub Super Group': ['SYSTEMIC ANTIHISTAMINES', 'ANTI-ASTHMA AND COPD PRODUCTS', 'ERECTILE DYSFUNCTION PRODUCTS'],
    'Sub Group': ['SILDENAFIL', 'LEVOCETIRIZINE', 'MONTELUKAST + LEVOCETIRIZINE', 'ATORVASTATIN', 'AMOXICILLIN + CLAVULANIC ACID'],
    Brand: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'],
    Company: ['FDC LTD.', 'AGLOWMED PHARMACEUTICALS LTD.', 'BESTOCHEM'],
    Class: ['UROLOGICALS', 'SYSTEMIC ANTIHISTAMINES', 'ANTI-ASTHMA AND COPD PRODUCTS'],
  };
  const hierarchyRows = Array.from({ length: 40 }, (_, i) => {
    const row: Record<string, unknown> = {};
    for (const header of hierarchyHeaders) {
      row[header] = hierarchyValues[header]
        ? hierarchyValues[header][i % hierarchyValues[header].length]
        : 1000 + i * (header.startsWith('Mar-26') ? 2 : 1);
    }
    return row;
  });
  const hierarchyMappings = mapColumns({ fileName: 'hierarchy.csv', columns: hierarchyHeaders, rows: hierarchyRows });
  const mappedFrom = (column: string) => hierarchyMappings.find((m) => m.sourceColumn === column)?.field ?? null;

  check('a molecule column with an opaque header is found by its values', mappedFrom('Sub Group') === 'molecule', String(mappedFrom('Sub Group')));
  check('and the mapping explains why', /values look like molecule/i.test(hierarchyMappings.find((m) => m.sourceColumn === 'Sub Group')?.reason ?? ''));
  check('the therapeutic levels above it are not mistaken for molecules', mappedFrom('Super Group') !== 'molecule' && mappedFrom('Sub Super Group') !== 'molecule');
  check('brand and company are unaffected', mappedFrom('Brand') === 'brand' && mappedFrom('Company') === 'company');

  // Combination molecules and INN stems, and the things that must NOT match.
  const notMolecules = ['UROLOGICALS', 'SYSTEMIC ANTIHISTAMINES', 'North', 'South', 'GENERICS', 'SELECT'];
  const notMoleculeMapping = mapColumns({
    fileName: 'plain.csv',
    columns: ['Zone', 'Brand', 'MAT_VAL'],
    rows: notMolecules.map((v, i) => ({ Zone: v, Brand: `B${i}`, MAT_VAL: 100 + i })),
  });
  check(
    'ordinary category text is not mistaken for molecules',
    notMoleculeMapping.find((m) => m.sourceColumn === 'Zone')?.field !== 'molecule',
    String(notMoleculeMapping.find((m) => m.sourceColumn === 'Zone')?.field),
  );

  // The screen itself, against a dataset that has molecules and one that does not.
  const moleculeDataset = buildDataset({
    raw: { fileName: 'hierarchy.csv', columns: hierarchyHeaders, rows: hierarchyRows },
    mappings: hierarchyMappings,
  });
  check('a hierarchy file builds a usable dataset', moleculeDataset.rows.length === 40 && moleculeDataset.capabilities.hasMolecule);

  const moleculeHtml = renderPage('molecules', moleculeDataset);
  check('Molecule Explorer renders with molecules present', moleculeHtml.includes('Molecule scorecard'), `${moleculeHtml.length} chars`);
  check('it names the competitive question', moleculeHtml.includes('Is the molecule the problem, or the brand?'));
  check('it lists brands competing on the molecule', /Brands on /.test(moleculeHtml));

  const withoutMolecule = await (async () => {
    const csv = ['BRAND,COMPANY,SEGMENT,MAT_VAL,PREV_MAT_VAL', 'Alpha,Acme,Derm,500000,400000', 'Beta,Zeta,Derm,300000,320000'].join('\n');
    const raw = await parseFile(new File([csv], 'no-molecule.csv'));
    return buildDataset({ raw, mappings: mapColumns(raw) });
  })();
  check('a file with no molecule column reports the capability as absent', !withoutMolecule.capabilities.hasMolecule);
  const noMoleculeHtml = renderPage('molecules', withoutMolecule);
  check(
    'and the screen explains itself instead of rendering empty',
    noMoleculeHtml.includes('Molecule analysis is unavailable') && noMoleculeHtml.includes('Sub Group'),
  );

  const demoMoleculeHtml = renderPage('molecules', demo);
  check('Molecule Explorer renders on the demo dataset', demoMoleculeHtml.includes('Molecule scorecard'));
  check('and compares molecules within the class', demoMoleculeHtml.includes('Molecule versus molecule in'));

  /* ---------------------------------------------------------------- */
  const { runClientChecks } = await import('./clientCheck');
  await runClientChecks(check, heading);

  /* ---------------------------------------------------------------- */
  console.log(`\n${'='.repeat(64)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log('='.repeat(64));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('\nHarness crashed:', error);
  process.exit(1);
});
