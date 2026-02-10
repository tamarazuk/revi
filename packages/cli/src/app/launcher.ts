import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface LaunchCandidate {
  command: string;
  args: string[];
  requireExists?: string;
}

function spawnDetached(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
      });

      let settled = false;

      child.once('error', () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      });

      child.once('spawn', () => {
        if (!settled) {
          settled = true;
          child.unref();
          resolve(true);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

function buildCandidates(sessionPath: string): LaunchCandidate[] {
  const sessionArgs = ['--session', sessionPath];
  const platform = process.platform;

  const envBinary = process.env.REVI_DESKTOP_BIN;
  const candidates: LaunchCandidate[] = [];

  if (envBinary) {
    candidates.push({ command: envBinary, args: sessionArgs });
  }

  if (platform === 'darwin') {
    candidates.push(
      {
        command: 'open',
        args: ['-a', 'Revi', '--args', ...sessionArgs],
      },
      {
        command: '/Applications/Revi.app/Contents/MacOS/Revi',
        args: sessionArgs,
        requireExists: '/Applications/Revi.app/Contents/MacOS/Revi',
      },
      {
        command: path.join(
          os.homedir(),
          'Applications',
          'Revi.app',
          'Contents',
          'MacOS',
          'Revi',
        ),
        args: sessionArgs,
        requireExists: path.join(
          os.homedir(),
          'Applications',
          'Revi.app',
          'Contents',
          'MacOS',
          'Revi',
        ),
      },
    );
  } else if (platform === 'linux') {
    candidates.push(
      { command: 'revi-desktop', args: sessionArgs },
      { command: '/usr/bin/revi-desktop', args: sessionArgs, requireExists: '/usr/bin/revi-desktop' },
      {
        command: '/usr/local/bin/revi-desktop',
        args: sessionArgs,
        requireExists: '/usr/local/bin/revi-desktop',
      },
    );
  } else if (platform === 'win32') {
    candidates.push(
      { command: 'revi-desktop.exe', args: sessionArgs },
      {
        command: path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Revi', 'Revi.exe'),
        args: sessionArgs,
        requireExists: path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Revi', 'Revi.exe'),
      },
    );
  }

  return candidates;
}

function printManualLaunchHelp(sessionPath: string): void {
  console.log('\nSession manifest written to:');
  console.log(`  ${sessionPath}`);
  console.log('\nCould not auto-launch Revi Desktop.');
  console.log('Start desktop manually and pass session path:');
  console.log(`  pnpm --filter @revi/desktop tauri dev -- --session "${sessionPath}"`);
  console.log('\nTip: set REVI_DESKTOP_BIN to your desktop binary path for auto-launch.');
}

export async function launchApp(sessionPath: string): Promise<void> {
  const candidates = buildCandidates(sessionPath);

  for (const candidate of candidates) {
    if (candidate.requireExists && !fs.existsSync(candidate.requireExists)) {
      continue;
    }

    const ok = await spawnDetached(candidate.command, candidate.args);
    if (ok) {
      return;
    }
  }

  printManualLaunchHelp(sessionPath);
}
