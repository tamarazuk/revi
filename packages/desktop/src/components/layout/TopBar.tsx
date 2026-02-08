import { useSessionStore } from '../../stores/session';
import { useUIStore } from '../../stores/ui';

export function TopBar() {
  const { session } = useSessionStore();
  const { diffMode, toggleDiffMode } = useUIStore();

  if (!session) return null;

  const viewedCount = 0; // TODO: Calculate from review state
  const totalCount = session.files.length;

  return (
    <header className="top-bar">
      <div className="top-bar__info">
        <span className="top-bar__refs">
          {session.base.ref}
          <span className="dim"> ({session.base.sha.slice(0, 7)})</span>
          {' → '}
          {session.head.ref}
          <span className="dim"> ({session.head.sha.slice(0, 7)})</span>
        </span>
        <span className="top-bar__repo dim">{session.repoRoot}</span>
      </div>

      <div className="top-bar__actions">
        <span className="top-bar__progress">
          {viewedCount} / {totalCount} files viewed
        </span>

        <button
          className="top-bar__toggle"
          onClick={toggleDiffMode}
          title={`Switch to ${diffMode === 'split' ? 'unified' : 'split'} view`}
        >
          {diffMode === 'split' ? 'Split' : 'Unified'}
        </button>
      </div>
    </header>
  );
}
