import { memo } from 'react';
import type { DiffLine as DiffLineType, HighlightSpan } from '@revi/shared';
import clsx from 'clsx';

interface LinePair {
  oldLine: DiffLineType | null;
  newLine: DiffLineType | null;
}

interface SplitDiffLineProps {
  pair: LinePair;
}

export const SplitDiffLine = memo(function SplitDiffLine({ pair }: SplitDiffLineProps) {
  return (
    <div className="split-diff-line">
      <SplitSide line={pair.oldLine} side="old" />
      <SplitSide line={pair.newLine} side="new" />
    </div>
  );
});

interface SplitSideProps {
  line: DiffLineType | null;
  side: 'old' | 'new';
}

function SplitSide({ line, side }: SplitSideProps) {
  if (!line) {
    // Empty side (no corresponding line)
    return (
      <div className={clsx('split-side', 'split-side--empty', `split-side--${side}`)}>
        <span className="split-side__num" />
        <span className="split-side__content" />
      </div>
    );
  }

  const lineNum = side === 'old' ? line.oldLineNum : line.newLineNum;
  const isModified = line.type !== 'context';

  return (
    <div
      className={clsx('split-side', `split-side--${side}`, {
        'split-side--added': line.type === 'added',
        'split-side--deleted': line.type === 'deleted',
        'split-side--context': line.type === 'context',
      })}
    >
      <span className="split-side__num">{lineNum ?? ''}</span>
      <span className="split-side__marker">
        {isModified ? (line.type === 'added' ? '+' : '-') : ' '}
      </span>
      <span className="split-side__content">
        <HighlightedCode content={line.content} highlights={line.highlights} />
      </span>
    </div>
  );
}

interface HighlightedCodeProps {
  content: string;
  highlights: HighlightSpan[];
}

function HighlightedCode({ content, highlights }: HighlightedCodeProps) {
  if (!content) {
    return <span className="split-side__empty">&nbsp;</span>;
  }

  if (highlights.length === 0) {
    return <>{content}</>;
  }

  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (let i = 0; i < sorted.length; i++) {
    const span = sorted[i];

    if (span.start > lastEnd) {
      parts.push(
        <span key={`plain-${i}`}>{content.slice(lastEnd, span.start)}</span>
      );
    }

    const scopeClass = `hl-${span.scope.replace(/\./g, '-')}`;
    parts.push(
      <span key={`hl-${i}`} className={scopeClass}>
        {content.slice(span.start, span.end)}
      </span>
    );

    lastEnd = span.end;
  }

  if (lastEnd < content.length) {
    parts.push(<span key="plain-end">{content.slice(lastEnd)}</span>);
  }

  return <>{parts}</>;
}
