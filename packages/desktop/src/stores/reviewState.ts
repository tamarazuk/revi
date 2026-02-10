import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { PersistedState, FileState, DiffStats, CollapseState, DiffMode } from '@revi/shared';

/**
 * Recovery info for a file that was previously viewed but whose diff changed.
 */
interface FileRecoveryInfo {
  changedSinceViewed: boolean;
  oldStats: DiffStats;
  newStats: DiffStats;
}

/**
 * Review state store - manages viewed files, scroll positions, and collapse state.
 * Persists to .revi/state/<base>..<head>.json via Tauri commands.
 */

interface ReviewStateStore {
  // Current state
  sessionId: string | null;
  repoRoot: string | null;
  baseSha: string | null;
  headSha: string | null;
  files: Record<string, FileState>;

  // Recovery info (populated after fuzzy recovery)
  recoveryInfo: Record<string, FileRecoveryInfo>;

  // Loading state
  isLoaded: boolean;
  isSaving: boolean;

  // Actions - file state
  markViewed: (path: string, contentHash: string, diffStats: DiffStats) => void;
  markUnviewed: (path: string) => void;
  toggleViewed: (path: string, contentHash: string, diffStats: DiffStats) => void;
  isViewed: (path: string) => boolean;
  getRecoveryInfo: (path: string) => FileRecoveryInfo | null;
  clearRecoveryInfo: (path: string) => void;

  // Actions - collapse state
  setFileCollapsed: (path: string, collapsed: boolean) => void;
  setHunkCollapsed: (path: string, hunkIndex: number, collapsed: boolean) => void;
  getCollapseState: (path: string) => CollapseState;

  // Actions - scroll position
  setScrollPosition: (path: string, position: number) => void;
  getScrollPosition: (path: string) => number;

  // Persistence
  loadState: (repoRoot: string, sessionId: string, baseSha: string, headSha: string, files?: { path: string; contentHash: string; additions: number; deletions: number }[]) => Promise<void>;
  saveState: () => Promise<void>;
  scheduleSave: () => void;
  reset: () => void;

  // Stats
  getViewedCount: () => number;
}

const DEFAULT_FILE_STATE: FileState = {
  viewed: false,
  lastViewedSha: '',
  contentHash: '',
  diffStats: { additions: 0, deletions: 0 },
  collapseState: { file: false, hunks: [] },
  scrollPosition: 0,
};

const DEFAULT_COLLAPSE_STATE: CollapseState = { file: false, hunks: [] };

// Debounce delay for auto-save (500ms)
const SAVE_DEBOUNCE_MS = 500;

// Module-level timer handle (not part of store state)
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useReviewStateStore = create<ReviewStateStore>((set, get) => ({
  sessionId: null,
  repoRoot: null,
  baseSha: null,
  headSha: null,
  files: {},
  recoveryInfo: {},
  isLoaded: false,
  isSaving: false,

  markViewed: (path: string, contentHash: string, diffStats: DiffStats) => {
    const { baseSha } = get();
    set((state) => ({
      files: {
        ...state.files,
        [path]: {
          ...DEFAULT_FILE_STATE,
          ...state.files[path],
          viewed: true,
          lastViewedSha: baseSha || '',
          contentHash,
          diffStats,
        },
      },
    }));
    get().scheduleSave();
  },

  markUnviewed: (path: string) => {
    set((state) => {
      if (!state.files[path]) return state;
      return {
        files: {
          ...state.files,
          [path]: {
            ...state.files[path],
            viewed: false,
          },
        },
      };
    });
    get().scheduleSave();
  },

  toggleViewed: (path: string, contentHash: string, diffStats: DiffStats) => {
    const isCurrentlyViewed = get().isViewed(path);
    if (isCurrentlyViewed) {
      get().markUnviewed(path);
    } else {
      get().markViewed(path, contentHash, diffStats);
    }
  },

  isViewed: (path: string) => {
    const fileState = get().files[path];
    return fileState?.viewed ?? false;
  },

  getRecoveryInfo: (path: string) => {
    return get().recoveryInfo[path] ?? null;
  },

  clearRecoveryInfo: (path: string) => {
    set((state) => {
      const { [path]: _, ...rest } = state.recoveryInfo;
      return { recoveryInfo: rest };
    });
  },

  setFileCollapsed: (path: string, collapsed: boolean) => {
    set((state) => ({
      files: {
        ...state.files,
        [path]: {
          ...DEFAULT_FILE_STATE,
          ...state.files[path],
          collapseState: {
            ...DEFAULT_COLLAPSE_STATE,
            ...state.files[path]?.collapseState,
            file: collapsed,
          },
        },
      },
    }));
    get().scheduleSave();
  },

  setHunkCollapsed: (path: string, hunkIndex: number, collapsed: boolean) => {
    set((state) => {
      const current = state.files[path]?.collapseState?.hunks || [];
      const hunks = collapsed
        ? [...new Set([...current, hunkIndex])]
        : current.filter((i) => i !== hunkIndex);
      
      return {
        files: {
          ...state.files,
          [path]: {
            ...DEFAULT_FILE_STATE,
            ...state.files[path],
            collapseState: {
              ...DEFAULT_COLLAPSE_STATE,
              ...state.files[path]?.collapseState,
              hunks,
            },
          },
        },
      };
    });
    get().scheduleSave();
  },

  getCollapseState: (path: string) => {
    return get().files[path]?.collapseState ?? DEFAULT_COLLAPSE_STATE;
  },

  setScrollPosition: (path: string, position: number) => {
    set((state) => ({
      files: {
        ...state.files,
        [path]: {
          ...DEFAULT_FILE_STATE,
          ...state.files[path],
          scrollPosition: position,
        },
      },
    }));
    // Scroll position changes are frequent - use longer debounce
    get().scheduleSave();
  },

  getScrollPosition: (path: string) => {
    return get().files[path]?.scrollPosition ?? 0;
  },

  loadState: async (repoRoot: string, sessionId: string, baseSha: string, headSha: string, newFiles?: { path: string; contentHash: string; additions: number; deletions: number }[]) => {
    set({ repoRoot, sessionId, baseSha, headSha, isLoaded: false, recoveryInfo: {} });

    try {
      const persistedState = await invoke<PersistedState | null>('load_review_state', {
        repoRoot,
        baseSha,
        headSha,
      });

      if (persistedState) {
        set({
          files: persistedState.files,
          isLoaded: true,
        });
        return;
      }

      // Exact SHA match failed — try fuzzy recovery if we have file info
      if (newFiles && newFiles.length > 0) {
        try {
          const recovered = await invoke<{
            files: Record<string, {
              viewed: boolean;
              changedSinceViewed: boolean;
              oldStats: { additions: number; deletions: number };
              newStats: { additions: number; deletions: number };
              scrollPosition: number;
              collapseState: { file: boolean; hunks: number[] };
            }>;
            recoveredFrom: string;
          } | null>('recover_state', {
            repoRoot,
            baseSha,
            headSha,
            newFiles: newFiles.map(f => ({
              path: f.path,
              additions: f.additions,
              deletions: f.deletions,
            })),
          });

          if (recovered) {
            const files: Record<string, FileState> = {};
            const recoveryInfo: Record<string, FileRecoveryInfo> = {};

            for (const [path, r] of Object.entries(recovered.files)) {
              files[path] = {
                viewed: r.viewed,
                lastViewedSha: baseSha,
                contentHash: '',
                diffStats: r.newStats,
                collapseState: r.collapseState,
                scrollPosition: r.scrollPosition,
              };
              if (r.changedSinceViewed) {
                recoveryInfo[path] = {
                  changedSinceViewed: true,
                  oldStats: r.oldStats,
                  newStats: r.newStats,
                };
              }
            }

            console.log(`Recovered review state from ${recovered.recoveredFrom}`);
            set({ files, recoveryInfo, isLoaded: true });
            return;
          }
        } catch (err) {
          console.warn('Recovery failed, starting fresh:', err);
        }
      }

      set({ files: {}, isLoaded: true });
    } catch (error) {
      console.error('Failed to load review state:', error);
      set({ files: {}, isLoaded: true });
    }
  },

  saveState: async () => {
    const { repoRoot, sessionId, baseSha, headSha, files, isSaving } = get();
    
    if (!repoRoot || !sessionId || !baseSha || !headSha) {
      return;
    }
    
    if (isSaving) {
      // Already saving, schedule another save
      get().scheduleSave();
      return;
    }

    set({ isSaving: true });

    try {
      const state: PersistedState = {
        version: 1,
        sessionId,
        baseSha,
        headSha,
        files,
        ui: {
          mode: 'split' as DiffMode,
          sidebarWidth: 280,
          sidebarVisible: true,
        },
      };

      await invoke('save_review_state', {
        repoRoot,
        state,
      });
    } catch (error) {
      console.error('Failed to save review state:', error);
    } finally {
      set({ isSaving: false });
    }
  },

  scheduleSave: () => {
    // Clear existing timer
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    // Schedule new save
    saveTimer = setTimeout(() => {
      get().saveState();
    }, SAVE_DEBOUNCE_MS);
  },

  reset: () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    set({
      sessionId: null,
      repoRoot: null,
      baseSha: null,
      headSha: null,
      files: {},
      recoveryInfo: {},
      isLoaded: false,
      isSaving: false,
    });
  },

  getViewedCount: () => {
    const { files } = get();
    return Object.values(files).filter((f) => f.viewed).length;
  },
}));
