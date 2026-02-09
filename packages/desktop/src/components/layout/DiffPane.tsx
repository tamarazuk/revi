import { useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '../../stores/session';
import { useUIStore } from '../../stores/ui';
import { useReviewStateStore } from '../../stores/reviewState';
import { useDiff } from '../../hooks/useDiff';
import { UnifiedView } from '../diff/UnifiedView';
import { SplitView } from '../diff/SplitView';

export function DiffPane() {
  const { selectedFile, session } = useSessionStore();
  const { diffMode } = useUIStore();
  const { getCollapseState, setHunkCollapsed } = useReviewStateStore();
  const { diff, isLoading, error } = useDiff({ filePath: selectedFile });

  const collapseState = selectedFile ? getCollapseState(selectedFile) : null;
  const collapsedHunks = useMemo(
    () => new Set(collapseState?.hunks ?? []),
    [collapseState],
  );
  const onToggleHunk = useCallback(
    (hunkIndex: number) => {
      if (!selectedFile) return;
      const isCollapsed = collapsedHunks.has(hunkIndex);
      setHunkCollapsed(selectedFile, hunkIndex, !isCollapsed);
    },
    [selectedFile, collapsedHunks, setHunkCollapsed],
  );

  if (!session) return null;

  if (!selectedFile) {
    return (
      <main className="diff-pane diff-pane--empty">
        <div className="empty-state">
          <p>Select a file to view its diff</p>
          <p className="dim">Use j/k to navigate, Enter to open, ? for shortcuts</p>
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
        <DiffHeader file={file} repoRoot={session.repoRoot} />
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
      <DiffHeader file={file} repoRoot={session.repoRoot} />
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
              <SplitView diff={diff} collapsedHunks={collapsedHunks} onToggleHunk={onToggleHunk} />
            ) : (
              <UnifiedView diff={diff} collapsedHunks={collapsedHunks} onToggleHunk={onToggleHunk} />
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
  repoRoot: string;
}

function DiffHeader({ file, repoRoot }: DiffHeaderProps) {
  const handleCopyPath = () => {
    invoke('copy_to_clipboard', { content: file.path }).catch((err) => {
      console.error('Failed to copy to clipboard:', err);
    });
  };

  const handleOpenInEditor = () => {
    const fullPath = `${repoRoot}/${file.path}`;
    invoke('open_in_editor', { filePath: fullPath, line: null }).catch((err) => {
      console.error('Failed to open in editor:', err);
    });
  };

  return (
    <div className="diff-pane__header">
      <div className="diff-pane__path-info">
        {file.renamedFrom && (
          <span className="diff-pane__renamed">
            {file.renamedFrom} →{' '}
          </span>
        )}
        <span className="diff-pane__path">{file.path}</span>
        <div className="diff-pane__actions">
          <button
            className="diff-pane__action"
            onClick={handleCopyPath}
            title="Copy relative path (⌘C)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
              <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
            </svg>
          </button>
          <button
            className="diff-pane__action"
            onClick={handleOpenInEditor}
            title="Open in editor (⌘⇧O)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 1.75C4 .784 4.784 0 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v8.586A1.75 1.75 0 0 1 14.25 15h-9a.75.75 0 0 1 0-1.5h9a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 10 4.25V1.5H5.75a.25.25 0 0 0-.25.25v2.5a.75.75 0 0 1-1.5 0Zm7.5-.188V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/>
              <path d="M5.72 6.72a.75.75 0 0 0-1.06 1.06l1.97 1.97-1.97 1.97a.75.75 0 1 0 1.06 1.06l2.5-2.5a.75.75 0 0 0 0-1.06l-2.5-2.5Z"/>
              <path d="M6.25 14a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75Z"/>
            </svg>
          </button>
        </div>
      </div>
      <span className="diff-pane__stats">
        <span className="addition">+{file.additions}</span>
        {' '}
        <span className="deletion">-{file.deletions}</span>
      </span>
    </div>
  );
}
