#!/usr/bin/env node

import path from 'path';
import { Command } from 'commander';
import pc from 'picocolors';
import { review } from './commands/review';
import { listSessions, cleanSessions } from './commands/sessions';

const program = new Command();

program
  .name('revi')
  .description('Local-only code review tool with GitHub PR-style diff viewing')
  .version('0.1.0');

// Default command: start a review
program
  .argument('[path]', 'Repository path', '.')
  .option('--base <ref>', 'Base ref for comparison')
  .option('--head <ref>', 'Head ref for comparison', 'HEAD')
  .option('--worktree', 'Include worktree context')
  .option('--no-open', "Don't open desktop app")
  .action(async (inputPath: string, options) => {
    try {
      // Handle edge case where pnpm passes '--' as the path argument
      const repoPath = inputPath === '--' ? '.' : inputPath;
      await review(repoPath, options);
    } catch (error) {
      console.error(pc.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Sessions subcommand
const sessions = program
  .command('sessions')
  .description('Manage review sessions');

sessions
  .command('list')
  .alias('ls')
  .description('List all sessions in the repository')
  .argument('[path]', 'Repository path', '.')
  .action(async (inputPath: string) => {
    try {
      const repoPath = path.resolve(inputPath === '--' ? '.' : inputPath);
      await listSessions(repoPath);
    } catch (error) {
      console.error(pc.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

sessions
  .command('clean')
  .description('Delete all sessions in the repository')
  .argument('[path]', 'Repository path', '.')
  .action(async (inputPath: string) => {
    try {
      const repoPath = path.resolve(inputPath === '--' ? '.' : inputPath);
      await cleanSessions(repoPath);
    } catch (error) {
      console.error(pc.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
