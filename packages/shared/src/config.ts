/**
 * User configuration stored in .revi/config.json
 */
export interface ReviConfig {
  editor?: string;
  defaultBase?: string;
  defaultDiffMode?: 'split' | 'unified';
  exclude?: string[];
  dangerZone?: string[];
  keybindings?: Record<string, string>;
}

export const DEFAULT_CONFIG: ReviConfig = {
  editor: 'code -g {file}:{line}',
  defaultBase: 'main',
  defaultDiffMode: 'split',
  exclude: [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '*.generated.ts',
    'dist/**',
  ],
  dangerZone: [],
  keybindings: {},
};
