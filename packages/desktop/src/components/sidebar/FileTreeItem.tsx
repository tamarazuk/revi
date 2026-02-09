import clsx from 'clsx';
import type { FileEntry } from '@revi/shared';
import { useReviewStateStore } from '../../stores/reviewState';

interface FileTreeItemProps {
  file: FileEntry;
  isSelected: boolean;
  isFocused?: boolean;
  onSelect: () => void;
}

export function FileTreeItem({ file, isSelected, isFocused, onSelect }: FileTreeItemProps) {
  const fileName = file.path.split('/').pop() || file.path;
  const isViewed = useReviewStateStore((state) => state.isViewed(file.path));

  return (
    <button
      className={clsx('file-tree-item', {
        'file-tree-item--selected': isSelected,
        'file-tree-item--focused': isFocused,
        'file-tree-item--viewed': isViewed,
        'file-tree-item--added': file.status === 'added',
        'file-tree-item--modified': file.status === 'modified',
        'file-tree-item--deleted': file.status === 'deleted',
        'file-tree-item--renamed': file.status === 'renamed',
      })}
      onClick={onSelect}
    >
      <span className="file-tree-item__viewed-indicator">
        {isViewed ? '✓' : '○'}
      </span>
      <span className="file-tree-item__status">
        {getStatusIndicator(file.status)}
      </span>
      <span className="file-tree-item__name" title={file.path}>
        {fileName}
      </span>
      <span className="file-tree-item__stats">
        <span className="addition">+{file.additions}</span>
        <span className="deletion">-{file.deletions}</span>
      </span>
    </button>
  );
}

function getStatusIndicator(status: FileEntry['status']): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
  }
}
