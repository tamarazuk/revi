import { useEffect, useRef, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import type { FileDiff, Hunk, DiffLine as DiffLineType } from '@revi/shared';
import { DiffLine } from './DiffLine';
import { HunkHeader } from './HunkHeader';
import { ContextMenu, useContextMenu } from '../ui/ContextMenu';
import { useDiffNavigation } from '../../hooks/useDiffNavigation';
import { useKeyboardStore } from '../../stores/keyboard';

interface UnifiedViewProps {
  diff: FileDiff;
  repoRoot: string;
  filePath: string;
  collapsedHunks: Set<number>;
  onToggleHunk: (hunkIndex: number) => void;
}

// A row in the virtualized list can be either a hunk header or a diff line
type VirtualRow =
  | { type: 'hunk-header'; hunk: Hunk; hunkIndex: number }
  | { type: 'line'; line: DiffLineType; hunkIndex: number; lineIndex: number };

export function UnifiedView({ diff, repoRoot, filePath, collapsedHunks, onToggleHunk }: UnifiedViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const closeMenuTimerRef = useRef<number | null>(null);
  const activeHunkIndex = useKeyboardStore((s) => s.activeHunkIndex);
  const { menuState, openMenu, closeMenu } = useContextMenu();
  const [contextTarget, setContextTarget] = useState<{
    line: DiffLineType;
    hunkIndex: number;
  } | null>(null);
  const [copiedAction, setCopiedAction] = useState<'line' | 'hunk' | null>(null);

  useEffect(() => {
    return () => {
      if (closeMenuTimerRef.current !== null) {
        window.clearTimeout(closeMenuTimerRef.current);
      }
    };
  }, []);

  // Flatten hunks and lines into a single array of virtual rows
  const rows = useMemo(() => {
    const result: VirtualRow[] = [];

    diff.hunks.forEach((hunk, hunkIndex) => {
      // Add hunk header
      result.push({ type: 'hunk-header', hunk, hunkIndex });

      // Skip lines for collapsed hunks
      if (collapsedHunks.has(hunkIndex)) return;

      // Add all lines in this hunk
      hunk.lines.forEach((line, lineIndex) => {
        result.push({ type: 'line', line, hunkIndex, lineIndex });
      });
    });

    return result;
  }, [diff.hunks, collapsedHunks]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      // Hunk headers are slightly taller
      return row.type === 'hunk-header' ? 32 : 22;
    },
    overscan: 20, // Render extra items above/below viewport
  });

  useDiffNavigation(rows, virtualizer);

  const virtualItems = virtualizer.getVirtualItems();

  const handleLineContextMenu = (e: React.MouseEvent, line: DiffLineType, hunkIndex: number) => {
    setCopiedAction(null);
    setContextTarget({ line, hunkIndex });
    openMenu(e);
  };

  const showCopiedFeedback = (action: 'line' | 'hunk') => {
    setCopiedAction(action);

    if (closeMenuTimerRef.current !== null) {
      window.clearTimeout(closeMenuTimerRef.current);
    }

    closeMenuTimerRef.current = window.setTimeout(() => {
      setCopiedAction(null);
      closeMenu();
      closeMenuTimerRef.current = null;
    }, 700);
  };

  const handleCopyLine = () => {
    if (!contextTarget) return;
    const prefix = contextTarget.line.type === 'added' ? '+' : contextTarget.line.type === 'deleted' ? '-' : ' ';
    invoke('copy_to_clipboard', { content: `${prefix}${contextTarget.line.content}` })
      .then(() => {
        showCopiedFeedback('line');
      })
      .catch((err) => {
        console.error('Failed to copy line to clipboard:', err);
      });
  };

  const handleCopyHunk = () => {
    if (!contextTarget) return;
    const hunk = diff.hunks[contextTarget.hunkIndex];
    const lines = hunk.lines.map((line) => {
      const prefix = line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' ';
      return `${prefix}${line.content}`;
    });
    invoke('copy_to_clipboard', { content: [hunk.header, ...lines].join('\n') })
      .then(() => {
        showCopiedFeedback('hunk');
      })
      .catch((err) => {
        console.error('Failed to copy hunk to clipboard:', err);
      });
  };

  const handleOpenInEditor = () => {
    if (!contextTarget) return;
    const line = contextTarget.line.newLineNum ?? contextTarget.line.oldLineNum ?? null;
    invoke('open_in_editor', { filePath: `${repoRoot}/${filePath}`, line }).catch((err) => {
      console.error('Failed to open in editor:', err);
    });
  };

  const contextMenuItems = [
    {
      label: copiedAction === 'line' ? 'Copied line ✓' : 'Copy Line',
      onClick: handleCopyLine,
      closeOnClick: false,
    },
    {
      label: copiedAction === 'hunk' ? 'Copied hunk ✓' : 'Copy Hunk',
      onClick: handleCopyHunk,
      closeOnClick: false,
    },
    { label: 'Open in Editor', onClick: handleOpenInEditor },
  ];

  return (
    <>
      <div ref={parentRef} className="unified-view">
        <div
          className="unified-view__content"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];

            return (
              <div
                key={virtualRow.key}
                className="unified-view__row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onContextMenu={
                  row.type === 'line'
                    ? (e) => handleLineContextMenu(e, row.line, row.hunkIndex)
                    : undefined
                }
              >
                {row.type === 'hunk-header' ? (
                  <HunkHeader
                    hunk={row.hunk}
                    isCollapsed={collapsedHunks.has(row.hunkIndex)}
                    isActive={row.hunkIndex === activeHunkIndex}
                    onToggleCollapse={() => onToggleHunk(row.hunkIndex)}
                  />
                ) : (
                  <DiffLine line={row.line} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {menuState.isOpen && contextTarget && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          onClose={closeMenu}
          items={contextMenuItems}
        />
      )}
    </>
  );
}
