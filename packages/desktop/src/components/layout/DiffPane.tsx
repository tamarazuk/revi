import { useSessionStore } from '../../stores/session';

export function DiffPane() {
  const { selectedFile, session } = useSessionStore();

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

  return (
    <main className="diff-pane">
      <div className="diff-pane__header">
        <span className="diff-pane__path">{file.path}</span>
        <span className="diff-pane__stats">
          <span className="addition">+{file.additions}</span>
          {' '}
          <span className="deletion">-{file.deletions}</span>
        </span>
      </div>

      <div className="diff-pane__content">
        {/* TODO: Render actual diff content */}
        <div className="diff-placeholder">
          <p>Diff viewer will be implemented in Phase 5</p>
          <p className="dim">
            File: {file.path}<br />
            Status: {file.status}<br />
            Changes: +{file.additions} -{file.deletions}
          </p>
        </div>
      </div>
    </main>
  );
}
