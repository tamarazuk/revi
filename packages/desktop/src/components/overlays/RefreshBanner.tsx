import { ArrowsClockwiseIcon, XIcon } from '@phosphor-icons/react';

interface RefreshBannerProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

export function RefreshBanner({ onRefresh, onDismiss }: RefreshBannerProps) {
  return (
    <div className="refresh-banner">
      <span className="refresh-banner__text">Changes detected</span>
      <div className="refresh-banner__actions">
        <button
          className="refresh-banner__btn refresh-banner__btn--primary"
          onClick={onRefresh}
          title="Refresh to see changes (R)"
        >
          <ArrowsClockwiseIcon size={14} />
          Refresh
        </button>
        <button
          className="refresh-banner__btn refresh-banner__btn--secondary"
          onClick={onDismiss}
          title="Dismiss until next change"
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}
