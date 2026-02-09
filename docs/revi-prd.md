# PRD: Revi

## 1. Overview

**Revi** is a local-only code review tool that recreates the GitHub Pull Request **Files changed** experience for local repositories, branches, and worktrees — without pushing code or opening a PR.

Revi is intentionally review-first. It puts developers into "PR review brain" locally, where issues are easier to spot than in editors or raw diffs. Whether you're reviewing your own work across multiple branches and worktrees, or auditing what an AI coding agent has committed, Revi gives you a single, familiar surface to see everything before you push.

**Primary surfaces:**
- **CLI** (`revi`): Launches and configures reviews
- **Desktop app**: Performs the review

---

## 2. Problem Statement

Developers routinely catch more issues in GitHub's PR UI than in their editor or via `git diff`, but:

- Pushing code just to review it is slow, noisy, and triggers resource-intensive CI pipelines
- Work-in-progress branches and worktrees are awkward to review
- Existing worktree-aware tools offer partial features — no single tool combines a PR-quality diff UI with worktree and branch support
- AI coding agents (Claude, Codex, etc.) generate commits across branches and worktrees with no unified review surface
- GitHub Desktop has good commit navigation but a weaker diff experience
- `git diff` in the terminal lacks the spatial and visual cues that make PR review effective

**No local tool currently combines:**
- GitHub's PR-quality Files changed UX
- Commit-aware navigation
- Cross-worktree visibility
- Local-only speed and privacy
- A feedback loop for directing agents or noting fixes

---

## 3. Goals

### Primary Goals
- Replicate GitHub's **Files changed** review experience locally
- Provide a single review surface across branches, commits, and worktrees
- Separate the act of reviewing from the act of editing
- Reduce "oops" commits, unnecessary pushes, and wasted CI runs
- Support reviewing both self-authored and AI-agent-authored code

### Non-Goals (v1)
- Syncing comments back to GitHub
- Collaborative or networked review
- CI or automated checks
- Replacing your editor or Git GUI

---

## 4. Target User

Experienced developers who:
- Use GitHub PRs heavily and trust that review UX
- Work across multiple branches or worktrees
- Use AI coding agents and need to audit their output
- Prefer reviewing code separately from editing
- Want to avoid unnecessary pushes and CI runs

---

## 5. CLI Component (`revi`)

### Core Usage

```bash
revi .
revi ~/code/my-repo
revi --base main
revi --base origin/main --head HEAD
revi --worktree
revi --commits
```

### Responsibilities
- Detect repository context (repo root, current branch, remotes)
- Resolve base and head refs
- Detect and enumerate worktrees
- Produce a structured review manifest
- Launch the desktop app or connect to an already-running instance

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--base <ref>` | Base ref for comparison | Auto-detected merge base |
| `--head <ref>` | Head ref for comparison | `HEAD` |
| `--worktree` | Include worktree context | Auto-detect |
| `--commits` | Enable commit-level navigation | Off |
| `--open` | Open in running instance if available | On |

### CLI → App Data Contract

The CLI produces a **review manifest** (JSON) containing:

```json
{
  "version": 1,
  "repoRoot": "/absolute/path/to/repo",
  "base": {
    "ref": "main",
    "sha": "abc123"
  },
  "head": {
    "ref": "feature/thing",
    "sha": "def456"
  },
  "worktree": {
    "path": "/absolute/path/to/worktree",
    "branch": "feature/thing"
  },
  "files": [
    {
      "path": "src/utils/parse.ts",
      "status": "modified",
      "additions": 12,
      "deletions": 3,
      "renamed_from": null,
      "binary": false
    }
  ]
}
```

**The manifest lists changed files and metadata only.** Individual file diffs are fetched lazily by the desktop app on demand. This ensures large changesets don't block launch.

### Communication Model

- CLI writes the manifest to `.revi/sessions/<session-id>.json`
- Desktop app watches the sessions directory or accepts IPC via a local Unix socket / named pipe
- If the app is already running, the CLI signals it to load the new session
- If the app is not running, the CLI launches it with the session path as an argument
- Multiple review sessions can coexist (tabbed or switchable in the app)

---

## 6. Desktop App: Core Review Experience

### Layout (GitHub-like)

#### Left Sidebar — File Tree
- Tree view of changed files, grouped by directory
- File status indicators: added, modified, deleted, renamed
- **Diff statistics per file**: `+12 −3` with green/red proportion bar
- Viewed / unviewed state (checkbox)
- Collapsible directories
- Hideable sidebar (toggle or keyboard shortcut)
- File filtering:
  - By file extension
  - By change type (added / modified / deleted / renamed)
  - By viewed state
- Keyboard navigation (`j`/`k` to move, `Enter` to select)

#### Main Diff Pane
- GitHub-style diff rendering
- Syntax highlighting (language-aware)
- Inline additions (green) and deletions (red)
- Hunk headers with context
- Line numbers (both sides in split, single in unified)
- Scroll position retention when switching between files

#### Top Bar
- Active session info: base..head, branch name, repo path
- Commit scope selector (when `--commits` is active)
- Split / Unified toggle
- Review progress: `14 / 23 files viewed`

---

## 7. Diff Viewing Modes

### Split View
- Side-by-side comparison
- Synchronized scrolling

### Unified View
- Single-column interleaved diff

### Key Behavior: New Files Take Full Width in Split View
New files (additions with no base counterpart) render at full pane width. No empty left column. This is intentional, non-configurable, and improves readability.

### Whitespace Toggle
- Toggle to show/hide whitespace-only changes at the hunk level
- Powered by `git diff -w` under the hood

---

## 8. Keyboard-First Navigation

Keyboard shortcuts are a first-class design principle, not an afterthought. Target audience is power users.

### Default Keybindings

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous file in sidebar |
| `Enter` | Open selected file |
| `n` / `p` | Next / previous hunk within file |
| `v` | Toggle file as viewed |
| `[` / `]` | Collapse / expand current file or hunk |
| `s` | Toggle split / unified view |
| `b` | Toggle sidebar |
| `?` | Show keyboard shortcut overlay |
| `Cmd+Shift+C` | Copy current file path + line number |
| `Cmd+Shift+O` | Open current file + line in editor |
| `Esc` | Close overlay / deselect |

Keybindings should be user-configurable via `.revi/config.json`.

---

## 9. File Interaction Features

### Viewed State
- Mark files as viewed / unviewed (checkbox + `v` key)
- Visual distinction in sidebar (dimmed or checkmark)
- Progress tracked in top bar

### Collapse Behavior
- Collapse individual files in the diff pane
- Collapse individual hunks within a file
- "Collapse all" / "Expand all" controls

### Open in Editor
- Configurable editor command (e.g., `code -g`, `cursor`, `nvim +`)
- Triggered from any file or specific line
- Set via `.revi/config.json`:

```json
{
  "editor": "code -g {file}:{line}"
}
```

### Copy Context
- Copy file path to clipboard
- Copy file path + line number
- Copy hunk as text

---

## 10. State Persistence

### Storage Location
All state is stored in `.revi/` at the repository root.

```text
.revi/
├── config.json          # User preferences (editor, keybindings)
├── sessions/
│   └── <session-id>.json  # Review manifests
└── state/
    └── <base-sha>..<head-sha>.json  # Review state
```

`.revi/` should be added to `.gitignore` by default. The CLI can offer to do this on first run.

### State Schema

Review state uses a resilience-focused schema that supports fuzzy recovery when commits are amended or rebased:

```json
{
  "version": 1,
  "sessionId": "abc-123-xyz",
  "baseSha": "def456",
  "headSha": "ghi789",
  "files": {
    "src/utils/parser.ts": {
      "viewed": true,
      "lastViewedSha": "ghi789",
      "contentHash": "sha256-hash-of-diff-hunks",
      "diffStats": { "additions": 12, "deletions": 3 },
      "collapseState": {
        "file": false,
        "hunks": [0, 2]
      },
      "scrollPosition": 450
    }
  },
  "ui": {
    "mode": "split",
    "sidebarWidth": 280,
    "sidebarVisible": true
  }
}
```

| Field | Purpose |
|-------|---------|
| `contentHash` | SHA-256 hash of the file's diff hunks, enabling fuzzy state recovery |
| `lastViewedSha` | The head SHA when this file was last marked as viewed |
| `diffStats` | Cached additions/deletions for detecting significant changes |
| `collapseState.hunks` | Array of hunk indices that are collapsed |

### Invalidation
- State is keyed by `base-sha..head-sha`
- If either ref moves (rebase, amend, new commit), the old state becomes stale
- Stale state triggers a **"Review outdated — refresh?"** indicator in the UI
- User can choose to refresh (recompute diff, preserve viewed state where file paths still match) or dismiss

---

## 11. Change Detection & Refresh

Since this is a local tool, the underlying code may change while a review is open.

### 11.1 Fuzzy State Recovery

Revi prioritizes the user's review progress over strict SHA matching. If a user amends a commit or rebases, Revi will attempt to preserve the **Viewed** state of a file if the resulting diff hunks for that specific file remain identical. This is achieved by comparing the `contentHash` of each file's diff rather than relying solely on the head SHA.

When a stale state is detected (current `headSha` differs from the stored `headSha`), Revi performs tiered recovery:

| Scenario | Action |
|----------|--------|
| SHA matches exactly | Load state as-is |
| Path exists + `contentHash` matches | Keep file marked as **Viewed** |
| Path exists + `contentHash` differs | Mark as **Unviewed**, show "Changed since last view" badge |
| Path deleted or renamed | Discard state entry for that file |

When recovering with a hash mismatch, the UI displays the delta: "Diff changed: was +12/−3, now +15/−3" using the stored `diffStats`.

### Watched Events
- File saves in the working tree
- New commits on the head branch
- Rebase or amend on the head branch

### Behavior
- **File watcher** (fs events) monitors the repo
- On detected change: non-intrusive banner — **"Changes detected — Refresh?"**
- **No auto-refresh** — this would lose scroll position, collapse state, and mental context
- On manual refresh:
  - Diff is recomputed
  - Viewed state is preserved for files whose paths haven't changed
  - Changed files are flagged as "updated since last viewed"

---

## 12. Commit-Aware Review (v1.5)

### Motivation
GitHub Desktop excels at commit navigation. GitHub PR Files excels at aggregate diffs. Revi combines both: PR-style diffing with optional commit-level scoping.

### Review Scopes
- **All changes** (default) — full diff between base and head
- **Single commit** — diff for one commit only
- **Commit range** — diff across a contiguous range of commits

### Behavior
- File list filters to show only files changed in the selected scope
- Diff UI remains PR-style (not raw `git show` format)
- Viewed state is tracked per scope

### UI
- Top-bar commit selector (dropdown or horizontal list)
- Keyboard-friendly: `←` / `→` to step through commits
- Clear visual indicator of active scope (e.g., "Showing: `abc123` — Fix null check")
- "Show all changes" button to return to aggregate view

---

## 13. Git Context & Navigation

### Branch Support
- Review against local or remote branches
- Default base: auto-detected merge base with `main` or `master`
- Switch base or head without restarting the app — recomputes diff in place

### Worktree Support
- CLI auto-detects if the current directory is a worktree
- Default base for a worktree: the branch the worktree was created from
- Review within a single worktree (worktree changes vs. its base)
- Worktree indicator in the top bar showing the active worktree path
- Future: cross-worktree review (worktree A vs. worktree B)

---

## 14. Noise Reduction

### Glob-Based File Exclusion
Configurable in `.revi/config.json`:

```json
{
  "exclude": [
    "package-lock.json",
    "yarn.lock",
    "*.generated.ts",
    "dist/**"
  ]
}
```

Excluded files are hidden from the file tree by default with a **"Show N hidden files"** toggle.

### Whitespace-Only Changes
- Toggle at the top bar to hide/show whitespace-only hunks
- Uses `git diff -w` under the hood

### Future (v2+)
- AST-aware diffing to detect semantic vs. cosmetic changes
- Language-specific noise filters

---

## 15. Review Summary

When all files are marked as viewed (or on demand), show a summary panel:

- Total files reviewed
- Additions / deletions aggregate
- Time spent in review (passive timer)
- List of files still unviewed
- Option to copy summary as markdown (useful for PR descriptions)

---

## 16. Danger Zone Highlighting (v1.5+)

Subtle visual indicators for files that may warrant extra scrutiny:

- **High-churn files** — files with frequent recent commits (based on `git log`)
- **Large diffs** — files with an unusually high number of changes
- **Sensitive paths** — user-configurable globs (e.g., `**/auth/**`, `**/migrations/**`)

Displayed as a subtle background tint or icon in the sidebar. Non-blocking, informational only.

---

## 17. MVP Comments & AI Export (v1.75)

### Purpose
A lightweight comment system for capturing review feedback with a focus on AI-assisted workflows. Comments are local-only, stored in `.revi/state/`, and can be exported as markdown for use with AI coding agents.

This is an intentionally minimal implementation — no inline rendering, no resolve/unresolve states. Section 18 (Local Comments v2) extends this with richer UX.

### UX
- Click a line number gutter (or press `c`) to add a comment
- Comment input appears as a small popover near the line
- Comments are stored but not rendered inline (keeps diff view clean)
- Sidebar shows a **"Copy Comments for AI"** button
- Clicking the button immediately copies all comments to clipboard as formatted markdown

### Export Format

```markdown
## Review Feedback

### src/utils/parser.ts
- Line 45: This null check is unsafe in async paths. Fix defensively.
- Line 89: Consider using a Map instead of object here.

### src/components/Button.tsx
- Line 12: Rename `onClick` prop to `onPress` for consistency.
```

### Storage

Comments extend the existing review state schema in `.revi/state/`:

```json
{
  "comments": [
    {
      "id": "abc123",
      "filePath": "src/utils/parser.ts",
      "lineNumber": 45,
      "content": "This null check is unsafe in async paths. Fix defensively.",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `c` | Add comment at current line |
| `Cmd+Shift+E` | Copy all comments as AI instructions |

### Line Number Drift

When code changes after adding a comment (e.g., after a refresh following new commits), line numbers may no longer match the original context.

**v1.75 approach (simple):**
- Keep comment attached to stored line number
- Show a warning badge on the comment if the line content has changed significantly
- User can manually update or delete stale comments

**Future (v2+):** Content anchoring — store surrounding context and attempt to find the new location automatically.

---

## 18. Local Comments (v2)

### Purpose
Leave local-only comments attached to specific lines for:
- Personal notes and questions
- TODOs and deferred fixes
- Feedback to direct at an AI agent

Comments are stored in `.revi/state/` and **never sync to GitHub**.

### UX
- Click a line number or gutter to add a comment
- Comments render inline, below the relevant line (GitHub-style)
- Comments can be resolved/unresolved
- Filter file tree to show only files with open comments

---

## 19. Agent-Directed Comments (v2+)

### Concept
Comments may be marked as **actionable** and dispatched to an AI agent (e.g., Claude, Codex).

### Example Comment

```text
This null check is unsafe in async paths. Fix defensively.

@claude
```

### Flow
1. Add a comment on a specific line or hunk
2. Mark as actionable and tag an agent
3. Revi packages context: file path, line range, surrounding code, comment text
4. Agent proposes or applies a fix
5. Revi detects the change and refreshes the diff
6. Comment status updates: pending → applied → reviewed

### Guardrails
- Explicit user action required — no background agent runs
- Clear visual separation between review mode and fix mode
- Agent output always comes back through the normal diff/review flow
- User must review and approve any agent-applied changes

---

## 20. Architecture

### Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| CLI | Node.js (TypeScript) | Shared types with desktop app, fast to build |
| Desktop app | Tauri + React | Lighter than Electron, Rust backend for fast git/fs ops |
| Git operations | `simple-git` (CLI), Tauri `Command` API shelling to native git (desktop) | Native git avoids libgit2 edge cases |
| State storage | JSON files in `.revi/` | Simple, inspectable, human-readable |
| File watching | Tauri fs-watch or `chokidar` | Non-polling, event-driven |
| Syntax highlighting | Tree-sitter (Rust) | Near-instant incremental parsing; handles large files without blocking the UI thread |
| Diff rendering | Custom virtualized React component | Required for 1000+ line diffs; consumes Tree-sitter token spans |
| State hashing | Rust (Tauri backend) | Fast SHA-256 hashing of diff hunks for fuzzy state recovery |

### Why Tauri Over Electron
- Significantly smaller binary size
- Rust backend provides native filesystem performance — critical for large diffs
- Lower memory footprint
- Adequate webview for a diff-rendering UI

### Diff Computation
- **CLI computes the manifest** (file list + metadata) — lightweight, fast
- **Desktop app fetches diffs lazily** — only when a file is opened
- Diffs are computed via `git diff <base>..<head> -- <filepath>`
- Computed diffs are cached in memory for the session lifetime
- Cache is invalidated on refresh

---

## 21. Configuration

All configuration lives in `.revi/config.json`:

```json
{
  "editor": "code -g {file}:{line}",
  "defaultBase": "main",
  "defaultDiffMode": "split",
  "exclude": [
    "package-lock.json",
    "yarn.lock",
    "*.generated.ts",
    "dist/**"
  ],
  "dangerZone": [
    "**/auth/**",
    "**/migrations/**"
  ],
  "keybindings": {}
}
```

On first run, the CLI scaffolds `.revi/` and offers to add it to `.gitignore`.

---

## 22. Success Metrics

- Fewer fixup commits before PRs
- Reduced draft PRs and "WIP" pushes
- Faster pre-PR review cycles
- Fewer CI runs triggered by premature pushes
- Subjective improvement in catching issues before push
- Successful review of AI-agent output without leaving the local environment

---

## 23. Scope Phasing

### MVP
- CLI: repo detection, base/head resolution, manifest generation, app launch
- Desktop: PR-style Files changed view
- Split and unified diff modes
- New-file full-width behavior in split view
- Syntax highlighting
- Diff statistics per file in sidebar
- Viewed / unviewed state
- File and hunk collapsing
- Keyboard-first navigation
- Branch and worktree support (single worktree)
- State persistence in `.revi/`
- Change detection with manual refresh
- Open in editor
- Glob-based file exclusion
- Whitespace toggle
- Copy file path / line number

### v1.5
- Commit-level filtering and navigation
- Commit range selection
- Danger zone highlighting
- Review summary panel

### v1.75
- MVP line-level comments (stored locally, not rendered inline)
- "Copy Comments for AI" button in sidebar
- One-click export of all comments as markdown for AI agents

### v2
- Full local comments (inline rendering, resolve/unresolve states)
- Comment filtering in file tree
- User-configurable review profiles

### v2.5+
- Agent-directed comments (@claude, @codex)
- Agent context packaging and dispatch
- Agent change review flow
- Cross-worktree review
- TUI mode (`--no-gui`)

---

## 24. Positioning

**Revi** lets you review your code locally using the same mental model as a GitHub PR — without pushing anything.

Whether it's your own work across branches and worktrees or code generated by AI agents, Revi gives you a single, familiar review surface. See everything. Catch issues before they hit CI. Push when you're ready.
