# Revi

A local-only code review tool that recreates the GitHub PR "Files Changed" experience for local repositories.

Review your uncommitted changes, compare branches, and navigate diffs with syntax highlighting - all without leaving your local machine.

## Features

- **Uncommitted Changes View** - Review staged, unstaged, and untracked files before committing
- **Branch Comparison** - Compare any refs using merge-base auto-detection
- **File Tree** - Navigate changes grouped by directory with status indicators (A/M/D/R)
- **Diff Stats** - See +/- line counts for each file at a glance
- **Syntax Highlighting** - Tree-sitter powered highlighting for 11+ languages
- **Session Persistence** - Pick up where you left off across app restarts

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8
- **Rust** >= 1.70 (for Tauri)
- **Git**

macOS users also need Xcode Command Line Tools:
```bash
xcode-select --install
```

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/revi.git
cd revi

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Running the App

**Desktop App (recommended):**
```bash
cd packages/desktop
pnpm tauri dev
```

When the app opens, click "Open Repository..." to select a git repository. The app will automatically detect uncommitted changes and display them.

**CLI:**
```bash
# From repo root - creates a review session
pnpm revi                    # Review current directory
pnpm revi --base main        # Compare against main branch
pnpm revi --base HEAD~5      # Compare last 5 commits
pnpm revi /path/to/repo      # Review a different repository
```

## Project Structure

```
revi/
├── packages/
│   ├── cli/          # Node.js CLI for creating review sessions
│   ├── desktop/      # Tauri 2 + React desktop application
│   └── shared/       # Shared TypeScript types
├── docs/
│   ├── revi-prd.md           # Product Requirements Document
│   └── implementation-plan.md # Detailed implementation phases
└── README.md
```

## Development

### Package Scripts

```bash
# Build all packages
pnpm build

# Run desktop in dev mode (hot reload)
cd packages/desktop && pnpm tauri dev

# Build CLI only
pnpm --filter @revi/cli build

# Lint and typecheck
pnpm lint
pnpm typecheck
```

### Testing

```bash
# Run Rust unit tests (from repo root)
cd packages/desktop/src-tauri && cargo test

# Run Rust tests with output
cd packages/desktop/src-tauri && cargo test -- --nocapture
```

Current test coverage:
- **Window dimension sanitization** — validates bounds checking for persisted window state
- **Language detection** — verifies Tree-sitter language detection from file paths

### Architecture

| Component | Technology | Purpose |
|-----------|------------|---------|
| CLI | Node.js, Commander.js | Create review sessions, detect git context |
| Desktop Frontend | React 18, Zustand, Vite | UI rendering, state management |
| Desktop Backend | Tauri 2 (Rust) | Git operations, syntax highlighting |
| Highlighting | Tree-sitter | Fast, accurate syntax highlighting |

### Supported Languages

Tree-sitter highlighting is available for:
- TypeScript/TSX, JavaScript/JSX
- Rust, Python, Go
- JSON, CSS, HTML
- Markdown, YAML, Bash

### Data Storage

```
.revi/                      # Auto-added to .gitignore
├── sessions/               # Review session manifests
│   └── <session-id>.json
└── state/                  # Persisted review state
    └── <base>..<head>.json
```

## Roadmap

See [implementation-plan.md](docs/implementation-plan.md) for the full roadmap.

### Completed
- [x] Monorepo scaffolding with pnpm + Turborepo
- [x] CLI with git detection and session creation
- [x] Desktop shell with three-pane layout
- [x] Folder picker for standalone app launch
- [x] Uncommitted changes detection
- [x] Tree-sitter syntax highlighting backend
- [x] LRU diff caching

### Coming Soon
- [ ] Virtualized diff rendering (split/unified views)
- [ ] Keyboard navigation (j/k, n/p for hunks)
- [ ] Mark files as viewed
- [ ] Open in editor integration
- [ ] File change detection and refresh
- [ ] Comments with AI-friendly export

## CLI Reference

```
revi [path] [options]

Arguments:
  path                 Repository path (default: current directory)

Options:
  --base <ref>         Base ref for comparison
  --head <ref>         Head ref (default: HEAD)
  -h, --help           Show help
  -v, --version        Show version

Subcommands:
  revi sessions list   List all review sessions
  revi sessions clean  Remove old session files
```

## Contributing

This project is under active development. Contributions are welcome!

1. Check the [implementation plan](docs/implementation-plan.md) for current priorities
2. Open an issue to discuss larger changes
3. Submit PRs against the `main` branch

## License

MIT
