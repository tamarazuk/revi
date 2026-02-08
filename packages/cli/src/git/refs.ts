import simpleGit from 'simple-git';
import type { RefInfo } from '@revi/shared';

export interface ResolveRefsOptions {
  base?: string;
  head: string;
}

export interface ResolvedRefs {
  base: RefInfo;
  head: RefInfo;
}

export async function resolveRefs(
  repoRoot: string,
  options: ResolveRefsOptions
): Promise<ResolvedRefs> {
  const git = simpleGit(repoRoot);

  // Resolve head ref
  const headSha = await git.revparse([options.head]);
  const headRef = options.head === 'HEAD' 
    ? (await getRefName(git, 'HEAD')) || 'HEAD'
    : options.head;

  // Resolve base ref
  let baseRef: string;
  let baseSha: string;

  if (options.base) {
    // Explicit base provided
    baseRef = options.base;
    baseSha = await git.revparse([options.base]);
  } else {
    // Auto-detect merge base with main/master
    const defaultBranch = await detectDefaultBranch(git);
    baseRef = defaultBranch;
    
    try {
      // Find merge-base between HEAD and default branch
      const mergeBase = await git.raw(['merge-base', defaultBranch, options.head]);
      baseSha = mergeBase.trim();
    } catch {
      // Fallback to the default branch itself
      baseSha = await git.revparse([defaultBranch]);
    }
  }

  return {
    base: { ref: baseRef, sha: baseSha.trim() },
    head: { ref: headRef, sha: headSha.trim() },
  };
}

async function getRefName(
  git: ReturnType<typeof simpleGit>,
  ref: string
): Promise<string | null> {
  try {
    const name = await git.revparse(['--abbrev-ref', ref]);
    const trimmed = name.trim();
    return trimmed === 'HEAD' ? null : trimmed;
  } catch {
    return null;
  }
}

async function detectDefaultBranch(git: ReturnType<typeof simpleGit>): Promise<string> {
  // Try common default branch names
  const candidates = ['main', 'master', 'origin/main', 'origin/master'];

  for (const candidate of candidates) {
    try {
      await git.revparse(['--verify', candidate]);
      return candidate;
    } catch {
      // Branch doesn't exist, try next
    }
  }

  // Fallback: try to get from remote HEAD
  try {
    const remoteHead = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    return remoteHead.trim().replace('refs/remotes/origin/', '');
  } catch {
    // Default to 'main'
    return 'main';
  }
}
