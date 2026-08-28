import { useRef, useState } from 'react';
import { useApp } from '../state/AppState';
import { FIELD_DEFINITIONS } from '../data/fields';
import { DEMO_DESCRIPTION } from '../data/demoDataset';
import { fetchDemoFile } from '../data/parseFile';
import { Icon } from '../components/Icon';
import { Badge, type BadgeTone, Callout, Card, KpiTile, Section } from '../components/ui';
import type { Confidence, FieldKey } from '../types';
import { formatDateTime } from '../utils/format';

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
  const { dataset, loadFile, loadDemo, loading, error, dismissError, remapColumn, resetMapping, goTo, clearDataset } = useApp();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void loadFile(file);
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
                Supported: .xlsx · .xls · .csv — up to 30 MB. A brand column and a MAT value column are the minimum;
                everything else is optional and simply unlocks more analysis.
              </p>
            </div>
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
