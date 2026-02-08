# Revi

Local-only code review tool that recreates the GitHub PR **Files Changed** experience for local repositories, branches, and worktrees.

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Rust (for Tauri desktop app)

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development mode
pnpm dev
```

### Project Structure

```
revi/
├── packages/
│   ├── cli/          # Node.js CLI (`revi` command)
│   ├── desktop/      # Tauri + React desktop app
│   └── shared/       # Shared TypeScript types
├── docs/             # Documentation
└── turbo.json        # Turborepo configuration
```

### Package Commands

```bash
# CLI package
pnpm cli build       # Build CLI
pnpm cli dev         # Watch mode
pnpm cli start       # Run CLI

# Desktop package
pnpm desktop dev            # Vite dev server
pnpm desktop tauri:dev      # Full Tauri dev mode
pnpm desktop tauri:build    # Production build
```

## Usage

```bash
# Review current directory
revi .

# Review specific repo
revi ~/code/my-project

# Compare against specific base
revi --base main

# Compare specific refs
revi --base origin/main --head feature/branch
```

## Documentation

- [PRD](./docs/revi-prd.md) - Product Requirements Document
- [Implementation Plan](./docs/implementation-plan.md) - Development phases and tasks
