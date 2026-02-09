import { create } from 'zustand';
import type { FileStatus } from '@revi/shared';

type ViewedFilter = 'all' | 'viewed' | 'unviewed';

interface SidebarFilter {
  status: FileStatus[];
  viewedState: ViewedFilter;
  searchQuery: string;
}

interface SidebarState {
  expandedDirs: Set<string>;
  filter: SidebarFilter;

  // Actions
  toggleDir: (path: string) => void;
  expandDir: (path: string) => void;
  collapseDir: (path: string) => void;
  collapseAll: () => void;

  setStatusFilter: (statuses: FileStatus[]) => void;
  toggleStatusFilter: (status: FileStatus) => void;
  setViewedFilter: (state: ViewedFilter) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
}

const DEFAULT_FILTER: SidebarFilter = {
  status: [],
  viewedState: 'all',
  searchQuery: '',
};

export const useSidebarStore = create<SidebarState>((set) => ({
  expandedDirs: new Set<string>(),
  filter: DEFAULT_FILTER,

  toggleDir: (path: string) => {
    set((state) => {
      const next = new Set(state.expandedDirs);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedDirs: next };
    });
  },

  expandDir: (path: string) => {
    set((state) => {
      const next = new Set(state.expandedDirs);
      next.add(path);
      return { expandedDirs: next };
    });
  },

  collapseDir: (path: string) => {
    set((state) => {
      const next = new Set(state.expandedDirs);
      next.delete(path);
      return { expandedDirs: next };
    });
  },

  collapseAll: () => {
    set({ expandedDirs: new Set() });
  },

  setStatusFilter: (statuses: FileStatus[]) => {
    set((state) => ({
      filter: { ...state.filter, status: statuses },
    }));
  },

  toggleStatusFilter: (status: FileStatus) => {
    set((state) => {
      const current = state.filter.status;
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      return { filter: { ...state.filter, status: next } };
    });
  },

  setViewedFilter: (viewedState: ViewedFilter) => {
    set((state) => ({
      filter: { ...state.filter, viewedState },
    }));
  },

  setSearchQuery: (query: string) => {
    set((state) => ({
      filter: { ...state.filter, searchQuery: query },
    }));
  },

  clearFilters: () => {
    set({ filter: DEFAULT_FILTER });
  },
}));

// Helper to expand all directories given a list of paths
export function expandAllDirs(dirs: string[]) {
  useSidebarStore.setState({ expandedDirs: new Set(dirs) });
}
