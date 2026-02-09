# Revi Implementation Plan

This document outlines the phased implementation approach for Revi MVP. Each phase builds on the previous, with clear deliverables and dependencies.

---

## Phase Overview

| Phase | Name | Duration | Key Deliverable |
|-------|------|----------|-----------------|
| 0 | Project Scaffolding | 2-3 days | Monorepo with CLI, Desktop, and shared packages |
| 1 | CLI Foundation | 3-4 days | Working `revi .` that generates manifest |
| 2 | Desktop Shell | 3-4 days | Tauri app loads session, renders basic layout |
| 3 | Rust Backend Core | 5-7 days | Git ops, Tree-sitter highlighting, content hashing |
| 4 | File Tree Sidebar | 3-4 days | Navigable file list with status indicators |
| 5 | Diff Rendering | 7-10 days | Virtualized split/unified diff with syntax highlighting |
| 6 | State Management | 4-5 days | Persistence, fuzzy recovery, viewed state |
| 7 | Keyboard Navigation | 2-3 days | Full keybinding system |
| 8 | File Interactions | 2-3 days | Open in editor, copy, collapse controls |
| 9 | Change Detection | 3-4 days | File watcher, refresh flow |
| 10 | Polish & Config | 3-4 days | Exclusions, whitespace toggle, config loading |
| 11 | MVP Comments & AI Export | 3-4 days | Line comments with AI-friendly markdown export |

**Total estimated time: 6-8 weeks**

---

## Phase 0: Project Scaffolding

### Goal
Set up the monorepo structure with all packages, build tooling, and development workflow.

### Directory Structure

```
revi/
├── packages/
│   ├── cli/                 # Node.js CLI
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── desktop/             # Tauri + React app
│   │   ├── src/             # React frontend
│   │   ├── src-tauri/       # Rust backend
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/              # Shared TypeScript types
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── package.json             # Workspace root
├── pnpm-workspace.yaml
└── turbo.json               # Build orchestration
```

### Tasks

- [ ] Initialize pnpm workspace
- [ ] Create `packages/shared` with TypeScript types
- [ ] Create `packages/cli` with Commander.js setup
- [ ] Create `packages/desktop` with Tauri + React (Vite)
- [ ] Configure Turborepo for build orchestration
- [ ] Set up ESLint, Prettier, TypeScript configs
- [ ] Add development scripts (`pnpm dev`, `pnpm build`)

### Key Dependencies

**CLI (`packages/cli`)**
```json
{
  "commander": "^12.x",
  "simple-git": "^3.x",
  "nanoid": "^5.x",
  "picocolors": "^1.x"
}
```

**Desktop (`packages/desktop`)**
```json
{
  "@tauri-apps/api": "^2.x",
  "react": "^18.x",
  "zustand": "^4.x",
  "@tanstack/react-virtual": "^3.x"
}
```

**Rust (`src-tauri/Cargo.toml`)**
```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tree-sitter = "0.22"
tree-sitter-highlight = "0.22"
sha2 = "0.10"
notify = "6"
```

### Deliverable
Running `pnpm dev` starts both the CLI in watch mode and the Tauri dev server.

---

## Phase 1: CLI Foundation

### Goal
Build the CLI that detects git context and produces a review manifest.

### Module Structure

```
packages/cli/src/
├── index.ts              # Entry point, Commander setup
├── commands/
│   └── review.ts         # Main review command
├── git/
│   ├── detect.ts         # Repo/worktree detection
│   ├── refs.ts           # Base/head resolution
│   └── diff.ts           # File list with stats
├── manifest/
│   ├── schema.ts         # Manifest types (from shared)
│   └── writer.ts         # Write to .revi/sessions/
├── app/
│   └── launcher.ts       # Launch or connect to desktop app
└── utils/
    └── paths.ts          # Path resolution helpers
```

### Tasks

- [ ] Implement repo root detection (`git rev-parse --show-toplevel`)
- [ ] Implement worktree detection (`git worktree list`)
- [ ] Implement merge-base detection for default base ref
- [ ] Implement ref resolution (branch name → SHA)
- [ ] Implement changed file list with stats (`git diff --stat --numstat`)
- [ ] Generate session ID (nanoid)
- [ ] Write manifest to `.revi/sessions/<session-id>.json`
- [ ] Scaffold `.revi/` directory on first run
- [ ] Offer to add `.revi/` to `.gitignore`
- [ ] Implement app launcher (spawn Tauri app or signal via IPC)

### CLI Interface

```bash
revi [path] [options]

Arguments:
  path                 Repository path (default: current directory)

Options:
  --base <ref>         Base ref for comparison
  --head <ref>         Head ref for comparison (default: HEAD)
  --worktree           Include worktree context
  --no-open            Don't open desktop app
  -h, --help           Show help
  -v, --version        Show version
```

### Manifest Schema (from shared package)

```typescript
interface ReviewManifest {
  version: 1;
  sessionId: string;
  repoRoot: string;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  worktree?: { path: string; branch: string };
  files: FileEntry[];
  createdAt: string;
}

interface FileEntry {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  renamedFrom?: string;
  binary: boolean;
}
```

### Deliverable
`revi .` outputs manifest to `.revi/sessions/` and prints session info.

---

## Phase 2: Desktop Shell

### Goal
Basic Tauri app that loads a session manifest and renders the three-pane layout.

### React Component Structure

```
packages/desktop/src/
├── App.tsx
├── main.tsx
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx
│   │   ├── Sidebar.tsx
│   │   └── DiffPane.tsx
│   └── ui/
│       └── ...
├── stores/
│   ├── session.ts        # Zustand: current session state
│   └── ui.ts             # Zustand: UI preferences
├── hooks/
│   ├── useSession.ts
│   └── useTauriCommands.ts
└── lib/
    └── tauri.ts          # Tauri invoke wrappers
```

### Tauri Commands (Initial)

```rust
// src-tauri/src/commands/mod.rs

#[tauri::command]
fn load_session(path: String) -> Result<ReviewManifest, String>;

#[tauri::command]
fn read_config(repo_root: String) -> Result<Config, String>;
```

### Tasks

- [ ] Set up Tauri window configuration (size, title, resizable)
- [ ] Create basic three-pane layout (CSS Grid or Flexbox)
- [ ] Implement session loading from manifest path (CLI arg or IPC)
- [ ] Create Zustand store for session state
- [ ] Create Zustand store for UI state (sidebar width, diff mode)
- [ ] Render TopBar with session info (base..head, repo path)
- [ ] Render Sidebar placeholder (file list from manifest)
- [ ] Render DiffPane placeholder
- [ ] Implement resizable sidebar (drag handle)

### IPC Protocol

For CLI → Desktop communication when app is already running:

```typescript
// Message sent via Unix socket / named pipe
interface IPCMessage {
  type: 'load_session';
  sessionPath: string;
}
```

### Deliverable
App opens, loads manifest, displays file list in sidebar, shows session info in top bar.

---

## Phase 3: Rust Backend Core

### Goal
Implement the performance-critical Rust layer: git operations, Tree-sitter highlighting, and content hashing.

### Rust Module Structure

```
src-tauri/src/
├── main.rs
├── commands/
│   ├── mod.rs
│   ├── session.rs        # Load/save session
│   ├── git.rs            # Git operations
│   ├── diff.rs           # Diff fetching & parsing
│   └── highlight.rs      # Tree-sitter highlighting
├── git/
│   ├── mod.rs
│   ├── operations.rs     # Shell out to git
│   └── parser.rs         # Parse git output
├── highlight/
│   ├── mod.rs
│   ├── languages.rs      # Language detection
│   └── tokenizer.rs      # Tree-sitter integration
├── state/
│   ├── mod.rs
│   ├── schema.rs         # State types
│   └── recovery.rs       # Fuzzy recovery logic
└── utils/
    └── hash.rs           # SHA-256 content hashing
```

### Tauri Commands

```rust
#[tauri::command]
async fn get_file_diff(
    repo_root: String,
    base_sha: String,
    head_sha: String,
    file_path: String,
    ignore_whitespace: bool,
) -> Result<FileDiff, String>;

#[tauri::command]
fn highlight_code(
    content: String,
    language: String,
) -> Result<Vec<HighlightSpan>, String>;

#[tauri::command]
fn compute_content_hash(diff_content: String) -> String;

#[tauri::command]
fn detect_language(file_path: String) -> String;
```

### Data Structures

```rust
#[derive(Serialize)]
pub struct FileDiff {
    pub hunks: Vec<Hunk>,
    pub content_hash: String,
    pub stats: DiffStats,
}

#[derive(Serialize)]
pub struct Hunk {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Serialize)]
pub struct DiffLine {
    pub line_type: LineType,  // Added, Deleted, Context
    pub content: String,
    pub old_line_num: Option<u32>,
    pub new_line_num: Option<u32>,
    pub highlights: Vec<HighlightSpan>,  // Pre-computed
}

#[derive(Serialize)]
pub struct HighlightSpan {
    pub start: u32,
    pub end: u32,
    pub scope: String,  // e.g., "keyword", "string", "comment"
}
```

### Tree-sitter Languages (MVP)

Include parsers for common languages:
- TypeScript/JavaScript
- Rust
- Python
- Go
- JSON/YAML
- Markdown
- CSS/SCSS
- HTML

### Tasks

- [ ] Implement `get_file_diff` command (shell to `git diff`)
- [ ] Parse unified diff format into structured `FileDiff`
- [ ] Implement SHA-256 hashing of diff content
- [ ] Set up Tree-sitter with language parsers
- [ ] Implement `highlight_code` command
- [ ] Implement language detection from file extension
- [ ] Pre-compute highlights for diff lines in Rust
- [ ] Add caching layer for computed diffs (LRU cache)

### Deliverable
React can call Tauri commands to fetch highlighted, structured diffs.

---

## Phase 4: File Tree Sidebar

### Goal
Render the changed files list with status indicators, stats, and keyboard navigation.

### Components

```
components/sidebar/
├── FileTree.tsx          # Main sidebar component
├── FileTreeItem.tsx      # Individual file row
├── DirectoryGroup.tsx    # Collapsible directory
├── DiffStats.tsx         # +12 -3 with bar
├── StatusBadge.tsx       # A/M/D/R indicator
└── FileFilter.tsx        # Filter controls
```

### State

```typescript
interface SidebarState {
  files: FileEntry[];
  selectedPath: string | null;
  expandedDirs: Set<string>;
  filter: {
    status: ('added' | 'modified' | 'deleted' | 'renamed')[];
    viewedState: 'all' | 'viewed' | 'unviewed';
    searchQuery: string;
  };
}
```

### Tasks

- [ ] Group files by directory path
- [ ] Render file tree with indentation
- [ ] Implement collapsible directories
- [ ] Add status badges (A = green, M = yellow, D = red, R = blue)
- [ ] Add diff stats component with proportion bar
- [ ] Implement file selection (click and keyboard)
- [ ] Add `j`/`k` navigation
- [ ] Add `Enter` to open file
- [ ] Implement filter by status type
- [ ] Implement filter by viewed state
- [ ] Add search/filter input

### Visual Design

```
┌─────────────────────────────────────┐
│ Filter: [___________] ▼ Status ▼    │
├─────────────────────────────────────┤
│ ▼ src/                              │
│   ▼ components/                     │
│     ☑ Button.tsx     M   +12 −3 ███░│
│     ☐ Modal.tsx      M   +45 −12 ██░│
│   ▼ utils/                          │
│     ☐ parser.ts      A   +89    ████│
│ ▼ tests/                            │
│   ☐ button.test.ts   M   +23 −8  ██░│
│ ☑ package.json       M   +2  −1  ░░░│
└─────────────────────────────────────┘
```

### Deliverable
Navigable file tree with all visual indicators, clicking a file logs the path.

---

## Phase 5: Diff Rendering

### Goal
Build the virtualized diff viewer with split/unified modes and syntax highlighting.

### Components

```
components/diff/
├── DiffViewer.tsx        # Main container, mode switching
├── SplitView.tsx         # Side-by-side view
├── UnifiedView.tsx       # Single column view
├── VirtualizedDiff.tsx   # Virtual scrolling wrapper
├── HunkHeader.tsx        # @@ -1,5 +1,7 @@ header
├── DiffLine.tsx          # Single line with highlights
├── LineNumber.tsx        # Line number gutter
├── SyntaxSpan.tsx        # Highlighted text span
└── NewFileView.tsx       # Full-width for new files
```

### Virtualization Strategy

Using `@tanstack/react-virtual` for windowed rendering:

```typescript
// Each "row" in the virtual list is either:
// - A hunk header
// - A diff line (with both sides in split mode)

interface VirtualRow {
  type: 'hunk-header' | 'line';
  hunkIndex: number;
  lineIndex?: number;
}
```

### Split View Layout

```
┌──────────────────────────────────────────────────────────────┐
│ @@ -12,7 +12,9 @@ function parseConfig(input: string)         │
├────────────────────────────┬─────────────────────────────────┤
│  12 │ const result = {};   │  12 │ const result = {};        │
│  13 │ for (const k of ks)  │  13 │ for (const k of keys) {   │
│  14 │   result[k] = val;   │  14 │   if (k) {                │
│     │                      │  15 │     result[k] = val;      │
│     │                      │  16 │   }                       │
│  15 │ return result;       │  17 │ return result;            │
└────────────────────────────┴─────────────────────────────────┘
```

### Tasks

- [ ] Create `VirtualizedDiff` with react-virtual
- [ ] Implement row height estimation for variable heights
- [ ] Build `SplitView` with synchronized scrolling
- [ ] Build `UnifiedView` with single column
- [ ] Render `HunkHeader` with context info
- [ ] Render `DiffLine` with line type styling
- [ ] Apply syntax highlighting from Tree-sitter spans
- [ ] Implement line number gutters (both sides for split)
- [ ] Add word-level diff highlighting within lines
- [ ] Handle new files: full-width in split mode
- [ ] Handle deleted files: show deletion context
- [ ] Handle renamed files: show old/new path
- [ ] Handle binary files: show "Binary file changed" message
- [ ] Implement smooth scrolling to hunk (`n`/`p` navigation)

### Syntax Highlighting Theme

Map Tree-sitter scopes to CSS classes:

```css
.hl-keyword { color: #cf222e; }
.hl-string { color: #0a3069; }
.hl-comment { color: #6e7781; }
.hl-function { color: #8250df; }
.hl-variable { color: #953800; }
.hl-type { color: #0550ae; }
/* ... */
```

### Deliverable
Viewing a file shows syntax-highlighted, virtualized diff in split or unified mode.

---

## Phase 6: State Management

### Goal
Implement full state persistence with fuzzy recovery.

### State Files

```
.revi/
├── state/
│   └── <base-sha>..<head-sha>.json   # Review state
└── config.json                        # User config
```

### Zustand Stores

```typescript
// stores/reviewState.ts
interface ReviewStateStore {
  // Current state
  files: Record<string, FileState>;
  ui: UIState;
  
  // Actions
  markViewed: (path: string) => void;
  markUnviewed: (path: string) => void;
  setCollapseState: (path: string, state: CollapseState) => void;
  setScrollPosition: (path: string, position: number) => void;
  
  // Persistence
  loadState: (baseSha: string, headSha: string) => Promise<void>;
  saveState: () => Promise<void>;
  
  // Recovery
  recoverState: (oldState: PersistedState, newManifest: ReviewManifest) => void;
}

interface FileState {
  viewed: boolean;
  lastViewedSha: string;
  contentHash: string;
  diffStats: { additions: number; deletions: number };
  collapseState: { file: boolean; hunks: number[] };
  scrollPosition: number;
  changedSinceViewed?: boolean;  // For recovery badge
}
```

### Rust Commands for State

```rust
#[tauri::command]
async fn load_review_state(
    repo_root: String,
    base_sha: String,
    head_sha: String,
) -> Result<Option<PersistedState>, String>;

#[tauri::command]
async fn save_review_state(
    repo_root: String,
    state: PersistedState,
) -> Result<(), String>;

#[tauri::command]
fn recover_state(
    old_state: PersistedState,
    new_files: Vec<FileWithHash>,
) -> RecoveredState;
```

### Recovery Logic (Rust)

```rust
pub fn recover_state(
    old_state: PersistedState,
    new_files: Vec<FileWithHash>,
) -> RecoveredState {
    let mut recovered_files = HashMap::new();
    
    for (path, old_file) in old_state.files {
        if let Some(new_file) = new_files.iter().find(|f| f.path == path) {
            if old_file.content_hash == new_file.content_hash {
                // Content unchanged - preserve viewed state
                recovered_files.insert(path, FileRecovery {
                    viewed: old_file.viewed,
                    changed_since_viewed: false,
                    old_stats: old_file.diff_stats,
                    new_stats: new_file.diff_stats,
                });
            } else {
                // Content changed - mark unviewed, show delta
                recovered_files.insert(path, FileRecovery {
                    viewed: false,
                    changed_since_viewed: true,
                    old_stats: old_file.diff_stats,
                    new_stats: new_file.diff_stats,
                });
            }
        }
        // Deleted files are simply not included
    }
    
    RecoveredState { files: recovered_files }
}
```

### Tasks

- [ ] Define `PersistedState` schema in shared package
- [ ] Implement `load_review_state` Tauri command
- [ ] Implement `save_review_state` Tauri command
- [ ] Implement `recover_state` logic in Rust
- [ ] Create Zustand store with persistence middleware
- [ ] Auto-save state on viewed/collapse/scroll changes (debounced)
- [ ] Load state on session open
- [ ] Trigger recovery when SHA mismatch detected
- [ ] Show "Changed since last view" badge in sidebar
- [ ] Show diff delta in tooltip ("was +12/-3, now +15/-3")
- [ ] Track review progress in TopBar ("14/23 files viewed")

### Deliverable
State persists across app restarts; fuzzy recovery works after rebase/amend.

---

## Phase 7: Keyboard Navigation

### Goal
Implement the full keybinding system with configurability.

### Keybinding Manager

```typescript
// lib/keybindings.ts
interface Keybinding {
  key: string;           // e.g., "j", "Shift+Enter", "Cmd+Shift+O"
  action: string;        // e.g., "nextFile", "openInEditor"
  context?: string;      // e.g., "sidebar", "diffPane"
}

const defaultKeybindings: Keybinding[] = [
  { key: 'j', action: 'nextFile', context: 'global' },
  { key: 'k', action: 'prevFile', context: 'global' },
  { key: 'Enter', action: 'openFile', context: 'sidebar' },
  { key: 'n', action: 'nextHunk', context: 'diffPane' },
  { key: 'p', action: 'prevHunk', context: 'diffPane' },
  { key: 'v', action: 'toggleViewed', context: 'global' },
  { key: '[', action: 'collapseHunk', context: 'diffPane' },
  { key: ']', action: 'expandHunk', context: 'diffPane' },
  { key: 's', action: 'toggleDiffMode', context: 'global' },
  { key: 'b', action: 'toggleSidebar', context: 'global' },
  { key: '?', action: 'showHelp', context: 'global' },
  { key: 'Cmd+Shift+C', action: 'copyPath', context: 'diffPane' },
  { key: 'Cmd+Shift+O', action: 'openInEditor', context: 'diffPane' },
  { key: 'Escape', action: 'closeOverlay', context: 'global' },
];
```

### Components

```
components/
├── KeyboardManager.tsx   # Global keyboard event handler
└── overlays/
    └── KeyboardHelp.tsx  # Shortcut reference overlay
```

### Tasks

- [ ] Create keyboard event handler hook
- [ ] Implement action dispatcher
- [ ] Load custom keybindings from config
- [ ] Merge custom keybindings with defaults
- [ ] Implement all default actions
- [ ] Create keyboard help overlay (`?`)
- [ ] Handle modifier keys (Cmd, Shift, Ctrl, Alt)
- [ ] Prevent conflicts with system shortcuts
- [ ] Add visual feedback for actions (e.g., brief highlight on navigation)

### Keyboard Help Overlay

```
┌─────────────────────────────────────────────┐
│              Keyboard Shortcuts             │
├─────────────────────────────────────────────┤
│ Navigation                                  │
│   j / k         Next / previous file        │
│   Enter         Open selected file          │
│   n / p         Next / previous hunk        │
│                                             │
│ Actions                                     │
│   v             Toggle file as viewed       │
│   [ / ]         Collapse / expand hunk      │
│   s             Toggle split / unified      │
│   b             Toggle sidebar              │
│                                             │
│ Editor                                      │
│   ⌘⇧O           Open in editor              │
│   ⌘⇧C           Copy file path + line       │
│                                             │
│ Press Escape or ? to close                  │
└─────────────────────────────────────────────┘
```

### Deliverable
All keyboard shortcuts work; custom keybindings load from config.

---

## Phase 8: File Interactions

### Goal
Implement open-in-editor, copy actions, and collapse controls.

### Tauri Commands

```rust
#[tauri::command]
async fn open_in_editor(
    editor_command: String,
    file_path: String,
    line: Option<u32>,
) -> Result<(), String> {
    // Parse template: "code -g {file}:{line}"
    // Execute shell command
}

#[tauri::command]
fn write_to_clipboard(content: String) -> Result<(), String>;
```

### Components

```
components/
├── diff/
│   ├── CollapseControls.tsx    # Collapse all / expand all
│   └── HunkCollapser.tsx       # Individual hunk collapse
└── context-menu/
    └── LineContextMenu.tsx     # Right-click menu on lines
```

### Tasks

- [ ] Implement `open_in_editor` Tauri command
- [ ] Parse editor command template with placeholders
- [ ] Implement clipboard write command
- [ ] Add "Copy file path" action
- [ ] Add "Copy file path + line" action  
- [ ] Add "Copy hunk as text" action
- [ ] Implement file-level collapse in diff pane
- [ ] Implement hunk-level collapse
- [ ] Add "Collapse all" / "Expand all" buttons
- [ ] Persist collapse state to review state
- [ ] Add right-click context menu on lines

### Deliverable
Can open files in editor, copy paths, collapse/expand hunks.

---

## Phase 9: Change Detection

### Goal
Detect when the repo changes and offer refresh with state preservation.

### Rust File Watcher

```rust
// Using notify crate
use notify::{Watcher, RecursiveMode, Event};

#[tauri::command]
fn start_watching(repo_root: String, app_handle: AppHandle) -> Result<(), String> {
    let watcher = notify::recommended_watcher(move |res: Result<Event, _>| {
        if let Ok(event) = res {
            // Filter for relevant changes
            if is_relevant_change(&event) {
                app_handle.emit("repo-changed", ChangeEvent { ... });
            }
        }
    })?;
    
    watcher.watch(Path::new(&repo_root), RecursiveMode::Recursive)?;
    Ok(())
}

fn is_relevant_change(event: &Event) -> bool {
    // Ignore .revi/, .git/objects, etc.
    // Watch for file changes and git ref changes
}
```

### Change Detection Events

```typescript
interface ChangeEvent {
  type: 'file_changed' | 'ref_changed' | 'commit_added';
  paths?: string[];
  newHeadSha?: string;
}
```

### UI Components

```
components/
└── banners/
    └── RefreshBanner.tsx   # "Changes detected — Refresh?"
```

### Tasks

- [ ] Implement Rust file watcher with notify crate
- [ ] Filter out irrelevant changes (.revi/, node_modules/, etc.)
- [ ] Detect git ref changes (HEAD, branch refs)
- [ ] Emit change events to React frontend
- [ ] Create refresh banner component
- [ ] Implement "Refresh" action
- [ ] On refresh: recompute manifest, apply fuzzy recovery
- [ ] Implement "Dismiss" action (ignore until next change)
- [ ] Show banner non-intrusively (top of diff pane, not modal)

### Refresh Flow

```
Change detected
     │
     ▼
┌─────────────────────────────────────┐
│  Changes detected — Refresh?        │
│                    [Refresh] [Dismiss]│
└─────────────────────────────────────┘
     │
     ▼ (on Refresh)
     │
Recompute manifest
     │
     ▼
Compute content hashes for all files
     │
     ▼
Run fuzzy recovery against old state
     │
     ▼
Update UI with recovered state
```

### Deliverable
App detects changes, shows refresh banner, preserves state on refresh.

---

## Phase 10: Polish & Configuration

### Goal
Implement remaining MVP features: config loading, exclusions, whitespace toggle.

### Config Schema

```typescript
interface ReviConfig {
  editor?: string;                    // e.g., "code -g {file}:{line}"
  defaultBase?: string;               // e.g., "main"
  defaultDiffMode?: 'split' | 'unified';
  exclude?: string[];                 // Glob patterns
  dangerZone?: string[];              // v1.5, but load now
  keybindings?: Record<string, string>;
}
```

### Components

```
components/
├── TopBar/
│   ├── WhitespaceToggle.tsx
│   └── HiddenFilesIndicator.tsx   # "5 files hidden"
└── sidebar/
    └── HiddenFilesToggle.tsx      # "Show N hidden files"
```

### Tasks

- [ ] Implement config file loading from `.revi/config.json`
- [ ] Apply config on app start
- [ ] Implement glob-based file exclusion (minimatch)
- [ ] Show "N files hidden" indicator in sidebar
- [ ] Add "Show hidden files" toggle
- [ ] Implement whitespace toggle in TopBar
- [ ] Re-fetch diffs with `-w` flag when whitespace hidden
- [ ] Apply default diff mode from config
- [ ] Apply default base from config (in CLI)
- [ ] Validate config file and show errors gracefully

### Exclusion Logic

```typescript
// In manifest processing
import { minimatch } from 'minimatch';

function filterFiles(files: FileEntry[], exclude: string[]): FileEntry[] {
  return files.filter(file => 
    !exclude.some(pattern => minimatch(file.path, pattern))
  );
}
```

### Final Polish

- [ ] Add loading states for diff fetching
- [ ] Add error states (git errors, file not found)
- [ ] Ensure scroll position retention when switching files
- [ ] Test with large repos (1000+ changed files)
- [ ] Test with large files (10000+ lines)
- [ ] Performance profiling and optimization
- [ ] Accessibility audit (focus management, ARIA)

### Deliverable
Complete MVP with all features from Section 23 of the PRD.

---

## Phase 11: MVP Comments & AI Export

### Goal
Add lightweight line-level comments with one-click AI-friendly export.

### Storage Schema Extension

Comments extend the existing `PersistedState`:

```typescript
interface Comment {
  id: string;
  filePath: string;
  lineNumber: number;
  content: string;
  createdAt: string;
}

// Added to PersistedState
interface PersistedState {
  // ... existing fields
  comments: Comment[];
}
```

### Components

```
components/
├── comments/
│   └── CommentInput.tsx      # Popover for adding/editing comment
└── sidebar/
    └── CopyCommentsButton.tsx # "Copy Comments for AI" button
```

### Tauri Commands

```rust
#[tauri::command]
fn generate_comments_markdown(comments: Vec<Comment>) -> String {
    // Group by file, format as markdown
    // Returns formatted string ready for clipboard
}
```

### Export Format

```markdown
## Review Feedback

### src/utils/parser.ts
- Line 45: This null check is unsafe in async paths. Fix defensively.
- Line 89: Consider using a Map instead of object here.

### src/components/Button.tsx
- Line 12: Rename `onClick` prop to `onPress` for consistency.
```

### Tasks

- [ ] Extend `PersistedState` schema to include `comments` array
- [ ] Add comment input popover (appears on line gutter click or `c` key)
- [ ] Implement add/edit/delete comment actions
- [ ] Persist comments in state file (reuse existing save mechanism)
- [ ] Add "Copy Comments for AI" button in sidebar
- [ ] Implement `generate_comments_markdown` function
- [ ] Copy formatted markdown directly to clipboard on button click
- [ ] Add keyboard shortcut `Cmd+Shift+E` for quick export
- [ ] Handle line number drift: show warning badge if line content changed
- [ ] Clear comments option (for starting fresh)

### Line Number Drift Strategy

When the diff changes (refresh after new commit), comments may reference stale line numbers:

- **v1.75 approach (simple)**: Keep comment attached to stored line number
- Show warning badge on comment if line content at that number has changed significantly
- User can manually update or delete stale comments
- **Future (v2)**: Content anchoring — store surrounding context to find new location

### Deliverable
Can add comments on diff lines, click sidebar button to copy all as markdown for AI agents.

---

## Risk Areas & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tree-sitter Rust integration complexity | High | Start with fallback (no highlighting), add incrementally |
| Virtual scrolling performance | Medium | Use proven library (@tanstack/react-virtual), profile early |
| Git edge cases (submodules, worktrees) | Medium | Focus on common cases, document limitations |
| Large diff memory usage | Medium | Stream diffs, don't load all at once |
| IPC between CLI and running app | Low | Start with simple "just launch new instance" approach |

---

## Testing Strategy

### Unit Tests
- CLI: git operations, manifest generation
- Shared: schema validation, type guards
- Rust: diff parsing, content hashing, recovery logic

### Integration Tests
- CLI → manifest → Desktop load
- Diff fetch → highlight → render
- State persist → recovery flow

### E2E Tests (Playwright + Tauri)
- Full review flow: open, navigate, mark viewed
- Keyboard navigation
- Refresh flow with state preservation

---

## Definition of Done (MVP + v1.75)

- [ ] `revi .` generates manifest and launches app
- [ ] App shows changed files with status and stats
- [ ] Split and unified diff modes work
- [ ] Syntax highlighting works for common languages
- [ ] Files can be marked as viewed
- [ ] Hunks can be collapsed
- [ ] All keyboard shortcuts work
- [ ] State persists across sessions
- [ ] Fuzzy recovery works after amend/rebase
- [ ] Changes are detected and refresh works
- [ ] Config file is respected
- [ ] Exclusion patterns work
- [ ] Whitespace toggle works
- [ ] Open in editor works
- [ ] Copy file path works
- [ ] Performance acceptable for 100+ file changesets
- [ ] Can add comments on diff lines
- [ ] "Copy Comments for AI" button copies markdown to clipboard
- [ ] Comments persist in state file
- [ ] Line drift shows warning badge when content changed
