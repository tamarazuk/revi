import { create } from 'zustand';

interface KeyboardState {
  // Help overlay
  helpOverlayOpen: boolean;
  toggleHelpOverlay: () => void;
  closeHelpOverlay: () => void;

  // Hunk navigation
  activeHunkIndex: number;
  hunkCount: number;
  setHunkCount: (count: number) => void;
  goToNextHunk: () => void;
  goToPrevHunk: () => void;
  resetHunkNavigation: () => void;

  // Scroll callback registered by diff views
  scrollToHunkCallback: ((index: number) => void) | null;
  registerScrollCallback: (cb: (index: number) => void) => void;
  unregisterScrollCallback: () => void;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  helpOverlayOpen: false,
  toggleHelpOverlay: () => set((s) => ({ helpOverlayOpen: !s.helpOverlayOpen })),
  closeHelpOverlay: () => set({ helpOverlayOpen: false }),

  activeHunkIndex: 0,
  hunkCount: 0,
  setHunkCount: (count) => set({ hunkCount: count }),

  goToNextHunk: () => {
    const { activeHunkIndex, hunkCount, scrollToHunkCallback } = get();
    if (hunkCount === 0) return;
    const next = Math.min(activeHunkIndex + 1, hunkCount - 1);
    set({ activeHunkIndex: next });
    scrollToHunkCallback?.(next);
  },

  goToPrevHunk: () => {
    const { activeHunkIndex, scrollToHunkCallback } = get();
    const prev = Math.max(activeHunkIndex - 1, 0);
    set({ activeHunkIndex: prev });
    scrollToHunkCallback?.(prev);
  },

  resetHunkNavigation: () => set({ activeHunkIndex: 0, hunkCount: 0, scrollToHunkCallback: null }),

  scrollToHunkCallback: null,
  registerScrollCallback: (cb) => set({ scrollToHunkCallback: cb }),
  unregisterScrollCallback: () => set({ scrollToHunkCallback: null }),
}));
