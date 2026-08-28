# Changelog

All notable changes to MATLens are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
