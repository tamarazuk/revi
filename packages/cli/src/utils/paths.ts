import path from 'path';

export function resolvePath(inputPath: string): string {
  return path.resolve(process.cwd(), inputPath);
}

export function getReviDir(repoRoot: string): string {
  return path.join(repoRoot, '.revi');
}

export function getSessionsDir(repoRoot: string): string {
  return path.join(getReviDir(repoRoot), 'sessions');
}

export function getStateDir(repoRoot: string): string {
  return path.join(getReviDir(repoRoot), 'state');
}

export function getConfigPath(repoRoot: string): string {
  return path.join(getReviDir(repoRoot), 'config.json');
}
