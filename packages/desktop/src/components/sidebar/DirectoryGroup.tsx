import type { FileEntry } from '@revi/shared';
import { useSidebarStore } from '../../stores/sidebar';
import { FileTreeItem } from './FileTreeItem';

interface DirectoryGroupProps {
  dirPath: string;
  files: FileEntry[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  focusedFile: string | null;
}

export function DirectoryGroup({
  dirPath,
  files,
  selectedFile,
  onSelectFile,
  focusedFile,
}: DirectoryGroupProps) {
  const { expandedDirs, toggleDir } = useSidebarStore();

  // Root-level files (empty dir path) are always shown
  const isRootLevel = dirPath === '';
  const isExpanded = isRootLevel || expandedDirs.has(dirPath);

  // Calculate aggregate stats for the directory
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  if (isRootLevel) {
    // Render files without a directory header
    return (
      <div className="directory-group directory-group--root">
        {files.map((file) => (
          <FileTreeItem
            key={file.path}
            file={file}
            isSelected={selectedFile === file.path}
            isFocused={focusedFile === file.path}
            onSelect={() => onSelectFile(file.path)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="directory-group">
      <button
        className="directory-group__header"
        onClick={() => toggleDir(dirPath)}
        aria-expanded={isExpanded}
      >
        <span className="directory-group__chevron">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="directory-group__name">{dirPath}</span>
        <span className="directory-group__stats">
          <span className="directory-group__count">{files.length}</span>
          <span className="addition">+{totalAdditions}</span>
          <span className="deletion">-{totalDeletions}</span>
        </span>
      </button>
      {isExpanded && (
        <div className="directory-group__files">
          {files.map((file) => (
            <FileTreeItem
              key={file.path}
              file={file}
              isSelected={selectedFile === file.path}
              isFocused={focusedFile === file.path}
              onSelect={() => onSelectFile(file.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
