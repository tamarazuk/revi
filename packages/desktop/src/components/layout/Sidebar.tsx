import { useSessionStore } from '../../stores/session';
import { useUIStore } from '../../stores/ui';
import { FileTreeItem } from '../sidebar/FileTreeItem';
import { ResizeHandle } from './ResizeHandle';
import type { FileEntry } from '@revi/shared';

export function Sidebar() {
  const { session, selectedFile, selectFile } = useSessionStore();
  const { sidebarVisible, sidebarWidth } = useUIStore();

  if (!session || !sidebarVisible) return null;

  // Group files by directory
  const groupedFiles = groupFilesByDirectory(session.files);

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar__header">
        <span className="sidebar__title">Files changed</span>
        <span className="sidebar__count">{session.files.length}</span>
      </div>

      <div className="sidebar__tree">
        {Object.entries(groupedFiles).map(([dir, files]) => (
          <div key={dir} className="sidebar__group">
            {dir && <div className="sidebar__dir">{dir}</div>}
            {files.map((file) => (
              <FileTreeItem
                key={file.path}
                file={file}
                isSelected={selectedFile === file.path}
                onSelect={() => selectFile(file.path)}
              />
            ))}
          </div>
        ))}
      </div>

      <ResizeHandle />
    </aside>
  );
}

function groupFilesByDirectory(files: FileEntry[]): Record<string, FileEntry[]> {
  const groups: Record<string, FileEntry[]> = {};

  for (const file of files) {
    const lastSlash = file.path.lastIndexOf('/');
    const dir = lastSlash > 0 ? file.path.slice(0, lastSlash) : '';

    if (!groups[dir]) {
      groups[dir] = [];
    }
    groups[dir].push(file);
  }

  return groups;
}
