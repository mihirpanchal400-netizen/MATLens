import { useApp } from '../state/AppState';
import { Icon } from './Icon';
import { Card, EmptyState } from './ui';

/** Shown on every analytical screen when there is nothing loaded to analyse. */
export function NoDataState({ what = 'this analysis' }: { what?: string }) {
  const { loadDemo, goTo, loading, dataset, filtersActive, resetFilters } = useApp();

  if (dataset && filtersActive) {
    return (
      <Card>
        <EmptyState
          icon="explorer"
          title="No rows match the current filters"
          message={`The filter selection excludes every row in ${dataset.fileName}, so ${what} cannot be calculated. Clear the filters to bring the dataset back into scope.`}
          action={
            <button className="btn btn--primary" onClick={resetFilters}>
              <Icon name="reset" size={14} />
              Clear filters
            </button>
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <EmptyState
        title="No dataset loaded"
        message={`Upload a MAT extract or explore the synthetic demo dataset to run ${what}.`}
        action={
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn--primary" onClick={loadDemo} disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="opportunities" size={14} />}
              Explore demo dataset
            </button>
            <button className="btn" onClick={() => goTo('upload')}>
              <Icon name="upload" size={14} />
              Upload data
            </button>
          </div>
        }
      />
    </Card>
  );
}

/** Explains, in the place a metric would have been, why it is unavailable. */
export function Unavailable({ metric, reason }: { metric: string; reason: string }) {
  return (
    <div className="callout callout--warning">
      <strong>{metric} is unavailable.</strong> {reason}
    </div>
  );
}
