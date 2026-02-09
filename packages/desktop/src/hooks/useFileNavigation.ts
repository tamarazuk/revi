import { useEffect, useCallback, useState } from 'react';
import type { FileEntry } from '@revi/shared';
import { useSidebarStore } from '../stores/sidebar';
import { useReviewStateStore } from '../stores/reviewState';

interface UseFileNavigationOptions {
  files: FileEntry[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  enabled?: boolean;
}

interface UseFileNavigationResult {
  focusedFile: string | null;
  handleKeyDown: (e: KeyboardEvent) => void;
}

export function useFileNavigation({
  files,
  selectedFile,
  onSelectFile,
  enabled = true,
}: UseFileNavigationOptions): UseFileNavigationResult {
  // Focused file is what keyboard nav highlights; selected file is what's opened in diff pane
  const [focusedFile, setFocusedFile] = useState<string | null>(selectedFile);
  const { expandedDirs, expandDir } = useSidebarStore();
  const { toggleViewed, files: reviewFiles } = useReviewStateStore();

  // Get visible files (respecting collapsed directories)
  const getVisibleFiles = useCallback(() => {
    const visible: FileEntry[] = [];
    const groupedByDir = new Map<string, FileEntry[]>();

    // Group files by directory
    for (const file of files) {
      const lastSlash = file.path.lastIndexOf('/');
      const dir = lastSlash > 0 ? file.path.slice(0, lastSlash) : '';

      if (!groupedByDir.has(dir)) {
        groupedByDir.set(dir, []);
      }
      groupedByDir.get(dir)!.push(file);
    }

    // Build visible list respecting expanded state
    for (const [dir, dirFiles] of groupedByDir) {
      const isRootLevel = dir === '';
      const isExpanded = isRootLevel || expandedDirs.has(dir);

      if (isExpanded) {
        visible.push(...dirFiles);
      }
    }

    return visible;
  }, [files, expandedDirs]);

  // Sync focused file with selected file when selectedFile changes externally
  // (e.g., when user clicks a file directly)
  useEffect(() => {
    setFocusedFile(selectedFile);
  }, [selectedFile]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const visibleFiles = getVisibleFiles();
      if (visibleFiles.length === 0) return;

      const currentIndex = focusedFile
        ? visibleFiles.findIndex((f) => f.path === focusedFile)
        : -1;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = Math.min(currentIndex + 1, visibleFiles.length - 1);
          const nextFile = visibleFiles[nextIndex];
          if (nextFile) {
            setFocusedFile(nextFile.path);
            onSelectFile(nextFile.path); // Also select the file to show diff
            // Auto-expand parent directory if needed
            const lastSlash = nextFile.path.lastIndexOf('/');
            if (lastSlash > 0) {
              expandDir(nextFile.path.slice(0, lastSlash));
            }
          }
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          const prevFile = visibleFiles[prevIndex];
          if (prevFile) {
            setFocusedFile(prevFile.path);
            onSelectFile(prevFile.path); // Also select the file to show diff
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (focusedFile) {
            onSelectFile(focusedFile);
          }
          break;
        }
        case 'g': {
          // Go to first file
          if (e.shiftKey) {
            // G goes to last
            e.preventDefault();
            const lastFile = visibleFiles[visibleFiles.length - 1];
            if (lastFile) {
              setFocusedFile(lastFile.path);
              onSelectFile(lastFile.path);
            }
          } else {
            // g goes to first (vim-style double-g, but we'll use single for simplicity)
            e.preventDefault();
            const firstFile = visibleFiles[0];
            if (firstFile) {
              setFocusedFile(firstFile.path);
              onSelectFile(firstFile.path);
            }
          }
          break;
        }
        case 'o': {
          // Open selected file
          e.preventDefault();
          if (focusedFile) {
            onSelectFile(focusedFile);
          }
          break;
        }
        case 'v': {
          // Toggle viewed status for focused file
          e.preventDefault();
          if (focusedFile) {
            const file = files.find((f) => f.path === focusedFile);
            const existingState = reviewFiles[focusedFile];
            if (file) {
              toggleViewed(
                focusedFile,
                existingState?.contentHash || '',
                existingState?.diffStats || { additions: file.additions, deletions: file.deletions }
              );
            }
          }
          break;
        }
      }
    },
    [enabled, focusedFile, files, getVisibleFiles, onSelectFile, expandDir, toggleViewed, reviewFiles]
  );

  // Attach global keyboard listener
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);

  return {
    focusedFile,
    handleKeyDown,
  };
}
