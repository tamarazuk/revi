import type { HighlightSpan } from '@revi/shared';

interface HighlightedCodeProps {
  content: string;
  highlights: HighlightSpan[];
  emptyClassName?: string;
}

export function HighlightedCode({ content, highlights, emptyClassName = 'diff-line__empty' }: HighlightedCodeProps) {
  if (!content) {
    return <span className={emptyClassName}>&nbsp;</span>;
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
