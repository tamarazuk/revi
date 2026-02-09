# Revi Project Handoff

## Project Overview

**Revi** is a local-only code review tool that recreates the GitHub PR "Files Changed" experience for local repositories. It allows developers to review uncommitted changes, compare branches, and navigate diffs with syntax highlighting.

**Repository**: `/Users/tamarazuk/code/personal/revi`

**Tech Stack**:
- **CLI**: Node.js + TypeScript + Commander.js
- **Desktop Frontend**: React 18 + Zustand + Vite
- **Desktop Backend**: Tauri 2 (Rust)
- **Syntax Highlighting**: Tree-sitter
- **Build**: pnpm workspaces + Turborepo

---

## Current State

### Completed Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 0** | ✅ Complete | Monorepo scaffolding (pnpm + Turborepo) |
| **Phase 1** | ✅ Complete | CLI foundation (git detection, manifest generation) |
| **Phase 2** | ✅ Complete | Desktop shell (three-pane layout, session loading) |
| **Phase 2b** | ✅ Complete | Project picker (folder dialog, standalone launch) |
| **Phase 3** | ✅ Complete | Rust backend (Tree-sitter highlighting, diff caching) |

### Git History

```
81b68d2 feat(desktop): complete Phase 2-3 with working tree support
74369eb docs: add v1.75 MVP Comments & AI Export feature
16c6490 feat(cli): complete Phase 1 CLI foundation
f58d9f6 feat: scaffold monorepo with CLI, desktop, and shared packages
5e2d60c docs: add PRD and implementation plan
```

---

## Project Structure

```
revi/
├── packages/
│   ├── cli/                      # Node.js CLI
│   │   ├── src/
│   │   │   ├── index.ts          # Commander.js entry
│   │   │   ├── commands/
│   │   │   │   ├── review.ts     # Main review command
│   │   │   │   └── sessions.ts   # List/clean sessions
│   │   │   ├── git/
│   │   │   │   ├── detect.ts     # Repo/worktree detection
│   │   │   │   ├── refs.ts       # Ref resolution
│   │   │   │   └── diff.ts       # Changed files parsing
│   │   │   ├── manifest/
│   │   │   │   └── writer.ts     # Manifest JSON writer
│   │   │   └── app/
│   │   │       └── launcher.ts   # App launcher (placeholder)
│   │   └── package.json
│   │
│   ├── desktop/                  # Tauri + React app
│   │   ├── src/                  # React frontend
│   │   │   ├── App.tsx           # Main app with folder picker
│   │   │   ├── components/
│   │   │   │   └── layout/
│   │   │   │       ├── TopBar.tsx
│   │   │   │       ├── Sidebar.tsx
│   │   │   │       ├── DiffPane.tsx      # Placeholder for Phase 5
│   │   │   │       └── ResizeHandle.tsx
│   │   │   ├── stores/
│   │   │   │   ├── session.ts    # Session state + Tauri calls
│   │   │   │   └── ui.ts         # UI preferences
│   │   │   └── styles/
│   │   │       └── index.css
│   │   │
│   │   ├── src-tauri/            # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── main.rs       # Tauri app + command registration
│   │   │   │   └── commands/
│   │   │   │       ├── mod.rs
│   │   │   │       ├── session.rs    # Session CRUD, working tree detection
│   │   │   │       ├── git.rs        # Diff fetching, caching
│   │   │   │       └── highlight.rs  # Tree-sitter integration
│   │   │   ├── Cargo.toml
│   │   │   ├── Cargo.lock
│   │   │   ├── tauri.conf.json
│   │   │   └── capabilities/
│   │   │       └── default.json  # Plugin permissions
│   │   └── package.json
│   │
│   └── shared/                   # Shared TypeScript types
│       └── src/
│           ├── manifest.ts       # ReviewManifest, FileEntry, RefInfo
│           ├── state.ts          # PersistedState, FileState
│           ├── diff.ts           # FileDiff, Hunk, DiffLine
│           └── config.ts         # ReviConfig
│
├── docs/
│   ├── revi-prd.md               # Product Requirements Document
│   └── implementation-plan.md    # Detailed phase breakdown
│
├── package.json                  # Workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## Key Technical Decisions

1. **Tauri 2** (not Tauri 1) - Newer plugin system, better API
2. **Tree-sitter in Rust** - Fast, accurate syntax highlighting (not JS-based Shiki)
3. **Zustand** - Simple React state management
4. **Working Tree Support** - When uncommitted changes exist, compare HEAD vs working tree
5. **LRU Caching** - 100-entry cache for computed diffs (skipped for working tree)
6. **Session Manifests** - Stored in `.revi/sessions/<id>.json`

---

## Tauri Commands Available

| Command | File | Description |
|---------|------|-------------|
| `get_session_arg` | session.rs | Parse CLI args for session path |
| `load_session` | session.rs | Load manifest from JSON file |
| `create_session_from_repo` | session.rs | Create session from folder picker |
| `save_review_state` | session.rs | Persist review state |
| `load_review_state` | session.rs | Load persisted state |
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

## How to Run

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run desktop in dev mode
cd packages/desktop && pnpm tauri dev

# Run CLI
pnpm revi --base main
```

---

## What's Next

### Phase 4: File Tree Sidebar (3-4 days)
- Keyboard navigation (j/k to move, Enter to open)
- Collapsible directory groups
- Filter by status (Added/Modified/Deleted)
- Filter by viewed state
- Search/filter input

### Phase 5: Diff Rendering (7-10 days)
- Virtualized diff with `@tanstack/react-virtual`
- Split view (side-by-side) and Unified view
- Syntax highlighting from pre-computed spans
- Hunk headers with context
- Line number gutters
- Word-level diff highlighting
- Handle new/deleted/renamed/binary files

### Phase 6: State Management (4-5 days)
- Persist viewed files, scroll positions
- Fuzzy recovery after rebase/amend (content hash matching)
- "Changed since last view" badges

### Phase 7+: See `docs/implementation-plan.md`

---

## Known Issues / Notes

1. **Diff pane is a placeholder** - Shows file info but no actual diff yet (Phase 5)
2. **No keyboard shortcuts yet** - Phase 7
3. **App launcher in CLI** - Just prints instructions, doesn't spawn app
4. **TOML highlighting disabled** - tree-sitter-toml 0.20 incompatible with tree-sitter 0.24
5. **Continuous scroll mode** - Not in current plan (single-file view with j/k navigation). Could be added as Phase 5b or later.

---

## Important Files to Read First

1. `docs/implementation-plan.md` - Full roadmap with task lists
2. `docs/revi-prd.md` - Product requirements and UX specs
3. `packages/desktop/src-tauri/src/commands/git.rs` - Core diff logic
4. `packages/desktop/src-tauri/src/commands/session.rs` - Session creation
5. `packages/desktop/src/App.tsx` - Main React app
6. `packages/desktop/src/stores/session.ts` - Session state management

---

## User Preferences

From `.claude/CLAUDE.md`:
- Do NOT run tests automatically — always ask first
- Do NOT run build/compile commands without approval
- Minimize shell command execution
- Focus on reading and writing code only
- Prefer smaller, targeted file edits over large rewrites

---

## Recommended Next Step

Start **Phase 4: File Tree Sidebar** or **Phase 5: Diff Rendering** based on priority:
- Phase 4 adds keyboard navigation and filtering (smaller scope)
- Phase 5 implements the actual diff viewer (larger scope, core feature)

To continue, read the implementation plan and the current component code, then implement the next phase incrementally.
