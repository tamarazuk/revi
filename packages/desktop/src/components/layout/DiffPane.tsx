import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowsInIcon, ArrowsOutIcon, CodeBlockIcon, CopyIcon } from '@phosphor-icons/react';
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
  const [previewMode, setPreviewMode] = useState<'diff' | 'preview'>('diff');

  useEffect(() => {
    setPreviewMode('diff');
  }, [selectedFile]);

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

  const extension = file.path.split('.').pop()?.toLowerCase() ?? '';
  const supportsDualModePreview = !file.binary && extension === 'svg';
  const showPreview = file.binary || (supportsDualModePreview && previewMode === 'preview');

  // Handle binary files
  if (showPreview) {
    return (
      <main className="diff-pane">
        <DiffHeader
          file={file}
          repoRoot={session.repoRoot}
          isCollapsed={isFileCollapsedState}
          onToggleCollapse={onToggleFileCollapse}
          hunkCount={0}
          supportsDualModePreview={supportsDualModePreview}
          previewMode={previewMode}
          onTogglePreviewMode={() => setPreviewMode(previewMode === 'preview' ? 'diff' : 'preview')}
        />
        {!isFileCollapsedState && (
          <div className="diff-pane__content diff-pane__content--centered">
            <BinaryPreview
              repoRoot={session.repoRoot}
              baseSha={session.base.sha}
              headSha={session.head.sha}
              diffMode={diffMode}
              file={file}
            />
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="diff-pane">
      <DiffHeader
        file={file}
        repoRoot={session.repoRoot}
        isCollapsed={isFileCollapsedState}
        onToggleCollapse={onToggleFileCollapse}
        hunkCount={hunkCount}
        onCollapseAllHunks={onCollapseAllHunks}
        onExpandAllHunks={onExpandAllHunks}
        supportsDualModePreview={supportsDualModePreview}
        previewMode={previewMode}
        onTogglePreviewMode={() => setPreviewMode(previewMode === 'preview' ? 'diff' : 'preview')}
      />
      {!isFileCollapsedState && (
        <div className="diff-pane__content">
        {isLoading && !diff && (
          <div className="diff-loading">
            <span className="diff-loading__spinner" />
            Loading diff...
          </div>
        )}
        {isLoading && diff && (
          <div className="diff-loading diff-loading--subtle">
            <span className="diff-loading__spinner" />
            Updating...
          </div>
        )}
        {error && (
          <div className="diff-error">
            <p>Failed to load diff</p>
            <p className="dim">{error}</p>
          </div>
        )}
        {diff && (
          <>
            {diff.hunks.length === 0 ? (
              <div className="diff-empty">
                <p>No changes in this file</p>
              </div>
            ) : diffMode === 'split' ? (
              <SplitView
                diff={diff}
                repoRoot={session.repoRoot}
                filePath={file.path}
                restoreKey={session.sessionId}
                isNewFile={file.status === 'added'}
                collapsedHunks={collapsedHunks}
                onToggleHunk={onToggleHunk}
              />
            ) : (
              <UnifiedView
                diff={diff}
                repoRoot={session.repoRoot}
                filePath={file.path}
                restoreKey={session.sessionId}
                collapsedHunks={collapsedHunks}
                onToggleHunk={onToggleHunk}
              />
            )}
          </>
        )}
      </div>
      )}
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BinaryPreviewProps {
  repoRoot: string;
  baseSha: string;
  headSha: string;
  diffMode: 'split' | 'unified';
  file: {
    path: string;
    status: string;
    binary: boolean;
  };
}

interface BinaryPreviewPayload {
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
}

interface BinaryAsset {
  url: string;
  mimeType: string;
  sizeBytes: number;
  dimensions: { width: number; height: number } | null;
}

function BinaryPreview({ repoRoot, baseSha, headSha, diffMode, file }: BinaryPreviewProps) {
  const [currentAsset, setCurrentAsset] = useState<BinaryAsset | null>(null);
  const [previousAsset, setPreviousAsset] = useState<BinaryAsset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extension = file.path.split('.').pop()?.toLowerCase() ?? 'unknown';
  const isModified = file.status === 'modified' || file.status === 'renamed';

  useEffect(() => {
    const objectUrls: string[] = [];
    let active = true;

    setCurrentAsset(null);
    setPreviousAsset(null);
    setError(null);

    const invokePreview = (statusOverride?: string) => {
      return invoke<BinaryPreviewPayload>('get_binary_preview', {
        repoRoot,
        baseSha,
        headSha,
        filePath: file.path,
        fileStatus: statusOverride ?? file.status,
      });
    };

    const decodeBase64 = (base64Data: string): Uint8Array => {
      const binary = window.atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    };

    const payloadToAsset = async (payload: BinaryPreviewPayload): Promise<BinaryAsset> => {
      const uint8 = decodeBase64(payload.base64Data);
      const arrayBuffer = new ArrayBuffer(uint8.byteLength);
      new Uint8Array(arrayBuffer).set(uint8);
      const blob = new Blob([arrayBuffer], { type: payload.mimeType });
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);

      let dimensions: { width: number; height: number } | null = null;
      if (payload.mimeType.startsWith('image/')) {
        const image = new Image();
        dimensions = await new Promise((resolve, reject) => {
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => reject(new Error('Failed to decode image'));
          image.src = url;
        });
      }

      return {
        url,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
        dimensions,
      };
    };

    const loadPreview = async () => {
      setIsLoading(true);
      try {
        const needsPrevious = isModified;
        const [currentPayload, previousPayload] = await Promise.all([
          invokePreview(),
          needsPrevious ? invokePreview('deleted').catch(() => null) : Promise.resolve(null),
        ]);
        if (!active) return;

        const current = await payloadToAsset(currentPayload);
        if (!active) return;
        setCurrentAsset(current);

        if (previousPayload && previousPayload.mimeType === currentPayload.mimeType) {
          const previous = await payloadToAsset(previousPayload);
          if (!active) return;
          setPreviousAsset(previous);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Preview unavailable for this file state.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadPreview();

    return () => {
      active = false;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [repoRoot, baseSha, headSha, file.path, file.status, isModified]);

  const currentMimeType = currentAsset?.mimeType ?? null;
  const isComparableMime =
    currentMimeType?.startsWith('image/') || currentMimeType === 'application/pdf';
  const showComparison = isModified && Boolean(currentAsset && previousAsset && isComparableMime);

  const statusLabel = file.status === 'deleted'
    ? 'Deleted'
    : file.status === 'added'
      ? 'Added'
      : file.status === 'modified'
        ? 'Modified'
        : file.status === 'renamed'
          ? 'Renamed'
          : file.status;

  const renderAsset = (asset: BinaryAsset, toneClass: string) => {
    if (asset.mimeType.startsWith('image/')) {
      return (
        <img
          className={`binary-preview__image ${toneClass}`}
          src={asset.url}
          alt={`Preview of ${file.path}`}
        />
      );
    }

    if (asset.mimeType === 'application/pdf') {
      return (
        <iframe
          className={`binary-preview__pdf ${toneClass}`}
          src={asset.url}
          title={`Preview of ${file.path}`}
        />
      );
    }

    return <p className="dim">Preview not supported for {asset.mimeType}.</p>;
  };

  const assetMeta = (asset: BinaryAsset) => {
    const parts: string[] = [];
    if (asset.dimensions) {
      parts.push(`${asset.dimensions.width}x${asset.dimensions.height}`);
    }
    parts.push(formatBytes(asset.sizeBytes));
    return parts.join(' · ');
  };

  return (
    <div className="binary-preview">
      <div className="binary-preview__meta">
        <strong>{currentMimeType === 'application/pdf' ? 'PDF preview' : 'Binary preview'}</strong>
        <span className="dim">
          {extension.toUpperCase()}
          {currentAsset?.dimensions ? ` · ${currentAsset.dimensions.width}x${currentAsset.dimensions.height}` : ''}
          {currentAsset ? ` · ${formatBytes(currentAsset.sizeBytes)}` : ''}
        </span>
        <span className={`binary-preview__status binary-preview__status--${file.status}`}>{statusLabel}</span>
      </div>

      {isLoading && (
        <div className="binary-preview__loading">
          <span className="diff-loading__spinner" />
          <span className="dim">Rendering preview...</span>
        </div>
      )}
      {!isLoading && error && <p className="dim">{error}</p>}

      {!isLoading && !error && showComparison && currentAsset && previousAsset && (
        <div
          className={`binary-preview__compare ${
            diffMode === 'unified' ? 'binary-preview__compare--stacked' : ''
          }`}
        >
          <div className="binary-preview__compare-item">
            <div className="binary-preview__compare-label">Before</div>
            <div className="binary-preview__compare-meta dim">{assetMeta(previousAsset)}</div>
            {renderAsset(previousAsset, 'binary-preview__image--before')}
          </div>
          <div className="binary-preview__compare-item">
            <div className="binary-preview__compare-label">After</div>
            <div className="binary-preview__compare-meta dim">{assetMeta(currentAsset)}</div>
            {renderAsset(currentAsset, 'binary-preview__image--after')}
          </div>
        </div>
      )}

      {!isLoading && !error && !showComparison && currentAsset && (
        <div className="binary-preview__single">
          {renderAsset(currentAsset, `binary-preview__image--${file.status}`)}
        </div>
      )}
    </div>
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
  supportsDualModePreview?: boolean;
  previewMode?: 'diff' | 'preview';
  onTogglePreviewMode?: () => void;
}

function DiffHeader({
  file,
  repoRoot,
  isCollapsed,
  onToggleCollapse,
  hunkCount,
  onCollapseAllHunks,
  onExpandAllHunks,
  supportsDualModePreview = false,
  previewMode = 'diff',
  onTogglePreviewMode,
}: DiffHeaderProps) {
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
          <button
            className="diff-pane__action diff-pane__action--icon"
            onClick={handleCopyPath}
            title="Copy relative path (⌘C)"
          >
            <CopyIcon size={16} />
          </button>
          <button
            className="diff-pane__action diff-pane__action--icon"
            onClick={handleOpenInEditor}
            title="Open in editor (⌘⇧O)"
          >
            <CodeBlockIcon size={16} />
          </button>
          {supportsDualModePreview && onTogglePreviewMode && (
            <button
              className="diff-pane__action diff-pane__action--toggle"
              onClick={onTogglePreviewMode}
              title={previewMode === 'preview' ? 'Show diff view' : 'Show preview view'}
            >
              {previewMode === 'preview' ? 'Diff' : 'Preview'}
            </button>
          )}
          {!isCollapsed && hunkCount > 1 && (
            <>
              <span className="diff-pane__actions-divider" aria-hidden="true" />
              <button
                className="diff-pane__action diff-pane__action--icon"
                onClick={onCollapseAllHunks}
                title="Collapse all hunks"
                aria-label="Collapse all hunks"
              >
                <ArrowsInIcon size={16} />
              </button>
              <button
                className="diff-pane__action diff-pane__action--icon"
                onClick={onExpandAllHunks}
                title="Expand all hunks"
                aria-label="Expand all hunks"
              >
                <ArrowsOutIcon size={16} />
              </button>
            </>
          )}
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
