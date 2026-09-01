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
import { FileParseError, parseFile, type ParseProgress } from '../data/parseFile';

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
  /** Non-null while a file is being read, for the upload progress indicator. */
  progress: ParseProgress | null;
  error: LoadError | null;
  /** Rows surviving the current filter selection. */
  rows: NormalizedRow[];
  analysis: Analysis | null;
  focusBrand: EntityMetrics | null;
  insights: Insight[];
  opportunities: Insight[];
  filtersActive: boolean;
  /** Keys of insights the user has saved to their workspace. */
  savedInsights: Set<string>;

  goTo: (page: PageId, brand?: string) => void;
  setFilter: (key: keyof Filters, value: string | null) => void;
  resetFilters: () => void;
  setFocusBrand: (brand: string | null) => void;
  loadDemo: () => void;
  loadFile: (file: File) => Promise<void>;
  remapColumn: (sourceColumn: string, field: FieldKey | null) => void;
  toggleSavedInsight: (insight: Insight) => void;
  setValueScale: (scale: number) => void;
  resetMapping: () => void;
  clearDataset: () => void;
  dismissError: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const SAVED_KEY = 'matlens.savedInsights';

/**
 * A stable identity for a finding. Insight ids carry a per-run sequence number,
 * so they cannot survive a re-render; rule + subject + type does.
 */
export function insightKey(insight: Insight): string {
  return `${insight.rule}|${insight.subject}|${insight.type}`;
}

function readSavedInsights(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // Private windows and blocked site data throw on access; saving is a
    // convenience, so an unavailable store simply means nothing is remembered.
    return new Set<string>();
  }
}

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
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [savedInsights, setSavedInsights] = useState<Set<string>>(readSavedInsights);

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
      setProgress({ rows: 0, fraction: 0, stage: 'reading' });
      try {
        // Yield to the browser between chunks so progress actually paints.
        const raw = await parseFile(file, (update) => setProgress(update));
        setProgress({ rows: raw.rows.length, fraction: 1, stage: 'organising' });
        await new Promise((resolve) => window.setTimeout(resolve, 0));
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
        setProgress(null);
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
          valueScale: current.valueScale,
        });
        setFocusBrandName((name) =>
          name && rebuilt.rows.some((r) => r.brand === name) ? name : rebuilt.defaultFocusBrand,
        );
        return rebuilt;
      });
    },
    [],
  );

  const setValueScale = useCallback((scale: number) => {
    setDataset((current) => {
      if (!current) return current;
      return buildDataset({
        raw: current.raw,
        mappings: current.mappings,
        isSynthetic: current.isSynthetic,
        defaultFocusBrand: current.defaultFocusBrand,
        notes: current.notes,
        valueScale: scale,
      });
    });
  }, []);

  const resetMapping = useCallback(() => {
    setDataset((current) => {
      if (!current) return current;
      const rebuilt = buildDataset({
        raw: current.raw,
        mappings: mapColumns(current.raw),
        isSynthetic: current.isSynthetic,
        defaultFocusBrand: current.isSynthetic ? current.defaultFocusBrand : null,
        notes: current.notes,
        valueScale: current.valueScale,
      });
      setFocusBrandName(rebuilt.defaultFocusBrand);
      return rebuilt;
    });
  }, []);

  const toggleSavedInsight = useCallback((insight: Insight) => {
    setSavedInsights((current) => {
      const next = new Set(current);
      const key = insightKey(insight);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
      } catch {
        // Saving is best-effort; the in-session set still works without a store.
      }
      return next;
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
    progress,
    error,
    rows,
    analysis,
    focusBrand,
    insights,
    opportunities,
    filtersActive,
    savedInsights,
    goTo,
    setFilter,
    resetFilters,
    setFocusBrand: setFocusBrandName,
    loadDemo,
    loadFile,
    remapColumn,
    toggleSavedInsight,
    setValueScale,
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
