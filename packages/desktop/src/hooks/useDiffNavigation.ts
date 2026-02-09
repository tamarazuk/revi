import { useEffect, useCallback, useMemo } from 'react';
import { useKeyboardStore } from '../stores/keyboard';
import type { Virtualizer } from '@tanstack/react-virtual';

/**
 * Registers hunk navigation with the keyboard store.
 * Computes hunk header row indices and provides a scroll callback
 * so that n/p keys scroll to the correct hunk.
 */
export function useDiffNavigation(
  rows: readonly { type: string; hunkIndex?: number }[],
  virtualizer: Virtualizer<HTMLDivElement, Element>,
) {
  const { setHunkCount, registerScrollCallback, unregisterScrollCallback } =
    useKeyboardStore();

  // Indices in the rows array where hunk headers live
  const hunkHeaderIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].type === 'hunk-header') indices.push(i);
    }
    return indices;
  }, [rows]);

  // Update hunk count whenever rows change
  useEffect(() => {
    setHunkCount(hunkHeaderIndices.length);
  }, [hunkHeaderIndices.length, setHunkCount]);

  // Scroll callback: maps hunk index → row index → virtualizer scroll
  const scrollToHunk = useCallback(
    (hunkIndex: number) => {
      const rowIndex = hunkHeaderIndices[hunkIndex];
      if (rowIndex != null) {
        virtualizer.scrollToIndex(rowIndex, { align: 'start' });
      }
    },
    [hunkHeaderIndices, virtualizer],
  );

  useEffect(() => {
    registerScrollCallback(scrollToHunk);
    return () => unregisterScrollCallback();
  }, [scrollToHunk, registerScrollCallback, unregisterScrollCallback]);
}
