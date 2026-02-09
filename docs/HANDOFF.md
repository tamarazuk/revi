# Revi Project Handoff

## Project Overview

**Revi** is a local-only code review tool that recreates the GitHub PR "Files Changed" experience for local repositories. It allows developers to review uncommitted changes, compare branches, and navigate diffs with syntax highlighting.

**Repository**: `/Users/tamarazuk/code/personal/revi`

**Tech Stack**:
- **CLI**: Node.js + TypeScript + Commander.js
- **Desktop Frontend**: React 18 + Zustand + Vite
- **Desktop Backend**: Tauri 2 (Rust)
- **Syntax Highlighting**: Tree-sitter (full-file context for accurate highlighting)
- **Build**: pnpm workspaces + Turborepo

---

## Current State

### Completed Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 0** | Done | Monorepo scaffolding (pnpm + Turborepo) |
| **Phase 1** | Done | CLI foundation (git detection, manifest generation) |
| **Phase 2** | Done | Desktop shell (three-pane layout, session loading) |
| **Phase 2b** | Done | Project picker (folder dialog, standalone launch) |
| **Phase 3** | Done | Rust backend (Tree-sitter highlighting, diff caching) |
| **Phase 4** | Done | File tree sidebar (filters, directory groups, keyboard nav) |
| **Phase 5** | Done | Diff rendering (unified/split views, syntax highlighting) |
| **Session Persistence** | Done | Auto-restore last project on app relaunch |
| **Phase 6** | Done | State management (viewed files, persistence, progress tracking) |
| **Phase 6b** | Done | Comparison mode switcher (uncommitted/branch/custom) |
| **Phase 7** | Done | Keyboard navigation, hunk collapse, help overlay |
| **Phase 8** | Done | Multi-window management (Cmd+N, window state persistence, restore) |
| **Phase 9** | Done | File interactions (open in editor, copy path, context menu) |

### Recent Git History

```
c6d3915 fix(desktop): sanitize window dimensions to prevent rendering corruption
230d074 feat(desktop): add Phosphor Icons and replace inline SVGs
6df7838 feat(desktop): add file interactions and zoom support (Phase 9)
705d828 feat(desktop): add multi-window management and update handoff (Phase 8)
00daead feat(desktop): add keyboard navigation, hunk collapse, and help overlay (Phase 7)
```

---

## How to Run

```bash
# Install dependencies
pnpm install

# Run desktop app in dev mode (from root)
pnpm dev

# Build CLI and link globally (optional)
pnpm build
cd packages/cli && pnpm link --global

# Then use anywhere:
revi .
```

---

## Project Structure

```
revi/
├── packages/
│   ├── cli/                      # Node.js CLI
│   │   ├── src/
│   │   │   ├── index.ts          # Commander.js entry
│   │   │   ├── commands/         # review.ts, sessions.ts
│   │   │   ├── git/              # detect.ts, refs.ts, diff.ts
│   │   │   └── manifest/         # writer.ts
│   │   └── package.json
│   │
│   ├── desktop/                  # Tauri + React app
│   │   ├── src/                  # React frontend
│   │   │   ├── App.tsx           # Main app with window-aware session init
│   │   │   ├── components/
│   │   │   │   ├── layout/       # TopBar, Sidebar, DiffPane
│   │   │   │   ├── sidebar/      # FileFilter, DirectoryGroup, FileTreeItem, DiffStatsBar
│   │   │   │   ├── topbar/       # ComparisonModeDropdown
│   │   │   │   ├── diff/         # DiffLine, HunkHeader, UnifiedView, SplitView, SplitDiffLine
│   │   │   │   ├── overlays/     # KeyboardHelp
│   │   │   │   └── ui/           # ContextMenu
│   │   │   ├── stores/
│   │   │   │   ├── session.ts    # Session state + persistence + window state saving
│   │   │   │   ├── sidebar.ts    # Filter/expand state
│   │   │   │   ├── ui.ts         # UI preferences (diff mode, sidebar) — scoped by window label
│   │   │   │   ├── keyboard.ts   # Help overlay + hunk navigation state
│   │   │   │   └── reviewState.ts # Viewed files, collapse state, persistence
│   │   │   ├── hooks/
│   │   │   │   ├── useDiff.ts    # Fetch diff from backend
│   │   │   │   ├── useKeyboardManager.ts  # Central keyboard handler (all shortcuts + Cmd+N)
│   │   │   │   └── useDiffNavigation.ts   # Hunk scroll registration for n/p nav
│   │   │   └── styles/
│   │   │       └── index.css     # All styles + GitHub Dark syntax theme
│   │   │
│   │   ├── src-tauri/            # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── main.rs       # Tauri app + command registration + window event handlers
│   │   │   │   └── commands/
│   │   │   │       ├── session.rs    # Session CRUD, persistence, working tree
│   │   │   │       ├── git.rs        # Diff fetching, caching, new/deleted file handling
│   │   │   │       ├── highlight.rs  # Tree-sitter with full-file context
│   │   │   │       ├── window.rs     # Window manager, create/restore/persist windows
│   │   │   │       └── file_ops.rs   # Open in editor, clipboard operations
│   │   │   ├── capabilities/
│   │   │   │   └── default.json  # Permissions for main + revi-* windows
│   │   │   ├── icons/            # App icons (icon.png, icon.svg)
│   │   │   └── tauri.conf.json
│   │   └── package.json
│   │
│   └── shared/                   # Shared TypeScript types
│       └── src/
│           ├── manifest.ts       # ReviewManifest, FileEntry, RefInfo
│           ├── state.ts          # PersistedState, FileState
│           ├── diff.ts           # FileDiff, Hunk, DiffLine, HighlightSpan
│           └── config.ts         # ReviConfig
│
├── docs/
│   ├── revi-prd.md               # Product Requirements Document
│   └── implementation-plan.md    # Detailed phase breakdown (updated with Phase 12)
│
├── package.json                  # Workspace root (pnpm dev runs desktop)
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## Key Technical Decisions

1. **Tauri 2** (not Tauri 1) - Newer plugin system, better API
2. **Tree-sitter in Rust with full-file context** - Highlights entire file first, then maps spans to lines for accurate token recognition
3. **Zustand** - Simple React state management
4. **Working Tree Support** - When uncommitted changes exist, compare HEAD vs working tree
5. **LRU Caching** - 100-entry cache for computed diffs (skipped for working tree)
6. **Session Persistence** - Last project saved to Tauri app data dir, auto-restored on launch
7. **Synthetic diffs** - New files and deleted files generate proper diffs even when git returns empty
8. **Manual viewed marking** - Files are only marked viewed via `v` key or clicking the indicator (no auto-mark on open)
9. **Multi-window isolation** - Each Tauri webview has its own JS context; Zustand stores are automatically isolated per window. localStorage is scoped by window label to avoid collision (all webviews share `tauri://localhost` origin).

---

## Phase 8: Multi-Window Management (Completed)

### Architecture

Each Tauri 2 window runs its own webview with a separate JavaScript execution context. Zustand singleton stores are automatically isolated per window — no factory/context pattern needed. The work was primarily Rust-side window lifecycle + frontend wiring.

### What was built

**Rust (`window.rs`)**:
- `WindowManager` — app-level state with `Mutex<HashMap<String, WindowInfo>>` + atomic counter
- `WindowInfo` — tracks label, repo_path, base_ref, position, size per window
- Commands: `create_window`, `register_window_session`, `save_window_states`, `load_window_states`, `get_window_session`
- `restore_windows()` — called during `.setup()` to reopen saved windows on app restart
- `persist_states_sync()` — called from window event handlers

**Rust (`main.rs`)**:
- `.manage(WindowManager::new())` for app state
- `.setup()` hook calls `restore_windows()`
- `.on_window_event()` handler tracks Moved/Resized/CloseRequested/Destroyed

**Frontend**:
- `App.tsx` — window-aware init: checks `get_window_session` for restored windows, falls back to `load_last_session` on main window only. Sets window title to `"repoName - Revi"`.
- `ui.ts` — localStorage key scoped by `getCurrentWebviewWindow().label`
- `useKeyboardManager.ts` — Cmd/Ctrl+N opens new window
- `session.ts` — calls `save_window_states` after session changes
- `TopBar.tsx` — "Change Project" replaced with "New Window" button
- `KeyboardHelp.tsx` — added Cmd+N to help overlay
- `capabilities/default.json` — `"windows": ["main", "revi-*"]`

### Window state persistence

Window states are saved to `{app_data_dir}/window-states.json` containing an array of `WindowInfo` objects. On close, states are persisted. On relaunch, `restore_windows()` reads this file and recreates windows at their saved positions/sizes with their previous projects.

**Dimension sanitization**: Restored window dimensions are validated against reasonable bounds (800-8000 width, 600-5000 height). Invalid values fall back to defaults (1400x900). This prevents corrupted state files from causing GPU compositing failures on retina displays.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `ArrowDown` | Next file |
| `k` / `ArrowUp` | Previous file |
| `g` | First file |
| `G` (Shift+g) | Last file |
| `Enter` / `o` | Open file |
| `v` | Toggle viewed |
| `n` | Next hunk |
| `p` | Previous hunk |
| `s` | Toggle split/unified view |
| `b` | Toggle sidebar |
| `[` | Collapse active hunk |
| `]` | Expand active hunk |
| `?` | Toggle help overlay |
| `Escape` | Close help overlay |
| `Cmd+N` / `Ctrl+N` | New window |
| `Cmd+Shift+O` | Open file in editor |
| `Cmd+C` | Copy relative path |
| `Cmd+Shift+C` | Copy absolute path |
| `Cmd+Plus` | Zoom in |
| `Cmd+Minus` | Zoom out |
| `Cmd+0` | Reset zoom |

**Implementation**: Single `useKeyboardManager` hook in `App.tsx` attaches one global `keydown` listener. Shortcuts are blocked when typing in inputs or when the help overlay is open (only `?`/`Escape` pass through). Hunk navigation uses a `useDiffNavigation` hook in each diff view that registers a scroll callback with the `keyboard` store.

---

## Tauri Commands Available

| Command | File | Description |
|---------|------|-------------|
| `get_session_arg` | session.rs | Parse CLI args for session path |
| `load_session` | session.rs | Load manifest from JSON file |
| `create_session_from_repo` | session.rs | Create session from folder picker |
| `save_review_state` | session.rs | Persist review state |
| `load_review_state` | session.rs | Load persisted state |
| `save_last_session` | session.rs | Save last project for persistence |
| `load_last_session` | session.rs | Load last project on startup |
| `clear_last_session` | session.rs | Clear saved project |
| `list_branches` | session.rs | List local + remote branches |
| `list_recent_commits` | session.rs | List recent commits for branch picker |
| `get_file_diff` | git.rs | Fetch diff with syntax highlighting |
| `compute_content_hash` | git.rs | SHA-256 hash of content |
| `invalidate_diff_cache` | git.rs | Clear cache for a repo |
| `clear_diff_cache` | git.rs | Clear entire cache |
| `highlight_code` | highlight.rs | Highlight code string |
| `detect_language` | highlight.rs | Detect language from file path |
| `create_window` | window.rs | Create a new app window |
| `register_window_session` | window.rs | Associate a window with a repo/session |
| `save_window_states` | window.rs | Persist all window states to disk |
| `load_window_states` | window.rs | Load persisted window states |
| `get_window_session` | window.rs | Get saved session info for a window |
| `open_in_editor` | file_ops.rs | Open file in default/configured editor |
| `copy_to_clipboard` | file_ops.rs | Copy text to system clipboard |

---

## Supported Languages (Tree-sitter)

TypeScript/TSX, JavaScript/JSX, Rust, Python, Go, JSON, CSS, HTML, Markdown, YAML, Bash

**Note**: TOML support disabled due to version incompatibility with tree-sitter 0.24

---

## Phase 9: File Interactions (Completed)

### What was built

**Rust (`file_ops.rs`)**:
- `open_in_editor` — Opens file in user's editor (respects `$VISUAL`/`$EDITOR` env vars, falls back to system default via `open -t` on macOS)
- `copy_to_clipboard` — Copies text to system clipboard using `tauri-plugin-clipboard-manager`
- Smart editor detection: handles VS Code (`code -g file:line`), Vim/Neovim (`+line file`), and others

**Frontend**:
- `useKeyboardManager.ts` — Added shortcuts:
  - `Cmd+Shift+O` — open in editor
  - `Cmd+C` — copy relative path
  - `Cmd+Shift+C` — copy absolute path
  - `Cmd+Plus/Minus/0` — zoom in/out/reset
- `ContextMenu.tsx` — New reusable context menu component with keyboard dismiss support
- `FileTreeItem.tsx` — Right-click context menu with "Open in Editor", "Copy Relative Path", "Copy Absolute Path"
- `DiffPane.tsx` — Quick action buttons in header (copy icon, code file icon) for copy path and open in editor
- `KeyboardHelp.tsx` — Updated with all new shortcuts

**Capabilities**:
- Added `shell:allow-spawn`, `clipboard-manager:allow-write-text`, `core:webview:allow-set-webview-zoom` permissions

### How it works

1. **Keyboard shortcuts**: With a file selected, press `Cmd+Shift+O` to open in editor, `Cmd+C` for relative path, `Cmd+Shift+C` for absolute path
2. **Context menu**: Right-click any file in the sidebar to see options with shortcuts displayed
3. **Quick actions**: Icon buttons next to file path in diff pane header
4. **Zoom**: Standard browser-like zoom with `Cmd+Plus/Minus/0` using Tauri's WebView zoom API
5. **Editor detection**: Checks `$VISUAL` → `$EDITOR` → system default. Supports line numbers for VS Code/Vim.

---

## What's Next

### Phase 10: Change Detection (3-4 days) - RECOMMENDED NEXT
- File watcher for live updates (`notify` + `tokio` crates — reserved, not yet added)
- Refresh flow with state preservation

### Phase 11: Polish & Config (3-4 days)
- Exclusion patterns (.gitignore-style)
- Whitespace toggle
- Config file loading
- Custom keybinding config

### Phase 12: MVP Comments & AI Export (3-4 days)
- Line comments on diff
- "Copy Comments for AI" button
- Markdown export

See `docs/implementation-plan.md` for full task breakdown.

---

## Known Issues / Notes

1. **App launcher in CLI** - Just prints instructions, doesn't spawn app yet
2. **TOML highlighting disabled** - tree-sitter-toml 0.20 incompatible with tree-sitter 0.24
3. **Comparison mode persistence** - Last-used mode not yet persisted per repository
4. **`G` key (Shift+g)** - The `case 'g'` in useKeyboardManager checks `e.shiftKey` but `e.key` is `'G'` when shifted, so `G` for last file may not work — needs a `case 'G':` added
5. **Command palette** - Deferred from Phase 7, not yet implemented
6. **Zoom persistence** - Zoom level resets on app restart (could persist to localStorage)

---

## Important Files to Read First

1. `docs/implementation-plan.md` - Full roadmap with task lists
2. `docs/revi-prd.md` - Product requirements and UX specs
3. `packages/desktop/src-tauri/src/commands/window.rs` - Window manager (Phase 8)
4. `packages/desktop/src-tauri/src/main.rs` - Tauri app setup + window events
5. `packages/desktop/src/hooks/useKeyboardManager.ts` - Central keyboard handler
6. `packages/desktop/src/stores/keyboard.ts` - Keyboard/hunk navigation state
7. `packages/desktop/src-tauri/src/commands/git.rs` - Core diff logic + highlighting
8. `packages/desktop/src-tauri/src/commands/highlight.rs` - Tree-sitter with full-file context
9. `packages/desktop/src/App.tsx` - Main React app with window-aware session init
10. `packages/desktop/src/stores/session.ts` - Session state + Tauri calls

---

## User Preferences

From `.claude/CLAUDE.md`:
- Do NOT run tests automatically - always ask first
- Do NOT run build/compile commands without approval
- Minimize shell command execution
- Focus on reading and writing code only
- Prefer smaller, targeted file edits over large rewrites
