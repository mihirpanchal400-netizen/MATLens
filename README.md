# MATLens

### From Market Data to Brand Decisions.

A pharmaceutical market-data intelligence prototype. Upload a MAT extract — or open the synthetic
demo — and MATLens works out what the file can support, calculates the comparisons that decide
whether a number is good, and states what each one may mean, with the arithmetic attached and the
causes left as questions.

Runs entirely on your machine. No backend, no account, no AI API key.

```bash
npm install
npm run dev
```

---

## The problem

A Brand Manager receives a MAT extract. It has eight thousand rows and thirty columns, and it
contains the answer to every question they have. It answers none of them.

The spreadsheet says *Brand A: MAT ₹186 Cr, growth +7.2%*. It does not say whether +7.2% is good.
It does not say that the market grew 14.3%, that the brand's share fell, that it slipped from #1
to #2, that its own molecule is growing at 20.6%, or that the region growing fastest is the one
where it is weakest. All of that is *in* the file. None of it is *visible* in the file.

The gap is not a data gap. It is an interpretation gap, and it gets closed manually — pivot table
by pivot table — every month, by someone who should be making decisions instead.

## Product hypothesis

> If a tool performs the specific comparisons that turn a market number into a verdict, and shows
> its working, a Brand Manager will trust it enough to start from its output rather than from a
> blank pivot table.

Two commitments follow from that, and they shape everything in the codebase:

1. **Deterministic calculations first, interpretation second.** No model computes a number here.
   Every figure comes from a published formula the user can read on screen.
2. **Never present speculation as fact.** The product separates what the data *shows* from what it
   *may mean*, and ends every finding with a question rather than an answer — because the evidence
   that would answer it is not in a MAT file.

## Target user

**Primary:** Pharmaceutical Brand Manager / Product Manager — owns a brand's performance and has to
explain it monthly.

**Secondary:** Product Executive, Marketing Manager, Commercial Analyst, Business Analyst, and
pharma MBA students learning to read a market.

## Solution

The product loop:

```
RAW DATA → UNDERSTAND → ANALYSE → IDENTIFY SIGNAL → EXPLAIN → INVESTIGATE → BRAND DECISION
```

Nine screens, each answering one question:

| Screen | The question it answers |
|---|---|
| **Overview** | What is happening, what changed, what needs attention? |
| **Market Landscape** | How big is the category, who is in it, and where is it growing? |
| **Brand Performance** | Is my brand winning or losing, and against what benchmark? |
| **Competitor Intelligence** | Who is gaining, who is losing, and who is worth watching? |
| **Opportunity Signals** | Where is growth available that my brand is not capturing? |
| **Insight Center** | What should I pay attention to, ranked, with the evidence? |
| **Data Explorer** | What is in the file, and how was every derived number calculated? |
| **Upload Data** | What did MATLens understand from my file, and is it right? |
| **Methodology** | Every formula, threshold, rule and limitation, in full. |

## Key features

**Data-understanding engine.** MAT extracts never share a header convention. `MAT_VAL`,
`MAT Value (INR)`, `Value Sales`, `MAT_SALES` all mean the same thing; `PREV_MAT_VAL` and
`MAT Value LY` mean something else entirely. MATLens scores every column against a field dictionary,
confirms the guess against the column's actual values, resolves conflicts globally so two columns
cannot claim the same field, and then shows you what it decided, why, and how confident it is —
with a dropdown to correct it. Correcting a mapping rebuilds the entire analysis instantly.

**Honest validation.** Missing values, non-numeric cells, duplicate dimension combinations,
negative sales, impossible percentages, zero growth bases and empty columns are all detected and
reported with row numbers. Rows that cannot be analysed are excluded loudly, never silently, and
nothing is ever imputed.

**Graceful degradation.** No previous period? Growth, share change, rank movement and every
momentum signal are *withheld and explained* rather than approximated. No region column? Regional
signals disappear and the product says why. A dataset's limitations are surfaced as first-class
findings, because "you cannot know this from this file" is itself useful to a Brand Manager.

**Deterministic analytics.** Growth, share, previous share, share change, rank, rank change,
contribution to market growth, unit growth, price/mix effect, HHI, CR4 and regional concentration.
Growth against a zero base returns nothing rather than infinity. Contribution to a shrinking market
is withheld because the ratio inverts its sign and misleads.

**A rule engine, not hard-coded insights.** Fifteen rules read the analysis object and emit
structured findings. Each carries a signal, an interpretation, a business implication, an
investigation question, its evidence, and its formula. Thresholds are published on the Methodology
screen, and the Opportunity Signals screen shows which rules *did not* fire — a silent rule is a
result, not an omission.

**Provenance labelling.** Every statement in the UI is tagged **Observed data**, **Derived metric**,
**Interpretation** or **Hypothesis**. The distinction is visible, not implied.

## Analytical framework

The core move is the **growth gap**. A growth number alone decides nothing; a growth number against
its market decides everything.

```
Growth %                 = (Current MAT − Previous MAT) ÷ Previous MAT × 100
Market Share %           = Brand MAT Value ÷ Total Market MAT Value × 100
Previous Share %         = Previous Brand MAT ÷ Previous Total Market MAT × 100
Share Change (pp)        = Current Share % − Previous Share %
Growth Gap (pp)          = Brand Growth % − Market Growth %
Rank                     = position when brands are ordered by MAT value, highest first
Rank Change              = Previous Rank − Current Rank          (positive = moved up)
Contribution to Growth % = Brand absolute change ÷ Market absolute change × 100
Unit Growth %            = (Current Units − Previous Units) ÷ Previous Units × 100
Price / Mix effect (pp)  ≈ Value Growth % − Unit Growth %
HHI                      = Σ (brand share %)²
CR4                      = combined share % of the four largest brands
Regional concentration % = Brand value in its largest region ÷ Brand total value × 100
```

Share, rank and market totals are always computed **within the rows currently in scope**, so an
active filter changes the denominator — and the interface says so on screen when it does.

## The insight engine

Rules are data, not UI. No screen hard-codes a finding.

| Rule | Fires when |
|---|---|
| Brand versus market growth | \|Brand growth − Market growth\| ≥ 2 pp |
| Market share movement | \|Share change\| ≥ 0.15 pp |
| Rank movement | Current rank ≠ previous rank |
| Competitor momentum | Competitor share ≥ 1% and growth ≥ brand growth + 5 pp |
| Molecule opportunity | Molecule growth ≥ brand growth + 5 pp |
| Segment opportunity | Fastest segment growth ≥ market growth + 5 pp |
| Regional opportunity | Fastest region growth ≥ market growth + 3 pp |
| Regional concentration | Top region > 1.6× an even split of the brand's value |
| Emerging competitor | Growth ≥ 35% with share between 0.15% and 3% |
| Vulnerable incumbent | Share ≥ 1% with negative growth in a growing market |
| Growth capture gap | \|Share of market growth − share of market\| ≥ 1 pp |
| Value versus volume | \|Value growth − Unit growth\| ≥ 4 pp |
| High-growth niche | Molecule share < 6% and growth ≥ market growth + 10 pp |
| Market structure | At least 5 brands in scope |
| Data limitations | Any canonical field missing from the mapping |

Every finding is shaped the same way:

> **🔴 SHARE LOSS**
>
> **Signal** — Share moved from 5.88% to 5.53% within the current selection, a change of −0.35 pp.
>
> **Interpretation** — Share is a relative measure: it can fall while sales rise. This movement
> means the rest of the market grew faster than the brand did.
>
> **Business implication** — Relative market position is weakening.
>
> **Investigate** — Which competitor gained share over the same period, and in which segment or
> region did the switch happen?
>
> **Evidence** — Previous share 5.88% · Current share 5.53% · Share change −0.35 pp · Market growth +14.3%
>
> **Calculation** — Share Change (pp) = Current Market Share % − Previous Market Share %

Note what is absent: any claim about *why*. A MAT file cannot support one.

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React 18 + Vite 5 | Fast local dev, no server needed |
| Language | TypeScript (strict) | The domain has many nullable metrics; the compiler enforces handling them |
| Styling | Hand-written CSS with design tokens | Full control over a restrained, corporate visual system; no framework version risk |
| Charts | Recharts | Lightweight, composable, SVG-based |
| Excel | Streaming reader (own), SheetJS for small files | No 512 MB sheet ceiling; SheetJS stays for ordinary workbooks |
| CSV | Papa Parse | Tolerant of real-world exports |
| Backend | None | Files are parsed in the browser and never leave the machine |
| Large files | Native `DecompressionStream` + ZIP reader | No third-party dependency; ExcelJS powers the optional CLI converter |
| AI | None | Every calculation and every rule is deterministic |

Colour is not decoration: the categorical chart palette is a validated, colour-vision-deficiency-safe
sequence, assigned in fixed slot order, with a separate reserved status palette and a UI accent that
is never used as a data series.

```
src/
  analytics/    metrics.ts · analyse.ts · insightEngine.ts     ← all arithmetic and all rules
  charts/       chartTheme · HBarChart · MomentumScatter
  components/   Icon · ui · DataTable · InsightCard · FilterBar · NoDataState · ErrorBoundary
  data/         fields · columnMapper · buildDataset · parseFile · demoGenerator · demoDataset
  layouts/      AppShell
  pages/        Overview · MarketLandscape · BrandPerformance · CompetitorIntelligence
                OpportunitySignals · InsightCenter · DataExplorer · UploadData · Methodology · Landing
  state/        AppState.tsx                                   ← one analysis, shared by every screen
  styles/       tokens.css · app.css
  types/        the domain model
scripts/        generate-demo-files · harness · renderCheck · clientCheck · verify
public/demo-data/  five synthetic files
```

## Demo dataset

**Entirely synthetic.** Brand names, company names and every number were invented for this
prototype. Nothing derives from IQVIA, AWACS, SMSRC, PharmaTrac or any other market audit, and no
real company's performance is represented. Molecule names are real generic ingredients — public
pharmacological vocabulary — and their association with these invented brands is fictional. The
generator is seeded, so the demo tells the same story every time you open it.

An Indian dermatology market, MAT Aug 2026: **288 rows · 64 brands · 26 companies · 29 molecules ·
6 segments · 5 regions · ₹3,361 Cr, growing 14.3%.**

The focus brand, **Soranil**, is deliberately built around a story a Brand Manager would recognise:

- Grew **+7.5%** — which reads as fine, until you see the market grew **+14.3%**. Gap: **−6.8 pp**.
- Share fell from 5.88% to **5.53%** (−0.35 pp) and it slipped from **#1 to #2**, overtaken by Dermazol.
- Its own molecule, **Luliconazole**, grew **+20.6%** — the demand was there; the brand did not capture it.
- **Fungiclear**, on the same molecule, grew **+27.4%** and gained share.
- **South** is the fastest-growing region at +20.1% — and is where Soranil is weakest, taking just
  13% of its value there. **North** carries 34% of the brand.

Four further files exist to prove the ingestion path rather than the analysis:

| File | What it tests |
|---|---|
| `matlens_demo_verbose_headers.csv` | Full-word headers with units in brackets — must produce identical totals |
| `matlens_demo_growth_only.csv` | Growth column but no previous value — previous period is reconstructed and flagged |
| `matlens_demo_current_only.csv` | No history at all — every momentum metric withheld and explained |
| `matlens_demo_messy.csv` | Blanks, duplicates, text in numeric columns, negatives, a zero base, an impossible share |

They are loadable from the Upload Data screen with one click.

## How to run

```bash
npm install       # install dependencies
npm run dev       # start the dev server (http://localhost:5173)
npm run build     # typecheck and build for production
npm run preview   # serve the production build
npm run verify    # run the full verification suite (197 checks)
npm run gen:demo  # regenerate the synthetic files in public/demo-data
npm run convert   # convert a large basefile into a MATLens-ready CSV (see below)
```

Requires Node 18 or newer. Nothing else — no database, no API keys, no environment file.

### Verification

`npm run verify` bundles the real application modules with esbuild and drives them on Node:

1. Demo dataset builds; all 11 columns map at high confidence
2. Analytics checked against an independent recomputation — shares sum to 100%, share changes sum to
   zero, growth contributions sum to 100%, ranks are contiguous, segment and region totals reconcile
3. Filters recompute the denominator correctly
4. All 14 applicable rules fire on the demo data, and the data-limitation rule stays silent
5. `.xlsx` upload produces identical totals to the in-memory demo
6–9. Each of the four variants: verbose headers, reconstructed previous period, withheld metrics,
   and messy-file validation
10. Error handling for empty, unsupported, header-only and non-tabular files
11. Server-side render of all 9 screens against 3 very different datasets
12. A jsdom walkthrough of the real app: load demo → visit every screen → switch focus brand →
    apply and clear a filter → open a calculation modal, asserting **no console errors**
13. Scale: a 60,000-row CSV parsed and analysed with integrity intact, a 12,000-brand dropdown capped
    rather than rendered whole, a crore-denominated file flagged and rescaled, and SKU-level rows
    distinguished from genuine duplicates
14. The streaming XLSX reader against SheetJS on the same workbook - every row, every cell, with
    entities, quotes, non-ASCII, genuine zeros, negatives and empty cells compared
15. Period-aware mapping on a basefile shape: latest MAT period as current, the one before as
    comparison, earlier periods set aside, YTD series not displacing MAT

## Large basefiles

**A full market basefile opens directly in the app.** No pre-processing, no conversion step.

That is not free, because there is a hard limit in the way:

> **JavaScript caps a string at 512 MB.** Every ordinary spreadsheet parser decompresses a worksheet
> into one string, so past that ceiling it cannot read the sheet at all — and SheetJS drops such a
> sheet *silently*: it stays in the workbook's sheet list but never materialises, so the failure
> arrives as a mystery rather than an error.

A real example: a 211 MB PharmaTrac IPM basefile — 98,249 SKU rows x 180 columns — decompresses to a
672 MB worksheet, 129 MB past the wall.

MATLens therefore ships its own streaming reader (`src/data/xlsxStream.ts`), used automatically for
workbooks over 20 MB. It:

1. reads the ZIP central directory straight off the `File`, so nothing unneeded is loaded;
2. inflates one archive entry at a time through the platform's native `DecompressionStream`;
3. scans the sheet XML with a purpose-built scanner that holds only the current row, so the sheet is
   never a string and the ceiling never applies;
4. projects very wide exports down to what can be analysed, reporting exactly what it kept and skipped.

On that 211 MB basefile, in the browser:

| | |
|---|---|
| Parse | **23 seconds**, 98,249 rows |
| Columns | 27 retained, 153 monthly/quarterly/YTD columns read past |
| Understand + validate | 1.1 s |
| Analyse | 0.5 s — 60,512 brands, 828 companies, 17 therapies, 99 segments |
| Peak memory | ~550 MB |

It is async throughout, so the interface keeps painting progress while it reads, and it runs unchanged
on Node — which is how it is tested: the same workbook is written with SheetJS, read back with the
streaming reader, and every cell compared.

### Multi-period files

A basefile carries the same measure for several years — five MAT value columns and five MAT unit
columns is normal. The mapper reads the period out of each header (`Mar-26 MAT Sales Value`,
`MAT August 2026`, `FY24`) and assigns **the most recent period as the current one and the one before
it as the comparison**, setting earlier periods aside with the reason shown in the mapping table. A
year-to-date or monthly series never displaces the MAT series. To compare a different pair of years,
map them by hand — the whole analysis rebuilds instantly.

### Value units

Market audits are frequently denominated in thousands, lakhs or crores rather than rupees — that IPM
basefile is in crores, where reading the numbers as rupees understates the market by seven orders of
magnitude. MATLens flags a total too small to plausibly be a pharmaceutical market and shows what the
market would total under each unit, so the right one is obvious. It never guesses on your behalf.
Growth, share and rank are ratios and are unaffected; unit sales are never rescaled.

### The command-line converter

`npm run convert` remains for pre-processing a file once — useful when you repeatedly analyse one
therapy area, and the only route on a browser without `DecompressionStream`:

```bash
npm run convert -- --in "C:\path\to\BASEFILE.xlsx" --list
npm run convert -- --in "C:\path\to\BASEFILE.xlsx" --therapy DERMATOLOGY
```

It streams the workbook with ExcelJS and writes a slim CSV: on the same basefile, 9 MB and 65,825
brand-level rows in about 50 seconds. Everything runs locally; nothing is uploaded.

## Screenshots

Run `npm run dev` and click **Explore demo dataset** — the whole product is populated in one click.
The demonstration path is: Overview → select a brand → Brand Performance → Competitor Intelligence →
Opportunity Signals → Insight Center → open *How was this calculated?* → Data Explorer → upload your
own file.

## Privacy & ethics

- Files are parsed **in your browser**. Nothing is uploaded, and no account is required.
- **No patient-level data** and **no personally identifiable information** is needed — brand-level
  MAT is enough.
- The demo dataset is **synthetic** and is labelled as such on every screen it appears on.
- MATLens is an **analytical prototype** that supports commercial judgement. It does not replace it.
- It provides **no medical, clinical or prescribing advice** and makes no clinical decisions.
- It makes **no claim of compliance** with any regulatory or data-protection framework.
- `.gitignore` excludes uploaded and private data files. Do not commit confidential market data.

## Limitations

- MAT is a moving annual total: it smooths seasonality and therefore lags turning points by design.
- Two data points cannot establish a trend. Every finding compares one period to one prior period.
- Correlation in a market extract is not causation. MATLens names movements, never their causes.
- Share and rank are computed within the loaded rows. A partial extract yields a partial market.
- Share changes sum to zero only when every brand has a previous period; new entrants make the total
  slightly negative, which is arithmetic rather than error.
- Very wide exports are projected to dimension and MAT columns; monthly, quarterly and YTD series
  are not retained. The skipped columns are listed on the Upload screen.
- Value data cannot separate price, pack mix and volume without unit data — and only approximates
  the split with it.
- Stock movements, returns, tender timing and channel shifts are invisible unless the file contains them.
- Thresholds are reasonable defaults, not empirically validated constants. They are published so
  they can be argued with.

## Future roadmap

**v2** — YTD and MTD alongside MAT · regional deep-dives · brand review export (PDF/PPT) · saved
mapping profiles so a recurring monthly extract maps itself.

**v3** — Sales-force and field-coverage data · campaign performance · launch tracking ·
cross-dataset joins so a signal in market data can be tested against internal data.

**v4** — An LLM layer that *phrases* structured findings more naturally while remaining architecturally
barred from computing them · scenario analysis · brand-plan support.

## Product management learnings

**Choosing what not to build was the highest-leverage decision.** "Upload anything and ask AI
questions" was the obvious feature and the wrong one: it would have made every answer unverifiable
in a domain where being confidently wrong costs more than being silent. Constraining the product to
MAT market data made a rule engine possible, and a rule engine is auditable in a way a chatbot is not.

**The differentiator was a comparison, not a technology.** The entire product rests on one line —
brand growth minus market growth. Everything else exists to make that line trustworthy: the column
mapper so the inputs are right, the validator so the rows are right, the formula display so the
arithmetic is checkable, the thresholds so the interpretation is not arbitrary.

**Absence of data is a feature surface.** The first instinct was to hide unavailable metrics. Showing
*why* a metric is missing turned out to be more useful than the metric would have been — it tells the
user what to ask their data team for. The data-limitation rule that fires as a first-class finding
came directly out of that.

**Hedged language is a product decision, not a writing style.** "May indicate", "could suggest",
"worth investigating" are enforced across every rule because a tool that asserts causes teaches its
user to stop looking for them. Ending each insight with a question keeps the human doing the part
only a human can do.

**Trust is built by showing the working.** *How was this calculated?* on every insight, the
confidence level on every column mapping, the published threshold table, and the list of rules that
were evaluated and did **not** fire — each exists because an analyst who cannot audit a number will
not act on it.

---

*MATLens is a portfolio prototype built to demonstrate pharmaceutical commercial thinking and product
development. It is not a commercial product and is not affiliated with any pharmaceutical company or
market-data provider.*
