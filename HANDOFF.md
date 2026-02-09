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

### Recent Git History

```
54ed78b chore(desktop): update app icon with diff-themed design
cf91d33 feat(desktop): complete Phase 5 diff rendering with full-file syntax highlighting
011d7ec feat(desktop): complete Phase 4 file tree sidebar
81b68d2 feat(desktop): complete Phase 2-3 with working tree support
74369eb docs: add v1.75 MVP Comments & AI Export feature
16c6490 feat(cli): complete Phase 1 CLI foundation
f58d9f6 feat: scaffold monorepo with CLI, desktop, and shared packages
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
│   │   │   ├── App.tsx           # Main app with session persistence
│   │   │   ├── components/
│   │   │   │   ├── layout/       # TopBar, Sidebar, DiffPane
│   │   │   │   ├── sidebar/      # FileFilter, DirectoryGroup, FileTreeItem, DiffStatsBar
│   │   │   │   └── diff/         # DiffLine, HunkHeader, UnifiedView, SplitView, SplitDiffLine
│   │   │   ├── stores/
│   │   │   │   ├── session.ts    # Session state + persistence
│   │   │   │   ├── sidebar.ts    # Filter/expand state
│   │   │   │   └── ui.ts         # UI preferences (diff mode)
│   │   │   ├── hooks/
│   │   │   │   ├── useDiff.ts    # Fetch diff from backend
│   │   │   │   └── useFileNavigation.ts  # j/k/Enter keyboard nav
│   │   │   └── styles/
│   │   │       └── index.css     # All styles + GitHub Dark syntax theme
│   │   │
│   │   ├── src-tauri/            # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── main.rs       # Tauri app + command registration
│   │   │   │   └── commands/
│   │   │   │       ├── session.rs    # Session CRUD, persistence, working tree
│   │   │   │       ├── git.rs        # Diff fetching, caching, new/deleted file handling
│   │   │   │       └── highlight.rs  # Tree-sitter with full-file context
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
| `clear_last_session` | session.rs | Clear saved project (change project) |
| `get_file_diff` | git.rs | Fetch diff with syntax highlighting |
| `compute_content_hash` | git.rs | SHA-256 hash of content |
| `invalidate_diff_cache` | git.rs | Clear cache for a repo |
| `clear_diff_cache` | git.rs | Clear entire cache |
| `highlight_code` | highlight.rs | Highlight code string |
| `detect_language` | highlight.rs | Detect language from file path |

---

## Supported Languages (Tree-sitter)

TypeScript/TSX, JavaScript/JSX, Rust, Python, Go, JSON, CSS, HTML, Markdown, YAML, Bash

**Note**: TOML support disabled due to version incompatibility with tree-sitter 0.24

---

## What's Next

### Phase 7: Keyboard Navigation (2-3 days) - RECOMMENDED NEXT
- Full keybinding system (n/p for next/prev file, etc.)
- Command palette
- Visual feedback on navigation

### Phase 8: File Interactions (2-3 days)
- Open file in editor (Cmd+O)
- Copy file path
- Collapse/expand hunks

### Phase 9: Change Detection (3-4 days)
- File watcher for live updates
- Refresh flow with state preservation

### Phase 10: Polish & Config (3-4 days)
- Exclusion patterns (.gitignore-style)
- Whitespace toggle
- Config file loading

### Phase 11: MVP Comments & AI Export (3-4 days)
- Line comments on diff
- "Copy Comments for AI" button
- Markdown export

### Phase 12: Multi-Window Management (3-4 days) - NEW
- Multiple windows for different projects
- Window state restoration
- "File > New Window" menu

See `docs/implementation-plan.md` for full task breakdown.

---

## Known Issues / Notes

1. **No keyboard shortcuts beyond j/k/v** - Phase 7 adds full keybinding system
2. **App launcher in CLI** - Just prints instructions, doesn't spawn app yet
3. **TOML highlighting disabled** - tree-sitter-toml 0.20 incompatible with tree-sitter 0.24
4. **Single window only** - Phase 12 will add multi-window support
5. **Comparison mode persistence** - Last-used mode not yet persisted per repository

---

## Important Files to Read First

1. `docs/implementation-plan.md` - Full roadmap with task lists
2. `docs/revi-prd.md` - Product requirements and UX specs
3. `packages/desktop/src-tauri/src/commands/git.rs` - Core diff logic + highlighting
4. `packages/desktop/src-tauri/src/commands/highlight.rs` - Tree-sitter with full-file context
5. `packages/desktop/src/App.tsx` - Main React app with session persistence
6. `packages/desktop/src/stores/session.ts` - Session state + Tauri calls
7. `packages/desktop/src/components/diff/` - Diff rendering components

---

## User Preferences

From `.claude/CLAUDE.md`:
- Do NOT run tests automatically - always ask first
- Do NOT run build/compile commands without approval
- Minimize shell command execution
- Focus on reading and writing code only
- Prefer smaller, targeted file edits over large rewrites

---

## Recommended Next Step

Start **Phase 7: Keyboard Navigation** to add full keybinding system:
- Implement n/p for next/prev hunk navigation
- Add command palette (Cmd+K or ?)
- Add `[` / `]` for collapse/expand hunks
- Add visual feedback on navigation actions

Key implementation steps:
1. Create keyboard event handler hook
2. Implement action dispatcher
3. Load custom keybindings from config
4. Create keyboard help overlay (`?`)
5. Implement all default actions

See `docs/implementation-plan.md` Phase 7 section for full details.
