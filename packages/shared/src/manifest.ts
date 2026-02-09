/**
 * Review Manifest - produced by CLI, consumed by Desktop app
 * Contains metadata about the review session but NOT the actual diffs
 */
export interface ReviewManifest {
  version: 1;
  sessionId: string;
  repoRoot: string;
  base: RefInfo;
  head: RefInfo;
  worktree?: WorktreeInfo;
  files: FileEntry[];
  createdAt: string;
  comparisonMode?: ComparisonMode; // Added in Phase 6b
}

export interface RefInfo {
  ref: string;
  sha: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export interface FileEntry {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  renamedFrom?: string;
  binary: boolean;
}

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * Comparison Mode - determines what is being compared in the review
 */
export type ComparisonMode =
  | { type: 'uncommitted' } // HEAD vs Working Tree (staged + unstaged + untracked)
  | { type: 'branch'; baseBranch: string } // merge-base(baseBranch)..HEAD
  | { type: 'custom'; baseRef: string; headRef: string }; // Custom ref comparison

/**
 * Commit info for listing recent commits
 */
export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
}
