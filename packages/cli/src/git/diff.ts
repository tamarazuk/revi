import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import type { FileEntry, FileStatus } from '@revi/shared';

export async function getChangedFiles(
  repoRoot: string,
  baseSha: string,
  headSha: string
): Promise<FileEntry[]> {
  const git = simpleGit(repoRoot);

  // Get diff with numstat for additions/deletions
  const numstat = await git.raw([
    'diff',
    '--numstat',
    '--find-renames',
    `${baseSha}...${headSha}`,
  ]);

  // Get diff with name-status for file status
  const nameStatus = await git.raw([
    'diff',
    '--name-status',
    '--find-renames',
    `${baseSha}...${headSha}`,
  ]);

  const statMap = parseNumstat(numstat);
  const statusMap = parseNameStatus(nameStatus);

  const files: FileEntry[] = [];

  for (const [path, status] of statusMap) {
    const stats = statMap.get(path) || { additions: 0, deletions: 0, binary: false };

    files.push({
      path,
      status: status.status,
      additions: stats.additions,
      deletions: stats.deletions,
      renamedFrom: status.renamedFrom,
      binary: stats.binary,
    });
  }

  // Sort by path
  files.sort((a, b) => a.path.localeCompare(b.path));

  return files;
}

export async function getUncommittedFiles(repoRoot: string): Promise<FileEntry[]> {
  const git = simpleGit(repoRoot);

  const numstat = await git.raw(['diff', '--numstat', '--find-renames', 'HEAD']);
  const nameStatus = await git.raw(['diff', '--name-status', '--find-renames', 'HEAD']);

  const statMap = parseNumstat(numstat);
  const statusMap = parseNameStatus(nameStatus);

  const untrackedOutput = await git.raw(['ls-files', '--others', '--exclude-standard']);
  const untrackedPaths = untrackedOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const filePath of untrackedPaths) {
    const fullPath = path.join(repoRoot, filePath);
    const { binary, additions } = await getUntrackedFileInfo(fullPath);
    statusMap.set(filePath, { status: 'added' });
    statMap.set(filePath, { additions, deletions: 0, binary });
  }

  const files: FileEntry[] = [];
  for (const [filePath, status] of statusMap) {
    const stats = statMap.get(filePath) || { additions: 0, deletions: 0, binary: false };
    files.push({
      path: filePath,
      status: status.status,
      additions: stats.additions,
      deletions: stats.deletions,
      renamedFrom: status.renamedFrom,
      binary: stats.binary,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function getUntrackedFileInfo(fullPath: string): Promise<{ binary: boolean; additions: number }> {
  try {
    const bytes = await fs.readFile(fullPath);
    const sample = bytes.subarray(0, 8192);
    const hasNullByte = sample.includes(0);

    let binary = hasNullByte;
    if (!binary) {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(sample);
      } catch {
        binary = true;
      }
    }

    if (binary) {
      return { binary: true, additions: 0 };
    }

    const text = bytes.toString('utf-8');
    const additions = text.length === 0 ? 0 : text.split(/\r?\n/).length;
    return { binary: false, additions };
  } catch {
    return { binary: false, additions: 0 };
  }
}

interface NumstatEntry {
  additions: number;
  deletions: number;
  binary: boolean;
}

function parseNumstat(output: string): Map<string, NumstatEntry> {
  const map = new Map<string, NumstatEntry>();

  for (const line of output.trim().split('\n')) {
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const [add, del, ...pathParts] = parts;
    let path = pathParts.join('\t');

    // Handle renames: "old => new" or "{old => new}" syntax
    if (path.includes(' => ')) {
      // Extract the new path from rename
      const match = path.match(/(?:{[^}]*\s=>\s([^}]*)}|.*\s=>\s(.*))/);
      if (match) {
        path = match[1] || match[2] || path;
      }
    }

    // Binary files show "-" for additions/deletions
    const binary = add === '-' || del === '-';

    map.set(path.trim(), {
      additions: binary ? 0 : parseInt(add, 10),
      deletions: binary ? 0 : parseInt(del, 10),
      binary,
    });
  }

  return map;
}

interface StatusEntry {
  status: FileStatus;
  renamedFrom?: string;
}

function parseNameStatus(output: string): Map<string, StatusEntry> {
  const map = new Map<string, StatusEntry>();

  for (const line of output.trim().split('\n')) {
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const statusCode = parts[0];
    let status: FileStatus;
    let path: string;
    let renamedFrom: string | undefined;

    if (statusCode.startsWith('R')) {
      // Rename: R100\told-path\tnew-path
      status = 'renamed';
      renamedFrom = parts[1];
      path = parts[2];
    } else if (statusCode.startsWith('C')) {
      // Copy: treat as added
      status = 'added';
      path = parts[2];
    } else {
      path = parts[1];
      switch (statusCode) {
        case 'A':
          status = 'added';
          break;
        case 'D':
          status = 'deleted';
          break;
        case 'M':
        case 'T': // Type change
          status = 'modified';
          break;
        default:
          status = 'modified';
      }
    }

    map.set(path, { status, renamedFrom });
  }

  return map;
}
