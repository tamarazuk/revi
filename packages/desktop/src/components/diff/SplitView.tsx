import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FileDiff, Hunk, DiffLine as DiffLineType } from '@revi/shared';
import { HunkHeader } from './HunkHeader';
import { SplitDiffLine } from './SplitDiffLine';

interface SplitViewProps {
  diff: FileDiff;
}

// For split view, we pair up old and new lines
export interface LinePair {
  oldLine: DiffLineType | null;
  newLine: DiffLineType | null;
}

type SplitRow =
  | { type: 'hunk-header'; hunk: Hunk; hunkIndex: number }
  | { type: 'line-pair'; pair: LinePair; hunkIndex: number; pairIndex: number };

export function SplitView({ diff }: SplitViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Convert hunks into paired rows for side-by-side display
  const rows = useMemo(() => {
    const result: SplitRow[] = [];

    diff.hunks.forEach((hunk, hunkIndex) => {
      // Add hunk header
      result.push({ type: 'hunk-header', hunk, hunkIndex });

      // Pair up lines for split view
      const pairs = pairLinesForSplit(hunk.lines);
      pairs.forEach((pair, pairIndex) => {
        result.push({ type: 'line-pair', pair, hunkIndex, pairIndex });
      });
    });

    return result;
  }, [diff.hunks]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row.type === 'hunk-header' ? 32 : 22;
    },
    overscan: 20,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
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
                <HunkHeader hunk={row.hunk} />
              ) : (
                <SplitDiffLine pair={row.pair} />
              )}
            </div>
          );
        })}
      </div>
    </div>
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
