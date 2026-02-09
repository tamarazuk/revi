import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '../stores/session';
import { useUIStore } from '../stores/ui';
import { useKeyboardStore } from '../stores/keyboard';
import { useSidebarStore } from '../stores/sidebar';
import { useReviewStateStore } from '../stores/reviewState';
import type { FileEntry } from '@revi/shared';

/**
 * Central keyboard manager. Attaches a single global keydown listener
 * handling all app-level shortcuts (file nav, hunk nav, view toggles, help overlay).
 */
export function useKeyboardManager() {
  const session = useSessionStore((s) => s.session);
  const selectedFile = useSessionStore((s) => s.selectedFile);
  const selectFile = useSessionStore((s) => s.selectFile);

  const { toggleDiffMode, toggleSidebar, sidebarVisible } = useUIStore();
  const { expandedDirs, expandDir } = useSidebarStore();
  const { toggleViewed, files: reviewFiles, setHunkCollapsed } = useReviewStateStore();
  const { filter } = useSidebarStore();
  const { isViewed } = useReviewStateStore();

  const {
    helpOverlayOpen,
    toggleHelpOverlay,
    closeHelpOverlay,
    goToNextHunk,
    goToPrevHunk,
    activeHunkIndex,
    resetHunkNavigation,
  } = useKeyboardStore();

  // Reset hunk navigation when file changes
  useEffect(() => {
    resetHunkNavigation();
  }, [selectedFile, resetHunkNavigation]);

  // Compute visible files (respecting sidebar filter + collapsed dirs)
  const getVisibleFiles = useCallback((): FileEntry[] => {
    if (!session) return [];

    const filtered = session.files.filter((file) => {
      if (filter.status.length > 0 && !filter.status.includes(file.status)) return false;
      if (filter.searchQuery) {
        if (!file.path.toLowerCase().includes(filter.searchQuery.toLowerCase())) return false;
      }
      if (filter.viewedState !== 'all') {
        const fileIsViewed = isViewed(file.path);
        if (filter.viewedState === 'viewed' && !fileIsViewed) return false;
        if (filter.viewedState === 'unviewed' && fileIsViewed) return false;
      }
      return true;
    });

    // Group by directory
    const groups: Record<string, FileEntry[]> = {};
    for (const file of filtered) {
      const lastSlash = file.path.lastIndexOf('/');
      const dir = lastSlash > 0 ? file.path.slice(0, lastSlash) : '';
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(file);
    }

    // Sort directories to match sidebar visual order: root first, then alphabetical
    const sortedDirs = Object.keys(groups).sort((a, b) => {
      if (a === '') return -1;
      if (b === '') return 1;
      return a.localeCompare(b);
    });

    const visible: FileEntry[] = [];
    for (const dir of sortedDirs) {
      const isRootLevel = dir === '';
      const isExpanded = isRootLevel || expandedDirs.has(dir);
      if (isExpanded) visible.push(...groups[dir]);
    }
    return visible;
  }, [session, filter, isViewed, expandedDirs]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // When help overlay is open, only allow closing it
      if (helpOverlayOpen) {
        if (e.key === '?' || e.key === 'Escape') {
          e.preventDefault();
          closeHelpOverlay();
        }
        return;
      }

      // Cmd/Ctrl+N: open new window
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        invoke('create_window');
        return;
      }

      const visibleFiles = getVisibleFiles();
      const currentIndex = selectedFile
        ? visibleFiles.findIndex((f) => f.path === selectedFile)
        : -1;

      switch (e.key) {
        // --- File navigation (ported) ---
        case 'j':
        case 'ArrowDown': {
          if (!sidebarVisible) break;
          e.preventDefault();
          if (visibleFiles.length === 0) break;
          const nextIndex = Math.min(currentIndex + 1, visibleFiles.length - 1);
          const nextFile = visibleFiles[nextIndex];
          if (nextFile) {
            selectFile(nextFile.path);
            const lastSlash = nextFile.path.lastIndexOf('/');
            if (lastSlash > 0) expandDir(nextFile.path.slice(0, lastSlash));
          }
          break;
        }
        case 'k':
        case 'ArrowUp': {
          if (!sidebarVisible) break;
          e.preventDefault();
          if (visibleFiles.length === 0) break;
          const prevIndex = Math.max(currentIndex - 1, 0);
          const prevFile = visibleFiles[prevIndex];
          if (prevFile) selectFile(prevFile.path);
          break;
        }
        case 'Enter':
        case 'o': {
          e.preventDefault();
          if (selectedFile) selectFile(selectedFile);
          break;
        }
        case 'g': {
          if (e.shiftKey) {
            // G → last file
            e.preventDefault();
            const last = visibleFiles[visibleFiles.length - 1];
            if (last) selectFile(last.path);
          } else {
            // g → first file
            e.preventDefault();
            const first = visibleFiles[0];
            if (first) selectFile(first.path);
          }
          break;
        }
        case 'v': {
          e.preventDefault();
          if (!selectedFile || !session) break;
          const file = session.files.find((f) => f.path === selectedFile);
          const existingState = reviewFiles[selectedFile];
          if (file) {
            toggleViewed(
              selectedFile,
              existingState?.contentHash || '',
              existingState?.diffStats || { additions: file.additions, deletions: file.deletions },
            );
          }
          break;
        }

        // --- Hunk navigation (new) ---
        case 'n': {
          e.preventDefault();
          goToNextHunk();
          break;
        }
        case 'p': {
          e.preventDefault();
          goToPrevHunk();
          break;
        }

        // --- View toggles (new) ---
        case 's': {
          e.preventDefault();
          toggleDiffMode();
          break;
        }
        case 'b': {
          e.preventDefault();
          toggleSidebar();
          break;
        }

        // --- Hunk collapse (new) ---
        case '[': {
          e.preventDefault();
          if (selectedFile) setHunkCollapsed(selectedFile, activeHunkIndex, true);
          break;
        }
        case ']': {
          e.preventDefault();
          if (selectedFile) setHunkCollapsed(selectedFile, activeHunkIndex, false);
          break;
        }

        // --- Help overlay (new) ---
        case '?': {
          e.preventDefault();
          toggleHelpOverlay();
          break;
        }
        case 'Escape': {
          e.preventDefault();
          closeHelpOverlay();
          break;
        }
      }
    },
    [
      helpOverlayOpen,
      closeHelpOverlay,
      toggleHelpOverlay,
      getVisibleFiles,
      selectedFile,
      session,
      sidebarVisible,
      selectFile,
      expandDir,
      reviewFiles,
      toggleViewed,
      goToNextHunk,
      goToPrevHunk,
      toggleDiffMode,
      toggleSidebar,
      activeHunkIndex,
      setHunkCollapsed,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
