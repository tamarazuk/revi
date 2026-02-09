import { memo } from 'react';
import type { DiffLine as DiffLineType, HighlightSpan } from '@revi/shared';
import clsx from 'clsx';

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

interface HighlightedCodeProps {
  content: string;
  highlights: HighlightSpan[];
}

function HighlightedCode({ content, highlights }: HighlightedCodeProps) {
  if (!content) {
    return <span className="diff-line__empty">&nbsp;</span>;
  }

  if (highlights.length === 0) {
    return <>{content}</>;
  }

  // Sort highlights by start position
  const sorted = [...highlights].sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (let i = 0; i < sorted.length; i++) {
    const span = sorted[i];

    // Add any text before this highlight
    if (span.start > lastEnd) {
      parts.push(
        <span key={`plain-${i}`}>{content.slice(lastEnd, span.start)}</span>
      );
    }

    // Add the highlighted span
    const scopeClass = `hl-${span.scope.replace(/\./g, '-')}`;
    parts.push(
      <span key={`hl-${i}`} className={scopeClass}>
        {content.slice(span.start, span.end)}
      </span>
    );

    lastEnd = span.end;
  }

  // Add any remaining text after the last highlight
  if (lastEnd < content.length) {
    parts.push(<span key="plain-end">{content.slice(lastEnd)}</span>);
  }

  return <>{parts}</>;
}
