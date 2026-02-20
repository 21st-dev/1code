## Context
1Code currently persists sub-chat messages/sessions and has several targeted caches (git status/diff/file contents, MCP config/tool fetches, mentions search cache). However, context delivery to model calls is still largely prompt-first and conversation-heavy. The desired behavior is an automatic continuity layer that preserves quality while reducing repeated context/token usage.

## Goals
- Make continuity automatic for planning and coding runs.
- Reduce repeated reads and repeated prompt-pack generation.
- Keep model behavior constrained by deterministic app-side structure.
- Improve resilience under long sessions and rate-limit pressure.

## Non-Goals
- Dynamic model switching.
- Replacing model-native reasoning with app-side planning logic.
- Fully autonomous commits to feature branches.

## Architecture Overview
- New main-process `continuity` domain orchestrates pre-run and post-run workflows.
- Integration points:
  - Pre-run: before calling Claude/Codex query/stream in routers.
  - Post-run: after final assistant persistence in routers.
- Data split:
  - Hot cache: in-memory LRU for current app lifecycle.
  - Durable cache/artifacts: SQLite tables in app DB.

## Data Model
- `continuity_file_cache`
  - Key: repo root + file path + blob/content hash
  - Value: raw content metadata + extracted summary (interfaces, invariants, responsibilities)
- `continuity_search_cache`
  - Key: query + commit hash + scope
  - Value: ranked file hits/snippets
- `continuity_pack_cache`
  - Key: task fingerprint + changed files hash + head commit + provider + mode + budget profile
  - Value: rendered pack payload + metadata
- `continuity_state`
  - Per sub-chat/session counters and governor state (last snapshot, pressure metrics)
- `continuity_artifacts`
  - Snapshot outputs (devlog, ADR stub, rejected approach) with provenance and status

## Pack Construction
- Anchor Pack (small, stable): invariants, architecture map, known landmines, ADR/spec pointers.
- Context Pack (budgeted): ranked relevant files/summaries built from signals and caches.
- Delta Pack (minimal): changed files/diff snippets, latest failing test output, recent task-state changes.
- Injection policy:
  - Always include Anchor.
  - Include Context within byte budget.
  - Prefer Delta-only refresh for iterative follow-ups when confidence is high.

## Governor
- Inputs (proxy pressure signals):
  - turns since last snapshot
  - cumulative injected bytes over last K calls
  - number of distinct files pulled into context
  - diff growth and elapsed wall-clock time
- Actions:
  - `ok`
  - `snapshot` (persist structured state/artifacts)
  - `rehydrate` (fork/refresh sub-chat context using packs + structured state)

## Event Triggers for Memory Capture
- Merged diff crosses threshold.
- Test state transition failing -> passing.
- Boundary module touched (cross-module contract risk).
- Plan direction changes (abandoned approach detected).

## Determinism Contract
- Model responsibilities:
  - summarize signals
  - draft memory artifacts
  - extract invariants/contracts
- App responsibilities:
  - trigger timing
  - validation and storage
  - context budgets
  - cache invalidation
  - policy enforcement per mode

## Rate-Limit and Cost Controls
- Batch reads/snippets into single context-build pass per turn.
- Debounce pack rebuild by repo state hash/task fingerprint (not keystroke-level).
- Cap max pack bytes and max new-context bytes per call.
- Add low-token mode with aggressive cached-pack reuse.

## Risks and Mitigations
- Over-capture noise:
  - Mitigation: thresholded meaningful events and dedupe windows.
- Stale cached context:
  - Mitigation: commit/blob hash invalidation + watcher-triggered refresh.
- Rehydrate confusion for users:
  - Mitigation: explicit structured carry-over (plan/tasks/risks) and visible session transition marker.

## Rollout Strategy
- Phase-gated rollout behind a feature flag.
- Start with passive metrics mode (observe pressure and cache hit rates).
- Enable governor actions gradually: snapshot first, then rehydrate.

## Success Metrics
- Pack cache hit rate >= 60% in iterative sessions.
- Average injected bytes per turn reduced >= 30%.
- No regression in task completion outcomes for representative workflows.
- Zero automatic feature-branch commits in default policy.
