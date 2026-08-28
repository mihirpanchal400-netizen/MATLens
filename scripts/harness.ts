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
import { analyse, applyFilters } from '../src/analytics/analyse';
import { generateInsights, opportunitiesFrom } from '../src/analytics/insightEngine';
import { buildDataset } from '../src/data/buildDataset';
import { mapColumns } from '../src/data/columnMapper';
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
