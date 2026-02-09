import { useSidebarStore } from '../../stores/sidebar';
import type { FileStatus } from '@revi/shared';

const STATUS_OPTIONS: { value: FileStatus; label: string; color: string }[] = [
  { value: 'added', label: 'A', color: 'var(--accent-green)' },
  { value: 'modified', label: 'M', color: 'var(--accent-yellow)' },
  { value: 'deleted', label: 'D', color: 'var(--accent-red)' },
  { value: 'renamed', label: 'R', color: 'var(--accent-purple)' },
];

type ViewedFilter = 'all' | 'viewed' | 'unviewed';

const VIEWED_OPTIONS: { value: ViewedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unviewed', label: 'Unviewed' },
  { value: 'viewed', label: 'Viewed' },
];

export function FileFilter() {
  const { filter, setSearchQuery, toggleStatusFilter, setViewedFilter, clearFilters } =
    useSidebarStore();

  const hasActiveFilters =
    filter.status.length > 0 ||
    filter.searchQuery !== '' ||
    filter.viewedState !== 'all';

  return (
    <div className="file-filter">
      <div className="file-filter__search">
        <input
          type="text"
          placeholder="Filter files..."
          value={filter.searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="file-filter__input"
        />
        {hasActiveFilters && (
          <button
            className="file-filter__clear"
            onClick={clearFilters}
            title="Clear filters"
          >
            ×
          </button>
        )}
      </div>
      <div className="file-filter__row">
        <div className="file-filter__status">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`file-filter__status-btn ${
                filter.status.includes(opt.value)
                  ? 'file-filter__status-btn--active'
                  : ''
              }`}
              style={
                filter.status.includes(opt.value)
                  ? { backgroundColor: opt.color, borderColor: opt.color }
                  : undefined
              }
              onClick={() => toggleStatusFilter(opt.value)}
              title={`Filter by ${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="file-filter__viewed">
          {VIEWED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`file-filter__viewed-btn ${
                filter.viewedState === opt.value
                  ? 'file-filter__viewed-btn--active'
                  : ''
              }`}
              onClick={() => setViewedFilter(opt.value)}
              title={`Show ${opt.label.toLowerCase()} files`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
