import pc from 'picocolors';
import { detectRepo, RepoContext } from '../git/detect';
import { resolveRefs, ResolvedRefs } from '../git/refs';
import { getChangedFiles, getUncommittedFiles } from '../git/diff';
import { writeManifest } from '../manifest/writer';
import { launchApp } from '../app/launcher';
import type { ComparisonMode, FileEntry } from '@revi/shared';

export interface ReviewOptions {
  base?: string;
  head: string;
  worktree?: boolean;
  open: boolean;
}

export async function review(path: string, options: ReviewOptions): Promise<void> {
  console.log(pc.cyan('revi'), 'Preparing review...\n');

  // Step 1: Detect repository context
  let repo: RepoContext;
  try {
    repo = await detectRepo(path);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Not a git repository')) {
      throw new Error(`Not a git repository: ${path}\n  Run this command from inside a git repository.`);
    }
    throw error;
  }

  console.log(pc.dim('Repository:'), repo.root);
  console.log(pc.dim('Branch:'), repo.branch || '(detached HEAD)');

  if (repo.worktree) {
    console.log(pc.dim('Worktree:'), repo.worktree.path);
  }

  // Step 2: Resolve base and head refs
  let refs: ResolvedRefs;
  try {
    refs = await resolveRefs(repo.root, {
      base: options.base,
      head: options.head,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('unknown revision')) {
        const badRef = options.base || options.head;
        throw new Error(`Unknown ref: ${badRef}\n  Make sure the branch or commit exists.`);
      }
      if (error.message.includes('merge-base')) {
        throw new Error(
          `Could not find merge-base. Try specifying --base explicitly.\n` +
          `  Example: revi --base main`
        );
      }
    }
    throw error;
  }

  console.log(
    pc.dim('Comparing:'),
    `${refs.base.ref} (${refs.base.sha.slice(0, 7)}) → ${refs.head.ref} (${refs.head.sha.slice(0, 7)})`
  );

  let files: FileEntry[];
  let manifestBase = refs.base;
  let manifestHead = refs.head;
  let comparisonMode: ComparisonMode | undefined;

  const shouldUseUncommitted = options.worktree || (!options.base && refs.base.sha === refs.head.sha);

  if (shouldUseUncommitted) {
    files = await getUncommittedFiles(repo.root);
    manifestBase = { ref: refs.head.ref, sha: refs.head.sha };
    manifestHead = { ref: 'WORKING_TREE', sha: 'WORKING_TREE' };
    comparisonMode = { type: 'uncommitted' };

    console.log(
      pc.dim('Comparing:'),
      `${manifestBase.ref} (${manifestBase.sha.slice(0, 7)}) → ${manifestHead.ref}`
    );
  } else {
    // Explicit commit-to-commit mode
    if (refs.base.sha === refs.head.sha) {
      console.log(pc.yellow('\nWarning:'), 'Base and head are the same commit. No changes to review.');
      console.log(pc.dim('  Try specifying a different --base ref or use --worktree.'));
      return;
    }

    files = await getChangedFiles(repo.root, refs.base.sha, refs.head.sha);
  }

  if (files.length === 0) {
    if (comparisonMode?.type === 'uncommitted') {
      console.log(pc.yellow('\nNo uncommitted changes to review.'));
    } else {
      console.log(pc.yellow('\nNo files changed between these refs.'));
    }
    return;
  }

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  console.log(
    pc.dim('Files changed:'),
    files.length,
    pc.green(`+${totalAdditions}`),
    pc.red(`-${totalDeletions}`)
  );

  // Step 4: Write manifest
  const sessionPath = await writeManifest({
    repoRoot: repo.root,
    base: manifestBase,
    head: manifestHead,
    worktree: repo.worktree,
    files,
    comparisonMode,
  });
  console.log(pc.dim('\nSession:'), sessionPath);

  // Step 5: Launch desktop app
  if (options.open) {
    console.log(pc.cyan('\nLaunching Revi...\n'));
    await launchApp(sessionPath);
  } else {
    console.log(pc.dim('\nSkipping app launch (--no-open)'));
  }
}
