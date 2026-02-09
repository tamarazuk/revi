import { useSessionStore } from '../../stores/session';
import { useUIStore } from '../../stores/ui';
import { useReviewStateStore } from '../../stores/reviewState';

interface TopBarProps {
  onChangeProject?: () => void;
}

export function TopBar({ onChangeProject }: TopBarProps) {
  const { session } = useSessionStore();
  const { diffMode, toggleDiffMode } = useUIStore();
  const viewedCount = useReviewStateStore((state) => state.getViewedCount());

  if (!session) return null;

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

        {onChangeProject && (
          <button
            className="top-bar__change-project"
            onClick={onChangeProject}
            title="Open a different project"
          >
            Change Project
          </button>
        )}
      </div>
    </header>
  );
}
