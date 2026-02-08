/**
 * Structured diff data returned from Rust backend
 */
export interface FileDiff {
  path: string;
  hunks: Hunk[];
  contentHash: string;
  stats: DiffStats;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface Hunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: LineType;
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
  highlights: HighlightSpan[];
}

export type LineType = 'added' | 'deleted' | 'context';

/**
 * Syntax highlighting span from Tree-sitter
 */
export interface HighlightSpan {
  start: number;
  end: number;
  scope: string;
}
