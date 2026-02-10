import { useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CodeBlockIcon, CopyIcon } from '@phosphor-icons/react';
import { useSessionStore } from '../../stores/session';
import { useUIStore } from '../../stores/ui';
import { useReviewStateStore } from '../../stores/reviewState';
import { useDiff } from '../../hooks/useDiff';
import { UnifiedView } from '../diff/UnifiedView';
import { SplitView } from '../diff/SplitView';

export function DiffPane() {
  const { selectedFile, session } = useSessionStore();
  const { diffMode } = useUIStore();
  const { getCollapseState, setHunkCollapsed, setFileCollapsed } = useReviewStateStore();
  const { diff, isLoading, error } = useDiff({ filePath: selectedFile });

  const collapseState = selectedFile ? getCollapseState(selectedFile) : null;
  const isFileCollapsedState = collapseState?.file ?? false;
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
  const onToggleFileCollapse = useCallback(() => {
    if (!selectedFile) return;
    setFileCollapsed(selectedFile, !isFileCollapsedState);
  }, [selectedFile, isFileCollapsedState, setFileCollapsed]);

  const hunkCount = diff?.hunks.length ?? 0;

  const onCollapseAllHunks = useCallback(() => {
    if (!selectedFile || !diff) return;
    for (let i = 0; i < diff.hunks.length; i++) {
      setHunkCollapsed(selectedFile, i, true);
    }
  }, [selectedFile, diff, setHunkCollapsed]);

  const onExpandAllHunks = useCallback(() => {
    if (!selectedFile || !diff) return;
    for (let i = 0; i < diff.hunks.length; i++) {
      setHunkCollapsed(selectedFile, i, false);
    }
  }, [selectedFile, diff, setHunkCollapsed]);

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
        <DiffHeader file={file} repoRoot={session.repoRoot} isCollapsed={isFileCollapsedState} onToggleCollapse={onToggleFileCollapse} hunkCount={0} />
        {!isFileCollapsedState && (
          <div className="diff-pane__content diff-pane__content--centered">
            <div className="binary-message">
              <p>Binary file</p>
              <p className="dim">{file.path}</p>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="diff-pane">
      <DiffHeader file={file} repoRoot={session.repoRoot} isCollapsed={isFileCollapsedState} onToggleCollapse={onToggleFileCollapse} hunkCount={hunkCount} onCollapseAllHunks={onCollapseAllHunks} onExpandAllHunks={onExpandAllHunks} />
      {!isFileCollapsedState && (
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
      )}
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
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  hunkCount: number;
  onCollapseAllHunks?: () => void;
  onExpandAllHunks?: () => void;
}

function DiffHeader({ file, repoRoot, isCollapsed, onToggleCollapse, hunkCount, onCollapseAllHunks, onExpandAllHunks }: DiffHeaderProps) {
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
        <button
          className="diff-pane__collapse-toggle"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand file' : 'Collapse file'}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>
        {file.renamedFrom && (
          <span className="diff-pane__renamed">
            {file.renamedFrom} →{' '}
          </span>
        )}
        <span className="diff-pane__path">{file.path}</span>
        <div className="diff-pane__actions">
          {!isCollapsed && hunkCount > 1 && (
            <>
              <button
                className="diff-pane__action"
                onClick={onCollapseAllHunks}
                title="Collapse all hunks"
              >
                Collapse all
              </button>
              <button
                className="diff-pane__action"
                onClick={onExpandAllHunks}
                title="Expand all hunks"
              >
                Expand all
              </button>
            </>
          )}
          <button
            className="diff-pane__action"
            onClick={handleCopyPath}
            title="Copy relative path (⌘C)"
          >
            <CopyIcon size={16} />
          </button>
          <button
            className="diff-pane__action"
            onClick={handleOpenInEditor}
            title="Open in editor (⌘⇧O)"
          >
            <CodeBlockIcon size={16} />
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
