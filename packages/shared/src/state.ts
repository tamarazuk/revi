/**
 * Persisted Review State - stored in .revi/state/
 * Uses content hashing for fuzzy recovery across rebases/amends
 */
export interface PersistedState {
  version: 1;
  sessionId: string;
  baseSha: string;
  headSha: string;
  files: Record<string, FileState>;
  ui: UIState;
}

export interface FileState {
  viewed: boolean;
  lastViewedSha: string;
  contentHash: string;
  diffStats: DiffStats;
  collapseState: CollapseState;
  scrollPosition: number;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface CollapseState {
  file: boolean;
  hunks: number[];
}

export interface UIState {
  mode: DiffMode;
  sidebarWidth: number;
  sidebarVisible: boolean;
}

export type DiffMode = 'split' | 'unified';

/**
 * Result of fuzzy state recovery
 */
export interface RecoveredState {
  files: Record<string, FileRecovery>;
}

export interface FileRecovery {
  viewed: boolean;
  changedSinceViewed: boolean;
  oldStats: DiffStats;
  newStats: DiffStats;
}
