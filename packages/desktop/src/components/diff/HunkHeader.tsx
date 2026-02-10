import { memo, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import type { Hunk } from '@revi/shared';

interface HunkHeaderProps {
  hunk: Hunk;
  isCollapsed?: boolean;
  isActive?: boolean;
  onToggleCollapse?: () => void;
}

export const HunkHeader = memo(function HunkHeader({
  hunk,
  isCollapsed = false,
  isActive = false,
  onToggleCollapse,
}: HunkHeaderProps) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  // Extract the function/class context from the header if present
  // Format: @@ -start,count +start,count @@ optional context
  const contextMatch = hunk.header.match(/@@[^@]+@@\s*(.*)/);
  const context = contextMatch?.[1] || '';

  const handleCopyHunk = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();

    const prefixedLines = hunk.lines.map((line) => {
      const prefix = line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' ';
      return `${prefix}${line.content}`;
    });
    const hunkText = [hunk.header, ...prefixedLines].join('\n');

    invoke('copy_to_clipboard', { content: hunkText })
      .then(() => {
        setCopied(true);

        if (resetTimeoutRef.current !== null) {
          window.clearTimeout(resetTimeoutRef.current);
        }

        resetTimeoutRef.current = window.setTimeout(() => {
          setCopied(false);
          resetTimeoutRef.current = null;
        }, 1200);
      })
      .catch((err) => {
        console.error('Failed to copy hunk to clipboard:', err);
      });
  };

  return (
    <div className={clsx('hunk-header', isActive && 'hunk-header--active')} onClick={onToggleCollapse}>
      {onToggleCollapse && (
        <span className="hunk-header__toggle">
          {isCollapsed ? '▶' : '▼'}
        </span>
      )}
      <span className="hunk-header__range">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </span>
      {context && <span className="hunk-header__context">{context}</span>}
      <div className="hunk-header__actions">
        <button
          type="button"
          className={clsx('hunk-header__action', copied && 'hunk-header__action--copied')}
          onClick={handleCopyHunk}
          title={copied ? 'Copied' : 'Copy hunk as text'}
          aria-label={copied ? 'Hunk copied' : 'Copy hunk as text'}
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </button>
      </div>
    </div>
  );
});
