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
