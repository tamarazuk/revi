import path from 'path';
import simpleGit from 'simple-git';

export interface RepoContext {
  root: string;
  branch: string | null;
  worktree?: {
    path: string;
    branch: string;
  };
}

export async function detectRepo(inputPath: string): Promise<RepoContext> {
  const absolutePath = path.resolve(inputPath);
  const git = simpleGit(absolutePath);

  // Check if this is a git repository
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error(`Not a git repository: ${absolutePath}`);
  }

  // Get repository root
  const root = await git.revparse(['--show-toplevel']);

  // Get current branch
  let branch: string | null = null;
  try {
    branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    if (branch === 'HEAD') {
      branch = null; // Detached HEAD
    }
  } catch {
    // Detached HEAD or other issue
  }

  // Detect if we're in a worktree
  const worktree = await detectWorktree(git, absolutePath);

  return {
    root: root.trim(),
    branch,
    worktree,
  };
}

async function detectWorktree(
  git: ReturnType<typeof simpleGit>,
  currentPath: string
): Promise<{ path: string; branch: string } | undefined> {
  try {
    // Check if current directory is a worktree (not the main working tree)
    const gitDir = await git.revparse(['--git-dir']);
    const commonDir = await git.revparse(['--git-common-dir']);

    // If git-dir and git-common-dir are different, we're in a worktree
    if (gitDir.trim() !== commonDir.trim() && gitDir.includes('.git/worktrees')) {
      const worktreePath = await git.revparse(['--show-toplevel']);
      const worktreeBranch = await git.revparse(['--abbrev-ref', 'HEAD']);

      return {
        path: worktreePath.trim(),
        branch: worktreeBranch.trim(),
      };
    }
  } catch {
    // Not a worktree or error detecting
  }

  return undefined;
}
