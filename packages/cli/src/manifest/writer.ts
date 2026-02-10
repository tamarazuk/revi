import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import type { ReviewManifest, RefInfo, WorktreeInfo, FileEntry, ComparisonMode } from '@revi/shared';

export interface ManifestInput {
  repoRoot: string;
  base: RefInfo;
  head: RefInfo;
  worktree?: WorktreeInfo;
  files: FileEntry[];
  comparisonMode?: ComparisonMode;
}

export async function writeManifest(input: ManifestInput): Promise<string> {
  const sessionId = nanoid(12);
  
  const manifest: ReviewManifest = {
    version: 1,
    sessionId,
    repoRoot: input.repoRoot,
    base: input.base,
    head: input.head,
    worktree: input.worktree,
    files: input.files,
    createdAt: new Date().toISOString(),
    comparisonMode: input.comparisonMode,
  };

  // Ensure .revi/sessions directory exists
  const reviDir = path.join(input.repoRoot, '.revi');
  const sessionsDir = path.join(reviDir, 'sessions');
  
  await fs.mkdir(sessionsDir, { recursive: true });

  // Write manifest
  const manifestPath = path.join(sessionsDir, `${sessionId}.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // Ensure .revi is in .gitignore
  await ensureGitignore(input.repoRoot);

  return manifestPath;
}

async function ensureGitignore(repoRoot: string): Promise<void> {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (content.includes('.revi')) {
      return; // Already ignored
    }
    
    // Append .revi to existing .gitignore
    await fs.appendFile(gitignorePath, '\n# Revi local state\n.revi/\n');
  } catch (error) {
    // .gitignore doesn't exist, create it
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.writeFile(gitignorePath, '# Revi local state\n.revi/\n');
    }
  }
}
