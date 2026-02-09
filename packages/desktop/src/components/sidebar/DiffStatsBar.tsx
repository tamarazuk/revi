interface DiffStatsBarProps {
  additions: number;
  deletions: number;
  maxChanges?: number;
}

const BAR_WIDTH = 50; // Total width in pixels for the bar

export function DiffStatsBar({ additions, deletions, maxChanges }: DiffStatsBarProps) {
  const total = additions + deletions;
  
  if (total === 0) {
    return (
      <span className="diff-stats-bar">
        <span className="diff-stats-bar__text dim">-</span>
      </span>
    );
  }

  // Calculate proportions for the visual bar
  const addRatio = additions / total;
  
  // Calculate width based on relative size to max if provided
  const scale = maxChanges ? Math.min(total / maxChanges, 1) : 1;
  const barWidth = Math.round(BAR_WIDTH * scale);
  const addWidth = Math.round(barWidth * addRatio);
  const delWidth = barWidth - addWidth;

  return (
    <span className="diff-stats-bar">
      <span className="diff-stats-bar__text">
        <span className="addition">+{additions}</span>
        <span className="deletion">-{deletions}</span>
      </span>
      <span className="diff-stats-bar__visual" style={{ width: BAR_WIDTH }}>
        <span
          className="diff-stats-bar__add"
          style={{ width: addWidth }}
        />
        <span
          className="diff-stats-bar__del"
          style={{ width: delWidth }}
        />
      </span>
    </span>
  );
}
