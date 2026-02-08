import pc from 'picocolors';
import { detectRepo } from '../git/detect';
import { resolveRefs } from '../git/refs';
import { getChangedFiles } from '../git/diff';
import { writeManifest } from '../manifest/writer';
import { launchApp } from '../app/launcher';

export interface ReviewOptions {
  base?: string;
  head: string;
  worktree?: boolean;
  open: boolean;
}

export async function review(path: string, options: ReviewOptions): Promise<void> {
  console.log(pc.cyan('revi'), 'Preparing review...\n');

  // Step 1: Detect repository context
  const repo = await detectRepo(path);
  console.log(pc.dim('Repository:'), repo.root);
  console.log(pc.dim('Branch:'), repo.branch || '(detached)');

  if (repo.worktree) {
    console.log(pc.dim('Worktree:'), repo.worktree.path);
  }

  // Step 2: Resolve base and head refs
  const refs = await resolveRefs(repo.root, {
    base: options.base,
    head: options.head,
  });
  console.log(pc.dim('Comparing:'), `${refs.base.ref} (${refs.base.sha.slice(0, 7)}) → ${refs.head.ref} (${refs.head.sha.slice(0, 7)})`);

  // Step 3: Get changed files
  const files = await getChangedFiles(repo.root, refs.base.sha, refs.head.sha);
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
    base: refs.base,
    head: refs.head,
    worktree: repo.worktree,
    files,
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
