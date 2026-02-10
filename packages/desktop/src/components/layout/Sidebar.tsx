import { useMemo, useEffect, useRef } from 'react';
import { SidebarSimple as SidebarSimpleIcon } from '@phosphor-icons/react';
import { useSessionStore } from '../../stores/session';
import { useUIStore } from '../../stores/ui';
import { useSidebarStore, expandAllDirs } from '../../stores/sidebar';
import { useReviewStateStore } from '../../stores/reviewState';
import { FileFilter } from '../sidebar/FileFilter';
import { DirectoryGroup } from '../sidebar/DirectoryGroup';
import { ResizeHandle } from './ResizeHandle';
import type { FileEntry } from '@revi/shared';

export function Sidebar() {
  const { session, selectedFile, selectFile } = useSessionStore();
  const { sidebarVisible, sidebarWidth, toggleSidebar } = useUIStore();
  const { filter } = useSidebarStore();
  const { isViewed } = useReviewStateStore();

  // Filter files based on current filter state
  const filteredFiles = useMemo(() => {
    if (!session) return [];

    return session.files.filter((file) => {
      // Status filter
      if (filter.status.length > 0 && !filter.status.includes(file.status)) {
        return false;
      }

      // Search filter
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        if (!file.path.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Viewed filter
      if (filter.viewedState !== 'all') {
        const fileIsViewed = isViewed(file.path);
        if (filter.viewedState === 'viewed' && !fileIsViewed) {
          return false;
        }
        if (filter.viewedState === 'unviewed' && fileIsViewed) {
          return false;
        }
      }

      return true;
    });
  }, [session, filter, isViewed]);

  // Group files by directory
  const groupedFiles = useMemo(() => {
    return groupFilesByDirectory(filteredFiles);
  }, [filteredFiles]);

  // Get all directory paths for expand all functionality
  const allDirs = useMemo(() => {
    return Object.keys(groupedFiles).filter((dir) => dir !== '');
  }, [groupedFiles]);

  // Auto-expand all directories on initial load only
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (allDirs.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      expandAllDirs(allDirs);
    }
  }, [allDirs]);

  if (!session) return null;

  // When sidebar is hidden, show a narrow strip with a reopen button
  if (!sidebarVisible) {
    return (
      <aside className="sidebar sidebar--collapsed">
        <button
          className="sidebar__reopen"
          onClick={toggleSidebar}
          title="Show sidebar (b)"
        >
          <SidebarSimpleIcon size={18} />
        </button>
      </aside>
    );
  }

  const hasActiveFilters =
    filter.status.length > 0 || filter.searchQuery !== '' || filter.viewedState !== 'all';

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar__header">
        <span className="sidebar__title">Files changed</span>
        <div className="sidebar__header-actions">
          <span className="sidebar__count">
            {hasActiveFilters
              ? `${filteredFiles.length}/${session.files.length}`
              : session.files.length}
          </span>
          <button
            className="sidebar__toggle"
            onClick={toggleSidebar}
            title="Hide sidebar (b)"
          >
            <SidebarSimpleIcon size={16} />
          </button>
        </div>
      </div>

      <FileFilter />

      <div className="sidebar__tree">
        {filteredFiles.length === 0 ? (
          <div className="sidebar__empty">
            {hasActiveFilters ? 'No files match the current filter' : 'No changed files'}
          </div>
        ) : (
          Object.entries(groupedFiles).map(([dir, files]) => (
            <DirectoryGroup
              key={dir || '__root__'}
              dirPath={dir}
              files={files}
              repoRoot={session.repoRoot}
              selectedFile={selectedFile}
              onSelectFile={selectFile}
              focusedFile={selectedFile}
            />
          ))
        )}
      </div>

      <div className="sidebar__footer">
        <span className="sidebar__hint">
          <kbd>j</kbd>/<kbd>k</kbd> navigate · <kbd>v</kbd> viewed · <kbd>?</kbd> help
        </span>
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

  // Sort directories alphabetically, with root files first
  const sortedGroups: Record<string, FileEntry[]> = {};
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    sortedGroups[key] = groups[key];
  }

  return sortedGroups;
}
