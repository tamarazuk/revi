# Agent Instructions

## Token Efficiency

Minimize token usage at every step. This applies to both main agents and sub-agents.

### Communication
- Be concise. Use bullet points, not paragraphs.
- No preambles, pleasantries, or restating requirements.
- Summarize findings in 2-3 sentences max.
- Only explain "why" when asked or when it prevents a mistake.

### Sub-Agent Usage
Sub-agents count toward usage limits. When delegating:
- Give precise, scoped prompts (not open-ended exploration).
- Request only essential findings returned, not full file contents.
- Prefer single targeted sub-agent calls over multiple broad ones.

### Searches & Reads
- Use `grep` with specific patterns; avoid broad regex.
- Use `glob` for file finding instead of `find` commands.
- When reading files, use `offset`/`limit` if you only need a section.
- Limit search results mentally—if you find what you need in first few results, stop exploring.
- Don't re-read files already in context.

### Edits
- Prefer targeted `Edit` operations over full file rewrites.
- Batch related edits when possible.
- Never repeat unchanged code in explanations.

## Workflow: Feature-Based Phases

Complete one feature end-to-end, then checkpoint with the user.

**Phase 1: Understand** (read-only)
- Explore relevant code paths
- Identify files to modify
- Brief summary to user if scope is unclear

**Phase 2: Implement**
- Make all necessary code changes
- Run lint/type-check for guidance
- Format only files you modified (never project-wide)

**Phase 3: Checkpoint**
- Summarize what was done (2-3 bullets)
- Provide test command for user to run
- Wait for user feedback before next feature

## Command Permissions

### Safe to Run
- File reads, searches, globs
- `lint` / `eslint` / type-checking (for guidance)
- Format **only files you modified**

### Avoid - Ask User to Run
- **Tests**: Provide the specific test command. If absolutely necessary, run only targeted tests and limit output to last 25 lines. Re-run for full output only if failure reason is unclear.
- **Builds**: Never run. User will build and provide feedback.
- **Project-wide formatting**: Never run.

### Escalation
Pause and ask the user when:
- Scope is ambiguous or larger than expected
- You hit an error you can't resolve in 2 attempts
- You need to modify more than 5 files
- Any destructive operation (delete, overwrite config, etc.)

## Project Context

**Revi** — Local-only code review tool (GitHub PR "Files Changed" experience for local repos)

### Stack
- **Monorepo**: pnpm workspaces + Turborepo
- **CLI**: Node.js + TypeScript + Commander.js (`packages/cli/`)
- **Desktop Frontend**: React 18 + Zustand + Vite (`packages/desktop/src/`)
- **Desktop Backend**: Tauri 2 / Rust (`packages/desktop/src-tauri/`)
- **Shared Types**: `packages/shared/`

### Commands
```bash
pnpm dev        # Run Tauri desktop app in dev mode
pnpm lint       # Turbo lint (safe to run)
pnpm typecheck  # Turbo typecheck (safe to run)
pnpm build      # Full build (ask user)
```

### Key Patterns
- **Stores**: Zustand in `src/stores/` — session, sidebar, ui, keyboard, reviewState
- **Tauri commands**: Rust in `src-tauri/src/commands/` — session, git, highlight, window
- **Hooks**: `src/hooks/` — useDiff, useKeyboardManager, useDiffNavigation
- **Tree-sitter**: Full-file highlighting in Rust, mapped to diff lines
- **Icons**: Use `@phosphor-icons/react` with the `Icon` suffix (e.g., `CopyIcon`, `CodeBlockIcon`). The old names without suffix are deprecated.

### Reference Docs
- `docs/HANDOFF.md` — Current state, architecture, what's next
- `docs/implementation-plan.md` — Phase breakdown with tasks
- `docs/revi-prd.md` — Product requirements
