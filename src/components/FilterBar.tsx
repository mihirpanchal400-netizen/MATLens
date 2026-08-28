import { useMemo } from 'react';
import { useApp } from '../state/AppState';
import { distinctValues } from '../analytics/analyse';
import { Icon } from './Icon';
import { SelectField } from './ui';

/**
 * One filter row, above everything it scopes. Every screen reads the same slice,
 * so two views can never disagree about what "the market" currently means.
 */
export function FilterBar() {
  const { dataset, filters, setFilter, resetFilters, filtersActive, rows } = useApp();

  const options = useMemo(() => {
    const all = dataset?.rows ?? [];
    return {
      therapy: distinctValues(all, 'therapy'),
      segment: distinctValues(all, 'segment'),
      molecule: distinctValues(all, 'molecule'),
      company: distinctValues(all, 'company'),
      region: distinctValues(all, 'region'),
    };
  }, [dataset]);

  if (!dataset) return null;

  const available = [
    options.therapy.length > 1 && (
      <SelectField key="therapy" label="Therapy" value={filters.therapy} options={options.therapy} onChange={(v) => setFilter('therapy', v)} allLabel="All therapies" />
    ),
    options.segment.length > 1 && (
      <SelectField key="segment" label="Segment" value={filters.segment} options={options.segment} onChange={(v) => setFilter('segment', v)} allLabel="All segments" />
    ),
    options.molecule.length > 1 && (
      <SelectField key="molecule" label="Molecule" value={filters.molecule} options={options.molecule} onChange={(v) => setFilter('molecule', v)} allLabel="All molecules" />
    ),
    options.company.length > 1 && (
      <SelectField key="company" label="Company" value={filters.company} options={options.company} onChange={(v) => setFilter('company', v)} allLabel="All companies" />
    ),
    options.region.length > 1 && (
      <SelectField key="region" label="Region" value={filters.region} options={options.region} onChange={(v) => setFilter('region', v)} allLabel="All regions" />
    ),
  ].filter(Boolean);

  if (!available.length) return null;

  return (
    <div className="filterbar">
      {available}
      <div className="filterbar__end">
        <span className="t-micro">
          {rows.length.toLocaleString('en-IN')} of {dataset.rows.length.toLocaleString('en-IN')} rows in scope
        </span>
        {filtersActive && (
          <button className="btn btn--sm" onClick={resetFilters}>
            <Icon name="reset" size={13} />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/** Warns that share and rank are relative to the current selection, not the whole file. */
export function ScopeNote() {
  const { filtersActive, dataset } = useApp();
  if (!filtersActive || !dataset) return null;
  return (
    <div className="callout callout--accent" style={{ marginBottom: 18 }}>
      Filters are active. Market size, share, rank and every signal below are calculated
      <strong> within the current selection</strong> — not against the full file.
    </div>
  );
}
