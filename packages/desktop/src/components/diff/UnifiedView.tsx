import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FileDiff, Hunk, DiffLine as DiffLineType } from '@revi/shared';
import { DiffLine } from './DiffLine';
import { HunkHeader } from './HunkHeader';

interface UnifiedViewProps {
  diff: FileDiff;
}

// A row in the virtualized list can be either a hunk header or a diff line
type VirtualRow =
  | { type: 'hunk-header'; hunk: Hunk; hunkIndex: number }
  | { type: 'line'; line: DiffLineType; hunkIndex: number; lineIndex: number };

export function UnifiedView({ diff }: UnifiedViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Flatten hunks and lines into a single array of virtual rows
  const rows = useMemo(() => {
    const result: VirtualRow[] = [];

    diff.hunks.forEach((hunk, hunkIndex) => {
      // Add hunk header
      result.push({ type: 'hunk-header', hunk, hunkIndex });

      // Add all lines in this hunk
      hunk.lines.forEach((line, lineIndex) => {
        result.push({ type: 'line', line, hunkIndex, lineIndex });
      });
    });

    return result;
  }, [diff.hunks]);

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

  const virtualItems = virtualizer.getVirtualItems();

  return (
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
            >
              {row.type === 'hunk-header' ? (
                <HunkHeader hunk={row.hunk} />
              ) : (
                <DiffLine line={row.line} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
