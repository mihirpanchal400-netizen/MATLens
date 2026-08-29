# Changelog

All notable changes to MATLens are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-08-29

Large workbooks now open in the app itself. The converter added in 1.1.0 was a workaround; this is
the fix.

### Added

- **Streaming XLSX reader** (`src/data/xlsxStream.ts`), used automatically for workbooks over 20 MB.
  Reads the ZIP central directory off the File, inflates entries through the platform's native
  `DecompressionStream`, and scans sheet XML row by row so the worksheet is never held as a string -
  removing the 512 MB ceiling that made these files unopenable. Handles shared strings, inline
  strings, sparse cells, ZIP64, and picks the sheet with the most data. No new dependency.
- **Column projection for very wide exports.** A 180-column basefile is mostly monthly, quarterly and
  YTD series MATLens does not analyse. Dimensions and MAT measures are retained; the rest are read
  past rather than held in memory. What was kept and what was skipped is reported on the Upload
  screen, with the skipped list expandable.
- **Period-aware column mapping.** Where a file carries the same measure for several years, the
  mapper reads the period from each header (`Mar-26 MAT Sales Value`, `MAT August 2026`, `FY24`) and
  assigns the most recent as the current period and the one before it as the comparison, setting
  earlier periods aside with the reason shown. A YTD or monthly series never displaces a MAT series.
- 27 further checks in `npm run verify` (197 total): the streaming reader compared cell-by-cell
  against SheetJS on the same workbook, and period-aware mapping on a basefile header shape.

### Changed

- Excel dispatch: workbooks over 20 MB stream; smaller ones use SheetJS and fall back to streaming if
  the sheet turns out not to have materialised. `.xls` continues to use SheetJS, as the old binary
  format is not a ZIP archive.
- Exact-alias matching now breaks ties by position in the synonym list, so a column named `Brand`
  deterministically beats one named `SKU` for the brand field.

### Fixed

- Unit columns named `Mar-26 MAT Sales Unit` were matched by no pattern and left unmapped; the unit
  synonym list now covers the `... Sales Unit` convention.
- `SKU Launch Date` was being mapped to Period. A per-row date is not the MAT period of an extract,
  and the period field now rejects launch, expiry, start and end dates.

---

## [1.1.0] - 2026-08-29

Large-file support, driven by a real 211 MB market basefile that the first release could not open.

### Added

- **Streaming basefile converter** (`npm run convert`). Streams a workbook row by row with ExcelJS
  without ever holding it in memory, auto-detects the two most recent MAT value and unit columns from
  headers like `Mar-26 MAT Sales Value`, keeps only the columns MATLens analyses, and sums SKU rows to
  brand level. Supports `--list`, `--therapy`, `--company`, `--sku-level` and `--limit`. A 211 MB,
  98,249-row x 180-column IPM basefile converts to a 9 MB, 65,825-row CSV in about 50 seconds.
- **Streaming CSV parsing** in the browser for files above 8 MB, with a live progress indicator
  showing rows read and percentage complete. The file text never becomes a single string.
- **Value-unit setting.** Market audits are often denominated in thousands, lakhs or crores. MATLens
  now flags a market total too small to be plausible, shows what the market would total under each
  unit, and lets the user choose - it never guesses. Growth, share and rank are unaffected; unit sales
  are never rescaled.
- **Brand-dropdown capping.** A national basefile can carry tens of thousands of brands, which would
  lock a native `select`. The list is capped at the 250 largest by value, always including the current
  selection, with the remainder reachable through search on Competitor Intelligence.
- Scale coverage in `npm run verify` (170 checks, up from 151): a 60,000-row CSV, dropdown capping,
  unit rescaling, and SKU-level grain versus true duplicates.

### Changed

- Upload limit raised from 30 MB to 500 MB, and the limit is now explained in terms of what actually
  binds: JavaScript's 512 MB maximum string length.
- Duplicate detection now compares **every source column**. Previously, SKU-level rows that differed
  only in an unmapped column were wrongly reported as duplicates; they are now described as a finer
  row grain, which is what they are.
- Excel parsing selects the sheet with the most data rather than the first sheet, so a pivot or cover
  sheet placed ahead of the data no longer wins.

### Fixed

- A worksheet too large to materialise is dropped silently by the spreadsheet parser rather than
  raising an error. MATLens now detects that exact condition and explains it, instead of reporting a
  generic "could not be read".
- The converter no longer writes `0` for a brand with no previous-period data. It writes blank -
  turning "unknown" into "zero" understated growth bases across two thirds of the rows in testing.
- Rounding in the converter preserved only whole numbers, which destroyed all precision in a file
  denominated in crores. It now keeps up to six decimals.
- The value-unit warning was assembled after the data-health report and so never appeared in it.

---

## [1.0.0] — 2026-08-29

First working prototype. MAT market data in, brand decisions out, with the arithmetic visible.

### Added — data ingestion

- **File upload** for `.xlsx`, `.xls`, `.xlsm` and `.csv`, with drag-and-drop and file browse.
  Parsing happens entirely in the browser; nothing is transmitted anywhere.
- **Column-mapping engine** that resolves any reasonable header convention to fourteen canonical
  fields. Scores headers against a synonym dictionary, confirms each guess against the column's
  actual values, and resolves conflicts globally so `MAT_VAL` and `PREV_MAT_VAL` cannot both claim
  "MAT Value".
- **Mapping review and override** — every column is shown with its interpretation, its confidence
  and the reason for it, with a dropdown to correct any decision. Correcting one rebuilds the whole
  analysis.
- **Validation layer** detecting missing brands, blank and non-numeric MAT values, duplicate
  dimension combinations, negative sales, share values outside 0–100%, zero or negative growth
  bases, and entirely empty columns — each reported with affected row counts and file row numbers.
- **Capability detection.** The dataset declares what it can and cannot support, and every
  dependent metric is withheld with an explanation rather than approximated.
- **Previous-period reconstruction** from a reported growth column when no prior value exists,
  explicitly flagged as a reconstruction in both the limitations and the dataset notes.
- Header-banner tolerance for Excel exports that begin with title rows before the real header.

### Added — analytics

- Deterministic metric layer: growth, market share, previous share, share change, growth gap, rank,
  rank change, contribution to market growth, unit growth, price/mix effect, HHI, CR4 and regional
  concentration. Every function is total — it returns `null` rather than `NaN` or `Infinity`.
- Single-pass analysis producing brand, company, molecule, segment, therapy and region metrics from
  one shared object, so no two screens can disagree about a number.
- Cross-dimension filtering (therapy, segment, molecule, company, region) that recomputes market
  totals, share and rank within the selection, with an on-screen notice when a filter is active.

### Added — insight engine

- Fifteen rules emitting structured findings: signal, interpretation, business implication,
  investigation question, evidence and formula. No screen hard-codes an insight.
- Published thresholds for every rule, shown verbatim on the Methodology screen.
- Severity ranking (critical / attention / watch / positive / context) with priority ordering.
- Rule-transparency table on the Opportunity Signals screen showing which rules were evaluated and
  did **not** fire.
- Data limitations surfaced as first-class findings rather than hidden.
- Provenance labelling — observed data, derived metric, interpretation, hypothesis — applied
  throughout the interface.

### Added — screens

- **Overview** — KPI row, brand-versus-market performance snapshot, top movers by absolute value
  added, and automatically generated attention cards.
- **Market Landscape** — market structure, concentration, top brands by value, company share, and
  growth by brand, segment, molecule and region, each benchmarked against the market rate.
- **Brand Performance** — brand scorecard, growth benchmark against molecule / segment / market,
  contribution to market growth, regional performance table with per-region gaps, competitive
  position, and brand-level signals.
- **Competitor Intelligence** — sortable, searchable, exportable competitor landscape with
  rule-based flags; share-versus-growth momentum map with labelled quadrants; competitor watchlist.
- **Opportunity Signals** — signals grouped by category, geography, competition, brand and market
  structure, plus the rules-evaluated table.
- **Insight Center** — all findings, filterable by severity, each expandable into its full
  derivation.
- **Data Explorer** — analysis rows and derived brand metrics in a table with search, sort,
  pagination, column visibility and CSV export, alongside every formula in the product.
- **Upload Data** — upload, demo loader, four mapper-testing variants, dataset understanding,
  mapping review and data-health report.
- **Methodology** — provenance model, all formulas, all thresholds, the rule catalogue, the field
  dictionary, and the product's limitations and ethics.
- **Landing / empty state** — product framing, the analytical loop, and two routes in.

### Added — demo data

- Seeded synthetic Indian dermatology market: 288 rows, 64 invented brands, 26 invented companies,
  29 molecules, 6 segments, 5 regions, ₹3,361 Cr growing 14.3%. Labelled synthetic everywhere it
  appears.
- Built to demonstrate real analytical situations: relative underperformance, share loss, a rank
  flip, competitor momentum, an emerging entrant, category opportunity, regional under-indexing,
  brand concentration and price-led growth.
- Four additional variant files that deliberately break header conventions and data quality, to
  prove the mapper and validator rather than assume them.
- The demo runs through the identical ingestion pipeline as an uploaded file — nothing about the
  demo path is privileged.

### Added — engineering

- `npm run verify`: 151 checks covering the analytics against an independent recomputation, all four
  file variants, error handling, a server-side render of all nine screens against three very
  different datasets, and a jsdom walkthrough of the real app asserting no console errors.
- Error boundary around the application, with typed, actionable parse errors for empty,
  oversized, unsupported, corrupt and non-tabular files.
- Empty and unavailable states on every screen, each explaining the cause.
- Design-token CSS system; colour-vision-deficiency-safe categorical chart palette assigned in fixed
  slot order, with a reserved status palette and a UI accent never used as a data series.
- SheetJS lazy-loaded so the spreadsheet parser is fetched only when a workbook is actually opened.
- Responsive layout down to mobile widths, and a print stylesheet.

### Notes

- No backend, no account, no AI API key. Every calculation and every rule is deterministic and local.
- MATLens is an analytical prototype. It provides no medical or clinical advice and makes no
  regulatory compliance claims.
