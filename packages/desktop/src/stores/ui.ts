import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DiffMode } from '@revi/shared';

interface UIState {
  diffMode: DiffMode;
  sidebarWidth: number;
  sidebarVisible: boolean;

  // Actions
  toggleDiffMode: () => void;
  setDiffMode: (mode: DiffMode) => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      diffMode: 'split',
      sidebarWidth: 280,
      sidebarVisible: true,

      toggleDiffMode: () => {
        set((state) => ({
          diffMode: state.diffMode === 'split' ? 'unified' : 'split',
        }));
      },

      setDiffMode: (mode: DiffMode) => {
        set({ diffMode: mode });
      },

      setSidebarWidth: (width: number) => {
        set({ sidebarWidth: Math.max(200, Math.min(500, width)) });
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarVisible: !state.sidebarVisible }));
      },
    }),
    {
      name: 'revi-ui-state',
    }
  )
);
