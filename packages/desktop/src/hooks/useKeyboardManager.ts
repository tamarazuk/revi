import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useSessionStore } from '../stores/session';
import { useUIStore } from '../stores/ui';
import { useKeyboardStore } from '../stores/keyboard';
import { useSidebarStore } from '../stores/sidebar';
import { useReviewStateStore } from '../stores/reviewState';
import { KEYBINDINGS, matchesKeybinding } from '../keyboard/keymap';
import type { FileEntry } from '@revi/shared';

// Track zoom level (persisted in memory, could be stored in localStorage)
let currentZoom = 1.0;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const MANAGER_KEYBINDINGS = KEYBINDINGS.filter((binding) => binding.scope === 'manager');

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
        const shouldCloseHelp =
          matchesKeybinding(e, MANAGER_KEYBINDINGS.find((b) => b.id === 'toggle_help')!) ||
          matchesKeybinding(e, MANAGER_KEYBINDINGS.find((b) => b.id === 'close_help')!);

        if (shouldCloseHelp) {
          e.preventDefault();
          closeHelpOverlay();
        }
        return;
      }

      const visibleFiles = getVisibleFiles();
      const currentIndex = selectedFile
        ? visibleFiles.findIndex((f) => f.path === selectedFile)
        : -1;

      for (const binding of MANAGER_KEYBINDINGS) {
        if (!matchesKeybinding(e, binding)) {
          continue;
        }

        e.preventDefault();

        switch (binding.id) {
          case 'new_window': {
            invoke('create_window');
            return;
          }
          case 'close_window': {
            const webview = getCurrentWebviewWindow();
            webview.close();
            return;
          }
          case 'open_in_editor': {
            if (selectedFile && session) {
              const fullPath = `${session.repoRoot}/${selectedFile}`;
              invoke('open_in_editor', { filePath: fullPath, line: null }).catch((err) => {
                console.error('Failed to open in editor:', err);
              });
            }
            return;
          }
          case 'copy_absolute_path': {
            if (selectedFile && session) {
              const fullPath = `${session.repoRoot}/${selectedFile}`;
              invoke('copy_to_clipboard', { content: fullPath }).catch((err) => {
                console.error('Failed to copy to clipboard:', err);
              });
            }
            return;
          }
          case 'copy_relative_path': {
            if (selectedFile) {
              invoke('copy_to_clipboard', { content: selectedFile }).catch((err) => {
                console.error('Failed to copy to clipboard:', err);
              });
            }
            return;
          }
          case 'zoom_in': {
            const webview = getCurrentWebviewWindow();
            currentZoom = Math.min(currentZoom + ZOOM_STEP, ZOOM_MAX);
            webview.setZoom(currentZoom);
            return;
          }
          case 'zoom_out': {
            const webview = getCurrentWebviewWindow();
            currentZoom = Math.max(currentZoom - ZOOM_STEP, ZOOM_MIN);
            webview.setZoom(currentZoom);
            return;
          }
          case 'zoom_reset': {
            const webview = getCurrentWebviewWindow();
            currentZoom = 1.0;
            webview.setZoom(currentZoom);
            return;
          }
          case 'next_file': {
            if (!sidebarVisible || visibleFiles.length === 0) return;
            const nextIndex = Math.min(currentIndex + 1, visibleFiles.length - 1);
            const nextFile = visibleFiles[nextIndex];
            if (nextFile) {
              selectFile(nextFile.path);
              const lastSlash = nextFile.path.lastIndexOf('/');
              if (lastSlash > 0) expandDir(nextFile.path.slice(0, lastSlash));
            }
            return;
          }
          case 'prev_file': {
            if (!sidebarVisible || visibleFiles.length === 0) return;
            const prevIndex = Math.max(currentIndex - 1, 0);
            const prevFile = visibleFiles[prevIndex];
            if (prevFile) selectFile(prevFile.path);
            return;
          }
          case 'open_file': {
            if (selectedFile) selectFile(selectedFile);
            return;
          }
          case 'first_file': {
            const first = visibleFiles[0];
            if (first) selectFile(first.path);
            return;
          }
          case 'last_file': {
            const last = visibleFiles[visibleFiles.length - 1];
            if (last) selectFile(last.path);
            return;
          }
          case 'toggle_viewed': {
            if (!selectedFile || !session) return;
            const file = session.files.find((f) => f.path === selectedFile);
            const existingState = reviewFiles[selectedFile];
            if (file) {
              toggleViewed(
                selectedFile,
                existingState?.contentHash || '',
                existingState?.diffStats || { additions: file.additions, deletions: file.deletions },
              );
            }
            return;
          }
          case 'next_hunk': {
            goToNextHunk();
            return;
          }
          case 'prev_hunk': {
            goToPrevHunk();
            return;
          }
          case 'toggle_diff_mode': {
            toggleDiffMode();
            return;
          }
          case 'toggle_sidebar': {
            toggleSidebar();
            return;
          }
          case 'collapse_hunk': {
            if (selectedFile) setHunkCollapsed(selectedFile, activeHunkIndex, true);
            return;
          }
          case 'expand_hunk': {
            if (selectedFile) setHunkCollapsed(selectedFile, activeHunkIndex, false);
            return;
          }
          case 'toggle_help': {
            toggleHelpOverlay();
            return;
          }
          case 'close_help': {
            closeHelpOverlay();
            return;
          }
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
