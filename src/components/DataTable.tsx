import React, { useMemo, useState } from 'react';
import { Icon } from './Icon';

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  /** Value used for sorting. Omit to make the column unsortable. */
  sortValue?: (row: T) => number | string | null;
  render: (row: T) => React.ReactNode;
  /** Plain value used for CSV export; falls back to sortValue. */
  exportValue?: (row: T) => string | number | null;
  defaultHidden?: boolean;
  title?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  pageSize?: number;
  /** Returns the searchable text for a row. Omit to hide the search box. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  highlight?: (row: T) => boolean;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  exportFileName?: string;
  columnToggle?: boolean;
  toolbarExtra?: React.ReactNode;
}

function toCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  pageSize: initialPageSize = 25,
  searchText,
  searchPlaceholder = 'Search…',
  highlight,
  onRowClick,
  emptyMessage = 'No rows match the current selection.',
  exportFileName,
  columnToggle = false,
  toolbarExtra,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const visibleColumns = columns.filter((column) => !hidden.has(column.key));

  const filtered = useMemo(() => {
    if (!searchText || !query.trim()) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => searchText(row).toLowerCase().includes(needle));
  }, [rows, query, searchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return filtered;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      // Nulls always sink, regardless of direction — missing data is not "lowest".
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (column: Column<T>) => {
    if (!column.sortValue) return;
    setPage(0);
    setSort((current) => {
      if (!current || current.key !== column.key) {
        return { key: column.key, direction: column.numeric ? 'desc' : 'asc' };
      }
      return { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const exportCsv = () => {
    const header = visibleColumns.map((c) => toCsvCell(c.header)).join(',');
    const body = sorted
      .map((row) =>
        visibleColumns
          .map((column) => toCsvCell(column.exportValue ? column.exportValue(row) : column.sortValue?.(row) ?? ''))
          .join(','),
      )
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName ?? 'matlens-export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {(searchText || exportFileName || columnToggle || toolbarExtra) && (
        <div className="row row--wrap" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          {searchText && (
            <input
              className="input input--search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              style={{ minWidth: 230 }}
              aria-label={searchPlaceholder}
            />
          )}
          {toolbarExtra}
          <span className="t-micro" style={{ marginLeft: 'auto' }}>
            {sorted.length.toLocaleString('en-IN')} row{sorted.length === 1 ? '' : 's'}
            {sorted.length !== rows.length && ` of ${rows.length.toLocaleString('en-IN')}`}
          </span>
          {columnToggle && (
            <div style={{ position: 'relative' }}>
              <button className="btn btn--sm" onClick={() => setShowColumnMenu((v) => !v)}>
                Columns
                <Icon name="chevronDown" size={12} />
              </button>
              {showColumnMenu && (
                <div
                  className="card"
                  style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, padding: 10, minWidth: 200, boxShadow: 'var(--shadow-md)' }}
                >
                  {columns.map((column) => (
                    <label key={column.key} className="row" style={{ padding: '4px 2px', fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!hidden.has(column.key)}
                        onChange={() =>
                          setHidden((current) => {
                            const next = new Set(current);
                            if (next.has(column.key)) next.delete(column.key);
                            else next.add(column.key);
                            return next;
                          })
                        }
                      />
                      {column.header}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {exportFileName && (
            <button className="btn btn--sm" onClick={exportCsv}>
              <Icon name="download" size={13} />
              Export CSV
            </button>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {visibleColumns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    className={`${column.sortValue ? 'is-sortable' : ''} ${column.numeric ? 'num' : ''}`}
                    style={column.numeric ? { textAlign: 'right' } : undefined}
                    onClick={() => toggleSort(column)}
                    title={column.title ?? (column.sortValue ? `Sort by ${column.header}` : undefined)}
                    aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {column.header}
                    {column.sortValue && (
                      <span className={`sort-caret ${active ? 'sort-caret--on' : ''}`}>
                        {active ? (sort!.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={rowKey(row)}
                className={highlight?.(row) ? 'is-focus' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {visibleColumns.map((column) => (
                  <td key={column.key} className={column.numeric ? 'num' : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={visibleColumns.length} style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--ink-400)' }}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="pagination">
          <button className="btn btn--sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Previous
          </button>
          <span className="t-micro">
            Page {safePage + 1} of {pageCount}
          </span>
          <button className="btn btn--sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
            Next
          </button>
          <label className="row t-micro" style={{ marginLeft: 'auto', gap: 6 }}>
            Rows per page
            <select
              className="select"
              style={{ padding: '3px 24px 3px 8px' }}
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
