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

/** Sample files with deliberately different header conventions and defects — for testing the mapper, not primary use. */
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
  const hasBrand = usedFields.has('brand' as FieldKey);
  const hasValue = usedFields.has('matValue' as FieldKey);
  const ready = Boolean(dataset && dataset.rows.length > 0);

  const steps = dataset
    ? [
        { label: 'File received', done: true, detail: dataset.fileName },
        {
          label: 'Required columns detected',
          done: hasBrand && hasValue,
          detail: hasBrand && hasValue ? `${mapped.length} of ${dataset.mappings.length} columns mapped` : 'Brand or MAT value column missing — see mapping details below',
        },
        {
          label: 'Records validated',
          done: dataset.health.usableRows > 0,
          detail: `${dataset.health.usableRows.toLocaleString('en-IN')} usable of ${dataset.health.totalRows.toLocaleString('en-IN')} rows`,
        },
        {
          label: 'Market period identified',
          done: Boolean(dataset.period),
          detail: dataset.period ?? 'No period column found in the file',
        },
        {
          label: 'Dataset ready',
          done: ready,
          detail: ready ? 'Ready for analysis' : 'Fix the issues above to continue',
        },
      ]
    : [];

  return (
    <>
      {dataset && (
        <Section title="Current dataset">
          <Card>
            <div className="row row--wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: ready ? 'var(--good)' : 'var(--warning)' }} />
                  <span className="t-h2">{dataset.period ?? dataset.fileName}</span>
                  {dataset.isSynthetic && <Badge tone="synthetic">Demo data</Badge>}
                </div>
                <p className="t-sub" style={{ marginTop: 3 }}>
                  {dataset.fileName}
                  {dataset.raw.sheetName ? ` · sheet "${dataset.raw.sheetName}"` : ''}
                </p>
              </div>
              <button className="btn btn--sm" onClick={clearDataset}>
                <Icon name="reset" size={13} />
                Clear
              </button>
            </div>

            <div className="grid grid--kpi" style={{ marginTop: 16 }}>
              <KpiTile label="Status" value={ready ? 'Ready' : 'Needs attention'} />
              <KpiTile
                label="Records"
                value={dataset.health.usableRows.toLocaleString('en-IN')}
                foot={dataset.health.droppedRows ? `${dataset.health.droppedRows.toLocaleString('en-IN')} excluded` : 'all rows usable'}
              />
              <KpiTile label="Brands" value={new Set(dataset.rows.map((r) => r.brand)).size.toLocaleString('en-IN')} />
              <KpiTile label="Last updated" value={formatDateTime(dataset.loadedAt)} />
            </div>
          </Card>
        </Section>
      )}

      <Section title="Upload new MAT data" subtitle="Excel or CSV, parsed entirely in your browser — nothing is uploaded to a server">
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
            <h3 className="t-h2">Drag & drop Excel or CSV</h3>
            <p className="t-sub" style={{ margin: '6px 0 16px' }}>or</p>
            <button className="btn btn--primary" onClick={() => inputRef.current?.click()} disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="file" size={14} />}
              {loading ? 'Reading file…' : 'Browse Files'}
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
              Supported: .xlsx · .xls · .csv — a brand column and a MAT value column are the minimum. Large files are
              streamed automatically, so a full national basefile opens directly here.
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
                {progress.fraction > 0 && <span className="t-micro">{Math.round(progress.fraction * 100)}%</span>}
              </div>
              <div className="progress">
                <div className="progress__bar" style={{ width: `${Math.max(4, progress.fraction * 100)}%` }} />
              </div>
              {heavyFile && (
                <p className="t-micro" style={{ marginTop: 8 }}>
                  {heavyFile} is a large workbook — this may take a minute.
                </p>
              )}
            </div>
          )}
        </Card>
      </Section>

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
        <Section title="Validation">
          <Card flush>
            <ul className="list-check" style={{ padding: '16px 18px' }}>
              {steps.map((step) => (
                <li key={step.label}>
                  <span style={{ color: step.done ? 'var(--good-ink)' : 'var(--warning-ink)', marginTop: 2 }}>
                    <Icon name={step.done ? 'check' : 'alert'} size={13} strokeWidth={2.4} />
                  </span>
                  <span>
                    <strong>{step.label}</strong>
                    <span className="t-micro" style={{ display: 'block' }}>{step.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn--primary" disabled={!ready} onClick={() => goTo('overview')}>
              Continue to Market Overview
              <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </Section>
      )}

      <Section title="Use demo dataset" subtitle="No file to hand? Explore MATLens instantly with a realistic synthetic pharma market.">
        <Card>
          <p className="t-sub" style={{ marginBottom: 12 }}>{DEMO_DESCRIPTION}</p>
          <button className="btn btn--primary" onClick={loadDemo} disabled={loading}>
            {loading ? <span className="spinner" /> : <Icon name="opportunities" size={14} />}
            Explore Demo Data
          </button>
        </Card>
      </Section>

      {dataset && (
        <details style={{ marginTop: 4 }}>
          <summary
            className="t-eyebrow"
            style={{ cursor: 'pointer', color: 'var(--accent)', marginBottom: 16, userSelect: 'none' }}
          >
            Advanced — column mapping, value unit &amp; data health
          </summary>

          <div style={{ marginTop: 8 }}>
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

              {dataset.raw.skippedColumns && dataset.raw.skippedColumns.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Callout title={`${dataset.raw.skippedColumns.length.toLocaleString('en-IN')} columns were read past, not retained`}>
                    This export carries{' '}
                    {(dataset.raw.skippedColumns.length + dataset.raw.columns.length).toLocaleString('en-IN')} columns.
                    MATLens kept every dimension column and every MAT measure, and skipped the monthly, quarterly and
                    year-to-date series, which it does not analyse and which would cost memory for nothing.
                    <details style={{ marginTop: 8 }}>
                      <summary className="t-micro" style={{ cursor: 'pointer' }}>Show the skipped columns</summary>
                      <p className="t-micro" style={{ marginTop: 6 }}>{dataset.raw.skippedColumns.join(' · ')}</p>
                    </details>
                  </Callout>
                </div>
              )}

              {!hasBrand && (
                <div style={{ marginTop: 12 }}>
                  <Callout tone="critical" title="No brand column identified">
                    MATLens cannot analyse a market without knowing which column holds the brand name. Set one above.
                  </Callout>
                </div>
              )}
              {!hasValue && (
                <div style={{ marginTop: 12 }}>
                  <Callout tone="critical" title="No MAT value column identified">
                    Market size, share and growth all depend on a value column. Set one above, or upload an extract that
                    includes MAT value.
                  </Callout>
                </div>
              )}
            </Section>

            <Section
              title="Value unit"
              subtitle="What one unit in the value column represents. Market audits are frequently denominated in thousands, lakhs or crores rather than rupees."
            >
              <Card>
                {(() => {
                  const rawTotal = dataset.rows.reduce((sum, row) => sum + (row.matValue ?? 0), 0) / dataset.valueScale;
                  return (
                    <>
                      <p className="t-sub" style={{ marginBottom: 14 }}>
                        MATLens does not guess this. Below is what the market would total under each option — pick the
                        one that matches the market you know.
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
                      usually larger, so the value column is probably denominated in something other than rupees.
                      Growth, share and rank are ratios and are already correct — only the absolute values are affected.
                    </Callout>
                  </div>
                )}

                <p className="t-micro" style={{ marginTop: 12 }}>
                  MATLens stores every value in rupees internally and applies the multiplier once, at load. Unit sales
                  are never rescaled.
                </p>
              </Card>
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

            <Section title="Large files" subtitle="Why a full national basefile opens here without a separate conversion step">
              <Card>
                <p className="t-sub">
                  Spreadsheet parsers decompress a worksheet into a single string, and JavaScript caps a string at
                  <strong> 512 MB</strong>. MATLens reads workbooks over 20 MB with its own streaming reader instead —
                  the sheet is never held whole, so that ceiling never applies. Very wide exports are projected down to
                  what can be analysed automatically, and where a file carries the same measure for several years, the
                  two most recent MAT periods become the current and comparison periods.
                </p>
                <p className="t-micro" style={{ marginTop: 10 }}>
                  A command-line converter is also available for pre-processing one file repeatedly:
                </p>
                <Formula>{`npm run convert -- --in "<path to your file>" --list
npm run convert -- --in "<path to your file>" --therapy DERMATOLOGY`}</Formula>
              </Card>
            </Section>

            <Section title="Sample files" subtitle="Deliberately untidy files, for testing how MATLens handles a real-world export">
              <Card>
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
            </Section>
          </div>
        </details>
      )}

      {!dataset && (
        <p className="t-micro" style={{ marginTop: 4 }}>
          Up to {LIMITS.MAX_BYTES / 1048576} MB per file.
        </p>
      )}
    </>
  );
}
