# Change: Add architecture ownership guards

## Why

Locus has shared runtime capability, guard, provider, and chat-event behavior,
but the repository does not yet have a project-level ownership map or automated
guardrail to prevent old/new duplicate paths during refactors.

## What Changes

- Add a canonical ownership map for runtime, provider, guard, MCP, route, and
  renderer runtime-event state boundaries.
- Add project instructions that reject duplicate old/new business paths unless a
  bounded migration plan is present.
- Add an architecture guard script that catches high-risk duplicate ownership
  patterns before refactors can drift.
- Consolidate duplicated renderer AskUserQuestion and guarded-run event state
  handling into a single shared owner.

## Impact

- Affected specs: architecture-ownership
- Affected docs: `AGENTS.md`, `docs/OWNERSHIP_MAP.md`
- Affected code: `scripts/check-architecture-guards.mjs`, `package.json`,
  `src/renderer/features/agents/lib/runtime-event-state.ts`,
  `src/renderer/features/agents/lib/ipc-chat-transport.ts`,
  `src/renderer/features/agents/lib/acp-chat-transport.ts`
