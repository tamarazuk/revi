import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from '@revi/shared';
import { useReviewStateStore } from '../../stores/reviewState';
import { ContextMenu, useContextMenu } from '../ui/ContextMenu';

interface FileTreeItemProps {
  file: FileEntry;
  repoRoot: string;
  isSelected: boolean;
  isFocused?: boolean;
  onSelect: () => void;
}

export function FileTreeItem({ file, repoRoot, isSelected, isFocused, onSelect }: FileTreeItemProps) {
  const fileName = file.path.split('/').pop() || file.path;
  const isViewed = useReviewStateStore((state) => state.isViewed(file.path));
  const { toggleViewed, files: reviewFiles } = useReviewStateStore();
  const { menuState, openMenu, closeMenu } = useContextMenu();

  const fullPath = `${repoRoot}/${file.path}`;

  const handleToggleViewed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const existingState = reviewFiles[file.path];
    toggleViewed(
      file.path,
      existingState?.contentHash || '',
      existingState?.diffStats || { additions: file.additions, deletions: file.deletions },
    );
  };

  const handleOpenInEditor = () => {
    invoke('open_in_editor', { filePath: fullPath, line: null }).catch((err) => {
      console.error('Failed to open in editor:', err);
    });
  };

  const handleCopyPath = () => {
    invoke('copy_to_clipboard', { content: fullPath }).catch((err) => {
      console.error('Failed to copy to clipboard:', err);
    });
  };

  const handleCopyRelativePath = () => {
    invoke('copy_to_clipboard', { content: file.path }).catch((err) => {
      console.error('Failed to copy to clipboard:', err);
    });
  };

  const contextMenuItems = [
    { label: 'Open in Editor', shortcut: '\u2318\u21e7O', onClick: handleOpenInEditor },
    { label: 'Copy Relative Path', shortcut: '\u2318C', onClick: handleCopyRelativePath },
    { label: 'Copy Absolute Path', shortcut: '\u2318\u21e7C', onClick: handleCopyPath },
  ];

  return (
    <>
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
        onContextMenu={openMenu}
      >
        <span
          className="file-tree-item__viewed-indicator"
          onClick={handleToggleViewed}
          title={isViewed ? 'Mark as unviewed' : 'Mark as viewed'}
        >
          {isViewed ? '\u2713' : '\u25cb'}
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
      {menuState.isOpen && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          onClose={closeMenu}
          items={contextMenuItems}
        />
      )}
    </>
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
