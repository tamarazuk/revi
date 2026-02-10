import { useEffect, useRef, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import type { FileDiff, Hunk, DiffLine as DiffLineType } from '@revi/shared';
import { HunkHeader } from './HunkHeader';
import { SplitDiffLine } from './SplitDiffLine';
import { ContextMenu, useContextMenu } from '../ui/ContextMenu';
import { useDiffNavigation } from '../../hooks/useDiffNavigation';
import { useKeyboardStore } from '../../stores/keyboard';

interface SplitViewProps {
  diff: FileDiff;
  repoRoot: string;
  filePath: string;
  collapsedHunks: Set<number>;
  onToggleHunk: (hunkIndex: number) => void;
}

// For split view, we pair up old and new lines
export interface LinePair {
  oldLine: DiffLineType | null;
  newLine: DiffLineType | null;
}

type SplitRow =
  | { type: 'hunk-header'; hunk: Hunk; hunkIndex: number }
  | { type: 'line-pair'; pair: LinePair; hunkIndex: number; pairIndex: number };

export function SplitView({ diff, repoRoot, filePath, collapsedHunks, onToggleHunk }: SplitViewProps) {
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

  // Convert hunks into paired rows for side-by-side display
  const rows = useMemo(() => {
    const result: SplitRow[] = [];

    diff.hunks.forEach((hunk, hunkIndex) => {
      // Add hunk header
      result.push({ type: 'hunk-header', hunk, hunkIndex });

      // Skip lines for collapsed hunks
      if (collapsedHunks.has(hunkIndex)) return;

      // Pair up lines for split view
      const pairs = pairLinesForSplit(hunk.lines);
      pairs.forEach((pair, pairIndex) => {
        result.push({ type: 'line-pair', pair, hunkIndex, pairIndex });
      });
    });

    return result;
  }, [diff.hunks, collapsedHunks]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row.type === 'hunk-header' ? 32 : 22;
    },
    overscan: 20,
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
      <div ref={parentRef} className="split-view">
        <div
          className="split-view__content"
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
                className="split-view__row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.type === 'hunk-header' ? (
                  <HunkHeader
                    hunk={row.hunk}
                    isCollapsed={collapsedHunks.has(row.hunkIndex)}
                    isActive={row.hunkIndex === activeHunkIndex}
                    onToggleCollapse={() => onToggleHunk(row.hunkIndex)}
                  />
                ) : (
                  <SplitDiffLine
                    pair={row.pair}
                    onOldContextMenu={(e, line) => handleLineContextMenu(e, line, row.hunkIndex)}
                    onNewContextMenu={(e, line) => handleLineContextMenu(e, line, row.hunkIndex)}
                  />
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

/**
 * Pair lines for side-by-side split view.
 * 
 * Algorithm:
 * - Context lines appear on both sides
 * - Deletions appear on the left, additions on the right
 * - When we have consecutive deletions followed by additions, we pair them
 * - Unpaired deletions have empty right side
 * - Unpaired additions have empty left side
 */
function pairLinesForSplit(lines: DiffLineType[]): LinePair[] {
  const pairs: LinePair[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'context') {
      // Context lines appear on both sides
      pairs.push({ oldLine: line, newLine: line });
      i++;
    } else if (line.type === 'deleted') {
      // Collect consecutive deletions
      const deletions: DiffLineType[] = [];
      while (i < lines.length && lines[i].type === 'deleted') {
        deletions.push(lines[i]);
        i++;
      }

      // Collect consecutive additions that follow
      const additions: DiffLineType[] = [];
      while (i < lines.length && lines[i].type === 'added') {
        additions.push(lines[i]);
        i++;
      }

      // Pair them up
      const maxLen = Math.max(deletions.length, additions.length);
      for (let j = 0; j < maxLen; j++) {
        pairs.push({
          oldLine: deletions[j] || null,
          newLine: additions[j] || null,
        });
      }
    } else if (line.type === 'added') {
      // Standalone addition (no preceding deletion)
      pairs.push({ oldLine: null, newLine: line });
      i++;
    } else {
      i++;
    }
  }

  return pairs;
}
