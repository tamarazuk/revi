import { memo } from 'react';
import type { DiffLine as DiffLineType } from '@revi/shared';
import clsx from 'clsx';
import { HighlightedCode } from './HighlightedCode';

interface DiffLineProps {
  line: DiffLineType;
  showOldLineNum?: boolean;
  showNewLineNum?: boolean;
}

export const DiffLine = memo(function DiffLine({
  line,
  showOldLineNum = true,
  showNewLineNum = true,
}: DiffLineProps) {
  return (
    <div
      className={clsx('diff-line', {
        'diff-line--added': line.type === 'added',
        'diff-line--deleted': line.type === 'deleted',
        'diff-line--context': line.type === 'context',
      })}
    >
      {showOldLineNum && (
        <span className="diff-line__num diff-line__num--old">
          {line.oldLineNum ?? ''}
        </span>
      )}
      {showNewLineNum && (
        <span className="diff-line__num diff-line__num--new">
          {line.newLineNum ?? ''}
        </span>
      )}
      <span className="diff-line__marker">
        {line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' '}
      </span>
      <span className="diff-line__content">
        <HighlightedCode content={line.content} highlights={line.highlights} />
      </span>
    </div>
  );
});
