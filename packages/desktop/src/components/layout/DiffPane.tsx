import { useSessionStore } from '../../stores/session';
import { useUIStore } from '../../stores/ui';
import { useDiff } from '../../hooks/useDiff';
import { UnifiedView } from '../diff/UnifiedView';
import { SplitView } from '../diff/SplitView';

export function DiffPane() {
  const { selectedFile, session } = useSessionStore();
  const { diffMode } = useUIStore();
  const { diff, isLoading, error } = useDiff({ filePath: selectedFile });

  if (!session) return null;

  if (!selectedFile) {
    return (
      <main className="diff-pane diff-pane--empty">
        <div className="empty-state">
          <p>Select a file to view its diff</p>
          <p className="dim">Use j/k to navigate, Enter to open</p>
        </div>
      </main>
    );
  }

  const file = session.files.find((f) => f.path === selectedFile);

  if (!file) {
    return (
      <main className="diff-pane diff-pane--error">
        <div className="empty-state">
          <p>File not found: {selectedFile}</p>
        </div>
      </main>
    );
  }

  // Handle binary files
  if (file.binary) {
    return (
      <main className="diff-pane">
        <DiffHeader file={file} />
        <div className="diff-pane__content diff-pane__content--centered">
          <div className="binary-message">
            <p>Binary file</p>
            <p className="dim">{file.path}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="diff-pane">
      <DiffHeader file={file} />
      <div className="diff-pane__content">
        {isLoading && (
          <div className="diff-loading">
            <span className="diff-loading__spinner" />
            Loading diff...
          </div>
        )}
        {error && (
          <div className="diff-error">
            <p>Failed to load diff</p>
            <p className="dim">{error}</p>
          </div>
        )}
        {diff && !isLoading && (
          <>
            {diff.hunks.length === 0 ? (
              <div className="diff-empty">
                <p>No changes in this file</p>
              </div>
            ) : diffMode === 'split' ? (
              <SplitView diff={diff} />
            ) : (
              <UnifiedView diff={diff} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

interface DiffHeaderProps {
  file: {
    path: string;
    additions: number;
    deletions: number;
    status: string;
    renamedFrom?: string;
  };
}

function DiffHeader({ file }: DiffHeaderProps) {
  return (
    <div className="diff-pane__header">
      <div className="diff-pane__path-info">
        {file.renamedFrom && (
          <span className="diff-pane__renamed">
            {file.renamedFrom} →{' '}
          </span>
        )}
        <span className="diff-pane__path">{file.path}</span>
      </div>
      <span className="diff-pane__stats">
        <span className="addition">+{file.additions}</span>
        {' '}
        <span className="deletion">-{file.deletions}</span>
      </span>
    </div>
  );
}
