# Change: Add Automatic Continuity + Caching Layer

## Why
Long-running coding sessions repeatedly pay context and file-read costs, increase rate-limit pressure, and rely too heavily on raw conversation history. 1Code already has chat/session persistence, git watchers, and several local caches, but lacks a unified continuity pipeline that automatically injects stable context and incremental deltas.

## What Changes
- Add a deterministic continuity orchestration layer in main process for all model calls.
- Automatically build and inject three packs per run: Anchor Pack, Context Pack, Delta Pack.
- Add multi-layer caching for file summaries, search hits, and rendered context packs.
- Add automatic memory capture on meaningful events (devlog entries, ADR stubs, rejected approach notes).
- Add a governor that monitors pressure signals and triggers snapshot/rehydrate actions.
- Add cost/rate-limit controls: batching, debounce, context budgeting, low-token mode.

## Scope and Boundaries
- In scope: local continuity orchestration, pack generation, cache invalidation, structured snapshot artifacts, chat rehydrate support.
- Out of scope: automatic model switching, external cloud memory service, forced commits to feature branches.

## Safeguards
- Default behavior: auto-write memory artifacts, manual commit only.
- Optional stricter mode: if auto-commit is enabled later, commit only to a dedicated memory branch, never feature branches.

## Impact
- Affected specs: `continuity-caching` (new capability)
- Affected code:
  - `/Users/nkeke/Documents/CascadeProjects/1code/src/main/lib/trpc/routers/claude.ts`
  - `/Users/nkeke/Documents/CascadeProjects/1code/src/main/lib/trpc/routers/codex.ts`
  - `/Users/nkeke/Documents/CascadeProjects/1code/src/main/lib/db/schema/index.ts`
  - `/Users/nkeke/Documents/CascadeProjects/1code/src/main/lib/git/cache/git-cache.ts`
  - `/Users/nkeke/Documents/CascadeProjects/1code/src/main/lib/git/watcher/ipc-bridge.ts`
  - New continuity service modules in `src/main/lib/`
