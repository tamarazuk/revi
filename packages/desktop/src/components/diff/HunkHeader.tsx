import { memo } from 'react';
import type { Hunk } from '@revi/shared';

interface HunkHeaderProps {
  hunk: Hunk;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const HunkHeader = memo(function HunkHeader({
  hunk,
  isCollapsed = false,
  onToggleCollapse,
}: HunkHeaderProps) {
  // Extract the function/class context from the header if present
  // Format: @@ -start,count +start,count @@ optional context
  const contextMatch = hunk.header.match(/@@[^@]+@@\s*(.*)/);
  const context = contextMatch?.[1] || '';

  return (
    <div className="hunk-header" onClick={onToggleCollapse}>
      {onToggleCollapse && (
        <span className="hunk-header__toggle">
          {isCollapsed ? '▶' : '▼'}
        </span>
      )}
      <span className="hunk-header__range">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </span>
      {context && <span className="hunk-header__context">{context}</span>}
    </div>
  );
});
