export interface KeyCombo {
  key: string;
  displayKeys: string[];
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  caseSensitive?: boolean;
}

export interface Keybinding {
  id: string;
  group: string;
  label: string;
  scope: 'manager' | 'app';
  combos: KeyCombo[];
}

export const KEYBINDINGS: Keybinding[] = [
  { id: 'next_file', group: 'Navigation', label: 'Next file', scope: 'manager', combos: [
    { key: 'j', displayKeys: ['j'] },
    { key: 'ArrowDown', displayKeys: ['↓'], caseSensitive: true },
  ] },
  { id: 'prev_file', group: 'Navigation', label: 'Previous file', scope: 'manager', combos: [
    { key: 'k', displayKeys: ['k'] },
    { key: 'ArrowUp', displayKeys: ['↑'], caseSensitive: true },
  ] },
  { id: 'first_file', group: 'Navigation', label: 'First file', scope: 'manager', combos: [
    { key: 'g', displayKeys: ['g'] },
  ] },
  { id: 'last_file', group: 'Navigation', label: 'Last file', scope: 'manager', combos: [
    { key: 'g', displayKeys: ['G'], shift: true },
  ] },
  { id: 'open_file', group: 'Navigation', label: 'Open file', scope: 'manager', combos: [
    { key: 'Enter', displayKeys: ['Enter'], caseSensitive: true },
    { key: 'o', displayKeys: ['o'] },
  ] },
  { id: 'next_hunk', group: 'Navigation', label: 'Next hunk', scope: 'manager', combos: [
    { key: 'n', displayKeys: ['n'] },
  ] },
  { id: 'prev_hunk', group: 'Navigation', label: 'Previous hunk', scope: 'manager', combos: [
    { key: 'p', displayKeys: ['p'] },
  ] },

  { id: 'toggle_viewed', group: 'Actions', label: 'Toggle viewed', scope: 'manager', combos: [
    { key: 'v', displayKeys: ['v'] },
  ] },
  { id: 'collapse_hunk', group: 'Actions', label: 'Collapse active hunk', scope: 'manager', combos: [
    { key: '[', displayKeys: ['['], caseSensitive: true },
  ] },
  { id: 'expand_hunk', group: 'Actions', label: 'Expand active hunk', scope: 'manager', combos: [
    { key: ']', displayKeys: [']'], caseSensitive: true },
  ] },
  { id: 'refresh_detected', group: 'Actions', label: 'Refresh now', scope: 'app', combos: [
    { key: 'r', displayKeys: ['r'] },
  ] },

  { id: 'toggle_diff_mode', group: 'View', label: 'Toggle split/unified', scope: 'manager', combos: [
    { key: 's', displayKeys: ['s'] },
  ] },
  { id: 'toggle_sidebar', group: 'View', label: 'Toggle sidebar', scope: 'manager', combos: [
    { key: 'b', displayKeys: ['b'] },
  ] },
  { id: 'toggle_help', group: 'View', label: 'Toggle this help', scope: 'manager', combos: [
    { key: '?', displayKeys: ['?'], shift: true, caseSensitive: true },
  ] },
  { id: 'close_help', group: 'View', label: 'Close overlay', scope: 'manager', combos: [
    { key: 'Escape', displayKeys: ['Esc'], caseSensitive: true },
  ] },

  { id: 'new_window', group: 'Window', label: 'New window', scope: 'manager', combos: [
    { key: 'n', displayKeys: ['⌘', 'N'], mod: true },
  ] },
  { id: 'zoom_in', group: 'Window', label: 'Zoom in', scope: 'manager', combos: [
    { key: '=', displayKeys: ['⌘', '+'], mod: true, caseSensitive: true },
    { key: '+', displayKeys: ['⌘', '+'], mod: true, shift: true, caseSensitive: true },
  ] },
  { id: 'zoom_out', group: 'Window', label: 'Zoom out', scope: 'manager', combos: [
    { key: '-', displayKeys: ['⌘', '-'], mod: true, caseSensitive: true },
  ] },
  { id: 'zoom_reset', group: 'Window', label: 'Reset zoom', scope: 'manager', combos: [
    { key: '0', displayKeys: ['⌘', '0'], mod: true, caseSensitive: true },
  ] },

  { id: 'open_in_editor', group: 'File', label: 'Open in editor', scope: 'manager', combos: [
    { key: 'o', displayKeys: ['⌘', '⇧', 'O'], mod: true, shift: true },
  ] },
  { id: 'copy_relative_path', group: 'File', label: 'Copy relative path', scope: 'manager', combos: [
    { key: 'c', displayKeys: ['⌘', 'C'], mod: true },
  ] },
  { id: 'copy_absolute_path', group: 'File', label: 'Copy absolute path', scope: 'manager', combos: [
    { key: 'c', displayKeys: ['⌘', '⇧', 'C'], mod: true, shift: true },
  ] },
];

export function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const requiresMod = combo.mod ?? false;
  const hasMod = event.metaKey || event.ctrlKey;

  if (requiresMod !== hasMod) return false;
  if ((combo.shift ?? false) !== event.shiftKey) return false;
  if ((combo.alt ?? false) !== event.altKey) return false;

  if (combo.caseSensitive) {
    return event.key === combo.key;
  }

  return event.key.toLowerCase() === combo.key.toLowerCase();
}

export function matchesKeybinding(event: KeyboardEvent, binding: Keybinding): boolean {
  return binding.combos.some((combo) => matchesCombo(event, combo));
}
