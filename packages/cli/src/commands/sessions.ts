import fs from 'fs/promises';
import path from 'path';
import pc from 'picocolors';
import type { ReviewManifest } from '@revi/shared';

/**
 * List all sessions in the current repository
 */
export async function listSessions(repoPath: string): Promise<void> {
  const sessionsDir = path.join(repoPath, '.revi', 'sessions');

  try {
    const files = await fs.readdir(sessionsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log(pc.dim('No sessions found.'));
      return;
    }

    console.log(pc.cyan('Sessions:\n'));

    for (const file of jsonFiles) {
      const filePath = path.join(sessionsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const manifest: ReviewManifest = JSON.parse(content);

      const date = new Date(manifest.createdAt).toLocaleString();
      const baseRef = manifest.base.ref;
      const headRef = manifest.head.ref;
      const fileCount = manifest.files.length;

      console.log(
        `  ${pc.bold(manifest.sessionId)}`,
        pc.dim(`(${date})`)
      );
      console.log(
        `    ${baseRef} → ${headRef}`,
        pc.dim(`• ${fileCount} files`)
      );
      console.log();
    }

    console.log(pc.dim(`Total: ${jsonFiles.length} session(s)`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(pc.dim('No sessions found.'));
      return;
    }
    throw error;
  }
}

/**
 * Clean (delete) all sessions in the current repository
 */
export async function cleanSessions(repoPath: string): Promise<void> {
  const sessionsDir = path.join(repoPath, '.revi', 'sessions');

  try {
    const files = await fs.readdir(sessionsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log(pc.dim('No sessions to clean.'));
      return;
    }

    for (const file of jsonFiles) {
      await fs.unlink(path.join(sessionsDir, file));
    }

    console.log(pc.green(`Cleaned ${jsonFiles.length} session(s).`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(pc.dim('No sessions to clean.'));
      return;
    }
    throw error;
  }
}
