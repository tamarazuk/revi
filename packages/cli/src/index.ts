#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { review } from './commands/review';

const program = new Command();

program
  .name('revi')
  .description('Local-only code review tool with GitHub PR-style diff viewing')
  .version('0.1.0');

program
  .argument('[path]', 'Repository path', '.')
  .option('--base <ref>', 'Base ref for comparison')
  .option('--head <ref>', 'Head ref for comparison', 'HEAD')
  .option('--worktree', 'Include worktree context')
  .option('--no-open', "Don't open desktop app")
  .action(async (path: string, options) => {
    try {
      await review(path, options);
    } catch (error) {
      console.error(pc.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
