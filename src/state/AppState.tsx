import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type {
  Analysis,
  ColumnMapping,
  Dataset,
  EntityMetrics,
  FieldKey,
  Filters,
  Insight,
  NormalizedRow,
  PageId,
} from '../types';
import { EMPTY_FILTERS } from '../types';
import { analyse, applyFilters, findBrand } from '../analytics/analyse';
import { generateInsights, opportunitiesFrom } from '../analytics/insightEngine';
import { buildDataset } from '../data/buildDataset';
import { mapColumns, overrideMapping } from '../data/columnMapper';
import { loadDemoDataset } from '../data/demoDataset';
import { FileParseError, parseFile } from '../data/parseFile';

interface LoadError {
  message: string;
  hint: string;
}

interface AppStateValue {
  dataset: Dataset | null;
  page: PageId;
  filters: Filters;
  focusBrandName: string | null;
  loading: boolean;
  error: LoadError | null;
  /** Rows surviving the current filter selection. */
  rows: NormalizedRow[];
  analysis: Analysis | null;
  focusBrand: EntityMetrics | null;
  insights: Insight[];
  opportunities: Insight[];
  filtersActive: boolean;

  goTo: (page: PageId, brand?: string) => void;
  setFilter: (key: keyof Filters, value: string | null) => void;
  resetFilters: () => void;
  setFocusBrand: (brand: string | null) => void;
  loadDemo: () => void;
  loadFile: (file: File) => Promise<void>;
  remapColumn: (sourceColumn: string, field: FieldKey | null) => void;
  resetMapping: () => void;
  clearDataset: () => void;
  dismissError: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({
  children,
  initialDataset = null,
  initialPage = 'overview',
}: {
  children: React.ReactNode;
  /** Seeds the provider with a dataset. Used by the verification harness. */
  initialDataset?: Dataset | null;
  initialPage?: PageId;
}) {
  const [dataset, setDataset] = useState<Dataset | null>(initialDataset);
  const [page, setPage] = useState<PageId>(initialPage);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [focusBrandName, setFocusBrandName] = useState<string | null>(initialDataset?.defaultFocusBrand ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);

  const adopt = useCallback((next: Dataset, landOn: PageId) => {
    setDataset(next);
    setFilters(EMPTY_FILTERS);
    setFocusBrandName(next.defaultFocusBrand);
    setError(null);
    setPage(landOn);
  }, []);

  const loadDemo = useCallback(() => {
    setLoading(true);
    setError(null);
    // Yield a frame so the button's loading state paints before the work starts.
    window.setTimeout(() => {
      try {
        adopt(loadDemoDataset(), 'overview');
      } catch (e) {
        setError({
          message: 'The demo dataset could not be generated.',
          hint: e instanceof Error ? e.message : 'Reload the page and try again.',
        });
      } finally {
        setLoading(false);
      }
    }, 16);
  }, [adopt]);

  const loadFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const raw = await parseFile(file);
        const mappings = mapColumns(raw);
        const next = buildDataset({ raw, mappings });

        if (!next.rows.length) {
          setError({
            message: `No analysable rows were found in ${file.name}.`,
            hint: next.health.issues.length
              ? next.health.issues[0].detail
              : 'MATLens needs at least a brand column and a MAT value column. Check the column mapping below and correct it if a column was missed.',
          });
          // Still adopt the dataset so the user can inspect and fix the mapping.
          setDataset(next);
          setFilters(EMPTY_FILTERS);
          setFocusBrandName(null);
          setPage('upload');
          return;
        }

        adopt(next, 'upload');
      } catch (e) {
        if (e instanceof FileParseError) {
          setError({ message: e.message, hint: e.hint });
        } else {
          setError({
            message: `${file.name} could not be processed.`,
            hint: e instanceof Error ? e.message : 'An unexpected error occurred while reading the file.',
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [adopt],
  );

  const remapColumn = useCallback(
    (sourceColumn: string, field: FieldKey | null) => {
      setDataset((current) => {
        if (!current) return current;
        const mappings: ColumnMapping[] = overrideMapping(current.mappings, sourceColumn, field);
        const rebuilt = buildDataset({
          raw: current.raw,
          mappings,
          isSynthetic: current.isSynthetic,
          defaultFocusBrand: null,
          notes: current.notes,
        });
        setFocusBrandName((name) =>
          name && rebuilt.rows.some((r) => r.brand === name) ? name : rebuilt.defaultFocusBrand,
        );
        return rebuilt;
      });
    },
    [],
  );

  const resetMapping = useCallback(() => {
    setDataset((current) => {
      if (!current) return current;
      const rebuilt = buildDataset({
        raw: current.raw,
        mappings: mapColumns(current.raw),
        isSynthetic: current.isSynthetic,
        defaultFocusBrand: current.isSynthetic ? current.defaultFocusBrand : null,
        notes: current.notes,
      });
      setFocusBrandName(rebuilt.defaultFocusBrand);
      return rebuilt;
    });
  }, []);

  const clearDataset = useCallback(() => {
    setDataset(null);
    setFilters(EMPTY_FILTERS);
    setFocusBrandName(null);
    setError(null);
    setPage('overview');
  }, []);

  const goTo = useCallback((next: PageId, brand?: string) => {
    if (brand) setFocusBrandName(brand);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const setFilter = useCallback((key: keyof Filters, value: string | null) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const rows = useMemo(
    () => (dataset ? applyFilters(dataset.rows, filters) : []),
    [dataset, filters],
  );

  const analysis = useMemo(() => (rows.length ? analyse(rows) : null), [rows]);

  const focusBrand = useMemo(() => {
    if (!analysis) return null;
    const byName = findBrand(analysis, focusBrandName);
    // A filter can exclude the focus brand entirely; fall back to the largest brand present.
    return byName ?? analysis.brands[0] ?? null;
  }, [analysis, focusBrandName]);

  const insights = useMemo(
    () => (analysis && dataset ? generateInsights(analysis, focusBrand, dataset.capabilities) : []),
    [analysis, dataset, focusBrand],
  );

  const opportunities = useMemo(() => opportunitiesFrom(insights), [insights]);

  const filtersActive = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  const value: AppStateValue = {
    dataset,
    page,
    filters,
    focusBrandName,
    loading,
    error,
    rows,
    analysis,
    focusBrand,
    insights,
    opportunities,
    filtersActive,
    goTo,
    setFilter,
    resetFilters,
    setFocusBrand: setFocusBrandName,
    loadDemo,
    loadFile,
    remapColumn,
    resetMapping,
    clearDataset,
    dismissError: () => setError(null),
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useApp(): AppStateValue {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useApp must be used inside AppStateProvider');
  return context;
}
