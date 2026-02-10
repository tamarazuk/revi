import { memo } from 'react';
import type { DiffLine as DiffLineType } from '@revi/shared';
import clsx from 'clsx';
import { HighlightedCode } from './HighlightedCode';
import type { LinePair } from './SplitView';

interface SplitDiffLineProps {
  pair: LinePair;
  fullWidthNewFile?: boolean;
  onOldContextMenu?: (e: React.MouseEvent, line: DiffLineType) => void;
  onNewContextMenu?: (e: React.MouseEvent, line: DiffLineType) => void;
}

export const SplitDiffLine = memo(function SplitDiffLine({
  pair,
  fullWidthNewFile = false,
  onOldContextMenu,
  onNewContextMenu,
}: SplitDiffLineProps) {
  if (fullWidthNewFile && !pair.oldLine && pair.newLine) {
    return (
      <div className="split-diff-line split-diff-line--full-width">
        <SplitSide
          line={pair.newLine}
          side="new"
          fullWidth
          onContextMenu={onNewContextMenu}
        />
      </div>
    );
  }

  return (
    <div className="split-diff-line">
      <SplitSide line={pair.oldLine} side="old" onContextMenu={onOldContextMenu} />
      <SplitSide line={pair.newLine} side="new" onContextMenu={onNewContextMenu} />
    </div>
  );
});

interface SplitSideProps {
  line: DiffLineType | null;
  side: 'old' | 'new';
  fullWidth?: boolean;
  onContextMenu?: (e: React.MouseEvent, line: DiffLineType) => void;
}

function SplitSide({ line, side, fullWidth = false, onContextMenu }: SplitSideProps) {
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
        'split-side--full-width': fullWidth,
        'split-side--added': line.type === 'added',
        'split-side--deleted': line.type === 'deleted',
        'split-side--context': line.type === 'context',
      })}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, line) : undefined}
    >
      <span className="split-side__num">{lineNum ?? ''}</span>
      <span className="split-side__marker">
        {isModified ? (line.type === 'added' ? '+' : '-') : ' '}
      </span>
      <span className="split-side__content">
        <HighlightedCode
          content={line.content}
          highlights={line.highlights}
          emptyClassName="split-side__empty"
        />
      </span>
    </div>
  );
}
