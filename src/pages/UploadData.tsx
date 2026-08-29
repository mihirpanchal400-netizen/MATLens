import { useRef, useState } from 'react';
import { useApp } from '../state/AppState';
import { FIELD_DEFINITIONS } from '../data/fields';
import { VALUE_SCALES } from '../data/buildDataset';
import { DEMO_DESCRIPTION } from '../data/demoDataset';
import { fetchDemoFile, isLargeWorkbook, LIMITS } from '../data/parseFile';
import { Icon } from '../components/Icon';
import { Badge, type BadgeTone, Callout, Card, Formula, KpiTile, Section } from '../components/ui';
import type { Confidence, FieldKey } from '../types';
import { formatDateTime, formatValue } from '../utils/format';

const CONFIDENCE_TONE: Record<Confidence, BadgeTone> = {
  high: 'good',
  medium: 'warning',
  low: 'serious',
  none: 'neutral',
};

/** Alternative synthetic files used to prove the mapper against different exports. */
const VARIANTS = [
  { file: 'matlens_demo_verbose_headers.csv', label: 'Verbose headers', note: '"Brand Name", "Active Ingredient", "MAT Value (INR)" — full-word headers with units in brackets' },
  { file: 'matlens_demo_growth_only.csv', label: 'Growth column, no previous value', note: 'Only MAT Sales and MAT Growth % — previous period is reconstructed from the growth rate' },
  { file: 'matlens_demo_current_only.csv', label: 'Current period only', note: 'No history at all — every momentum metric is withheld and explained' },
  { file: 'matlens_demo_messy.csv', label: 'Messy export', note: 'Blank cells, duplicated rows, text in numeric columns, an impossible share value' },
];

export function UploadData() {
  const { dataset, loadFile, loadDemo, loading, progress, error, dismissError, remapColumn, setValueScale, resetMapping, goTo, clearDataset } = useApp();
  const [dragging, setDragging] = useState(false);
  const [heavyFile, setHeavyFile] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    // Large workbooks can take a while and may not be openable at all; say so up front.
    setHeavyFile(isLargeWorkbook(file) ? `${file.name} (${(file.size / 1048576).toFixed(0)} MB)` : null);
    void loadFile(file);
  };

  const loadVariant = async (fileName: string) => {
    try {
      const file = await fetchDemoFile(`${import.meta.env.BASE_URL}demo-data/${fileName}`, fileName);
      await loadFile(file);
    } catch {
      // loadFile surfaces its own errors; fetch failures are reported the same way.
    }
  };

  const mapped = dataset?.mappings.filter((m) => m.field) ?? [];
  const unmapped = dataset?.mappings.filter((m) => !m.field) ?? [];
  const usedFields = new Set(mapped.map((m) => m.field));

  return (
    <>
      <Section title="Load market data" subtitle="Excel or CSV, parsed entirely in your browser — nothing is uploaded to a server">
        <div className="grid grid--2">
          <Card>
            <div
              className={`dropzone ${dragging ? 'dropzone--over' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFiles(event.dataTransfer.files);
              }}
            >
              <div className="dropzone__icon">
                <Icon name="upload" size={44} strokeWidth={1.2} />
              </div>
              <h3 className="t-h2">Drop your Excel or CSV file here</h3>
              <p className="t-sub" style={{ margin: '6px 0 16px' }}>or</p>
              <button className="btn btn--primary" onClick={() => inputRef.current?.click()} disabled={loading}>
                {loading ? <span className="spinner" /> : <Icon name="file" size={14} />}
                {loading ? 'Reading file…' : 'Browse files'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm,.csv"
                style={{ display: 'none' }}
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <p className="t-micro" style={{ marginTop: 14 }}>
                Supported: .xlsx · .xls · .csv — up to {LIMITS.MAX_BYTES / 1048576} MB. A brand column and a MAT value
                column are the minimum; everything else is optional and simply unlocks more analysis. Large CSVs are
                streamed in chunks rather than read in one piece.
              </p>
            </div>

            {loading && progress && (
              <div style={{ marginTop: 16 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="t-micro">
                    {progress.stage === 'reading' && 'Reading file…'}
                    {progress.stage === 'parsing' && `Parsing — ${progress.rows.toLocaleString('en-IN')} rows read`}
                    {progress.stage === 'organising' && `Understanding ${progress.rows.toLocaleString('en-IN')} rows…`}
                  </span>
                  {progress.fraction > 0 && (
                    <span className="t-micro">{Math.round(progress.fraction * 100)}%</span>
                  )}
                </div>
                <div className="progress">
                  <div className="progress__bar" style={{ width: `${Math.max(4, progress.fraction * 100)}%` }} />
                </div>
                {heavyFile && (
                  <p className="t-micro" style={{ marginTop: 8 }}>
                    {heavyFile} is a large workbook. Spreadsheet files have to be decompressed whole before they can be
                    read, so this may take a minute.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title="No file to hand?" subtitle="Load synthetic data and the whole product works immediately">
            <p className="t-sub">{DEMO_DESCRIPTION}</p>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn btn--primary" onClick={loadDemo} disabled={loading}>
                <Icon name="opportunities" size={14} />
                Load demo dataset
              </button>
              {dataset && (
                <button className="btn" onClick={clearDataset}>
                  <Icon name="reset" size={14} />
                  Clear loaded data
                </button>
              )}
            </div>

            <div className="divider" />

            <div className="t-eyebrow" style={{ marginBottom: 8 }}>Test the column mapper</div>
            <p className="t-micro" style={{ marginBottom: 10 }}>
              Four synthetic files with deliberately different header conventions and defects. They exist to show what
              MATLens does when a file is not tidy.
            </p>
            <div className="stack" style={{ gap: 8 }}>
              {VARIANTS.map((variant) => (
                <button
                  key={variant.file}
                  className="btn btn--sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '8px 12px' }}
                  onClick={() => void loadVariant(variant.file)}
                  disabled={loading}
                >
                  <Icon name="file" size={13} />
                  <span>
                    <strong>{variant.label}</strong>
                    <span className="t-micro" style={{ display: 'block' }}>{variant.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <div style={{ marginBottom: 22 }}>
        <Card
          title="Working with a very large basefile"
          subtitle="Why a 200 MB market extract is not simply a bigger version of a 20 MB one"
        >
          <p className="t-sub">
            A full market basefile — every SKU in the market, five years of monthly, quarterly, YTD and MAT columns —
            can decompress to a worksheet larger than <strong>512 MB</strong>, which is JavaScript's maximum string
            length. Past that point no browser can open the sheet at all: the engine cannot hold it, and spreadsheet
            parsers drop such a sheet silently rather than failing loudly. That is a limit of the platform, not a
            setting MATLens can raise.
          </p>
          <p className="t-sub" style={{ marginTop: 10 }}>
            The repository includes a converter that streams the workbook row by row without ever holding it in memory,
            keeps only the columns MATLens analyses, and sums SKU rows to brand level. A 180-column basefile typically
            comes out a fraction of its original size and opens here instantly. Run it in your terminal:
          </p>
          <Formula>{`npm run convert -- --in "C:\path\to\BASEFILE.xlsx" --list
npm run convert -- --in "C:\path\to\BASEFILE.xlsx"
npm run convert -- --in "...xlsx" --therapy DERMATOLOGY`}</Formula>
          <p className="t-micro" style={{ marginTop: 10 }}>
            <code>--list</code> prints every column so you can see what the file holds. The plain form writes a
            MATLens-ready CSV next to the source. <code>--therapy</code> narrows it to one therapy area, which is
            usually what you actually want to analyse. Everything runs on your machine — nothing is uploaded anywhere.
          </p>
        </Card>
      </div>

      {error && (
        <div style={{ marginBottom: 22 }}>
          <Callout tone="critical" title={error.message}>
            {error.hint}
            <div style={{ marginTop: 8 }}>
              <button className="btn btn--sm" onClick={dismissError}>Dismiss</button>
            </div>
          </Callout>
        </div>
      )}

      {dataset && (
        <>
          <Section
            title="Dataset understanding"
            subtitle={`${dataset.fileName}${dataset.raw.sheetName ? ` · sheet "${dataset.raw.sheetName}"` : ''} · loaded ${formatDateTime(dataset.loadedAt)}`}
            aside={
              dataset.rows.length ? (
                <button className="btn btn--primary btn--sm" onClick={() => goTo('overview')}>
                  Continue to Overview
                  <Icon name="arrowRight" size={13} />
                </button>
              ) : undefined
            }
          >
            {dataset.isSynthetic && (
              <div style={{ marginBottom: 14 }}>
                <Callout tone="warning" title="Synthetic demonstration data">
                  Brand names, company names and every value in this dataset were invented for this prototype. It is not
                  derived from IQVIA, AWACS, SMSRC or any other market audit and represents no real company or market.
                </Callout>
              </div>
            )}

            <div className="grid grid--kpi">
              <KpiTile label="Rows in file" value={dataset.health.totalRows.toLocaleString('en-IN')} />
              <KpiTile
                label="Usable records"
                value={dataset.health.usableRows.toLocaleString('en-IN')}
                foot={dataset.health.droppedRows ? `${dataset.health.droppedRows.toLocaleString('en-IN')} excluded` : 'all rows usable'}
              />
              <KpiTile label="Brands" value={new Set(dataset.rows.map((r) => r.brand)).size.toLocaleString('en-IN')} />
              <KpiTile
                label="Companies"
                value={dataset.capabilities.hasCompany ? new Set(dataset.rows.map((r) => r.company).filter(Boolean)).size.toLocaleString('en-IN') : undefined}
                unavailableReason={dataset.capabilities.hasCompany ? undefined : 'No company column'}
              />
              <KpiTile
                label="Molecules"
                value={dataset.capabilities.hasMolecule ? new Set(dataset.rows.map((r) => r.molecule).filter(Boolean)).size.toLocaleString('en-IN') : undefined}
                unavailableReason={dataset.capabilities.hasMolecule ? undefined : 'No molecule column'}
              />
              <KpiTile label="Period" value={dataset.period ?? '—'} unavailableReason={dataset.period ? undefined : 'No period column found in the file'} />
            </div>
          </Section>

          <Section
            title="Value unit"
            subtitle="What one unit in the value column represents. Market audits are frequently denominated in thousands, lakhs or crores rather than rupees."
          >
            <Card>
              {(() => {
                // The raw column total, before the current multiplier is applied.
                const rawTotal =
                  dataset.rows.reduce((sum, row) => sum + (row.matValue ?? 0), 0) / dataset.valueScale;
                return (
                  <>
                    <p className="t-sub" style={{ marginBottom: 14 }}>
                      MATLens does not guess this. Below is what the market would total under each option — pick the one
                      that matches the market you know.
                    </p>
                    <div className="table-wrap">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Value column is in</th>
                            <th className="num">Market would total</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {VALUE_SCALES.map((option) => {
                            const active = option.scale === dataset.valueScale;
                            return (
                              <tr key={option.scale} className={active ? 'is-focus' : undefined}>
                                <td className="strong">{option.label}</td>
                                <td className="num">{formatValue(rawTotal * option.scale)}</td>
                                <td style={{ width: 140 }}>
                                  {active ? (
                                    <Badge tone="accent" icon="check">
                                      In use
                                    </Badge>
                                  ) : (
                                    <button className="btn btn--sm" onClick={() => setValueScale(option.scale)}>
                                      Use this
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}

              {dataset.valueUnitUncertain && (
                <div style={{ marginTop: 14 }}>
                  <Callout tone="warning" title="This total is small for a pharmaceutical market">
                    At the current setting the whole file adds up to less than ₹10 Cr. Even a single therapy area is
                    usually larger, so the value column is probably denominated in something other than rupees. Growth,
                    share and rank are ratios and are already correct — only the absolute values are affected.
                  </Callout>
                </div>
              )}

              <p className="t-micro" style={{ marginTop: 12 }}>
                MATLens stores every value in rupees internally and applies the multiplier once, at load. Unit sales are
                never rescaled.
              </p>
            </Card>
          </Section>

          <Section
            title="Column mapping"
            subtitle="What MATLens thinks each column is, why, and how confident it is. Correct anything it got wrong — the whole analysis rebuilds instantly."
            aside={
              <button className="btn btn--sm" onClick={resetMapping}>
                <Icon name="reset" size={13} />
                Reset to automatic
              </button>
            }
          >
            <Card flush>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Uploaded column</th>
                      <th>Sample values</th>
                      <th>MATLens interpretation</th>
                      <th>Confidence</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.mappings.map((mapping) => (
                      <tr key={mapping.sourceColumn}>
                        <td className="strong" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                          {mapping.sourceColumn}
                        </td>
                        <td className="t-micro" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {mapping.sampleValues.join(' · ') || '—'}
                        </td>
                        <td>
                          <select
                            className="select"
                            style={{ minWidth: 170 }}
                            value={mapping.field ?? ''}
                            onChange={(event) => remapColumn(mapping.sourceColumn, (event.target.value || null) as FieldKey | null)}
                          >
                            <option value="">Not used</option>
                            {FIELD_DEFINITIONS.map((field) => (
                              <option key={field.key} value={field.key}>
                                {field.label}
                                {usedFields.has(field.key) && field.key !== mapping.field ? ' (in use)' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <Badge tone={CONFIDENCE_TONE[mapping.confidence]}>
                            {mapping.overridden ? 'Manual' : mapping.confidence === 'none' ? 'Unmapped' : mapping.confidence}
                          </Badge>
                        </td>
                        <td className="t-micro" style={{ maxWidth: 300 }}>{mapping.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="row row--wrap" style={{ marginTop: 10 }}>
              <span className="t-micro">
                {mapped.length} of {dataset.mappings.length} columns mapped
                {unmapped.length ? ` · ${unmapped.length} carried through unused` : ''}
              </span>
            </div>

            {!usedFields.has('brand' as FieldKey) && (
              <div style={{ marginTop: 12 }}>
                <Callout tone="critical" title="No brand column identified">
                  MATLens cannot analyse a market without knowing which column holds the brand name. Set one above.
                </Callout>
              </div>
            )}
            {!usedFields.has('matValue' as FieldKey) && (
              <div style={{ marginTop: 12 }}>
                <Callout tone="critical" title="No MAT value column identified">
                  Market size, share and growth all depend on a value column. Set one above, or upload an extract that
                  includes MAT value.
                </Callout>
              </div>
            )}
          </Section>

          <Section title="Data health" subtitle="What passed, what was excluded, and what to be careful about">
            <div className="grid grid--2">
              <Card title="Checks">
                <ul className="list-check">
                  {dataset.health.checksPassed.map((check) => (
                    <li key={check}>
                      <span style={{ color: 'var(--good-ink)', marginTop: 2 }}>
                        <Icon name="check" size={13} strokeWidth={2.4} />
                      </span>
                      {check}
                    </li>
                  ))}
                  {dataset.health.issues.map((issue) => (
                    <li key={issue.id}>
                      <span style={{ color: issue.severity === 'error' ? 'var(--critical-ink)' : issue.severity === 'warning' ? 'var(--warning-ink)' : 'var(--ink-400)', marginTop: 2 }}>
                        <Icon name={issue.severity === 'info' ? 'info' : 'alert'} size={13} strokeWidth={2} />
                      </span>
                      <span>
                        <strong>{issue.title}</strong>
                        {issue.affectedRows > 0 && ` — ${issue.affectedRows.toLocaleString('en-IN')} row${issue.affectedRows === 1 ? '' : 's'}`}
                        <span className="t-micro" style={{ display: 'block' }}>
                          {issue.detail}
                          {issue.examples.filter(Boolean).length > 0 && ` First affected file rows: ${issue.examples.filter(Boolean).join(', ')}.`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="What this dataset can and cannot support">
                {dataset.capabilities.limitations.length ? (
                  <ul className="list-check">
                    {dataset.capabilities.limitations.map((limitation) => (
                      <li key={limitation}>
                        <span style={{ color: 'var(--warning-ink)', marginTop: 2 }}>
                          <Icon name="info" size={13} strokeWidth={2} />
                        </span>
                        {limitation}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-sub">
                    Every canonical field MATLens looks for was found. Growth, share, share change, rank movement,
                    regional and molecule analysis are all available on this dataset.
                  </p>
                )}
                {dataset.notes.length > 0 && (
                  <>
                    <div className="divider" />
                    <div className="t-eyebrow" style={{ marginBottom: 6 }}>Notes</div>
                    {dataset.notes.map((note) => (
                      <p className="t-micro" key={note} style={{ marginBottom: 6 }}>{note}</p>
                    ))}
                  </>
                )}
              </Card>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
