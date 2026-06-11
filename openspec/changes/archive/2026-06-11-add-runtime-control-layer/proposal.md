# Change: Add runtime control layer

## Why
Locus already has useful runtime foundations, but desktop Claude and Codex still assemble durable run rules inside large runtime routes. Before Codex app-server migration or Claude route extraction starts, Locus needs an approved cross-runtime control layer for preflight, permission policy, desktop run requests, normalized events, and persisted trace.

This change keeps the product scope narrow: stabilize the outer control layer first, then let Claude and Codex adapters keep runtime-specific internals behind that boundary.

## What Changes
- Add a reusable desktop runtime preflight owner that verifies project, chat, sub-chat, cwd, provider, MCP, attachment, and local-only readiness before provider work starts.
- Add a shared `PermissionPolicy` owner for plan, agent, and guarded run semantics, including the allowed Claude native permission strategy and Codex mapping.
- Add a desktop-capable `DesktopRunRequest`, `DesktopRunResult`, and `RunEvent` contract for Claude and Codex desktop/chat adapters.
- Require routes and transports to remain envelope/input surfaces while durable runtime business rules move into canonical owners.
- Persist sanitized, ordered semantic runtime events for desktop runs so Workbench can show a structured timeline instead of raw payload-only logs.
- Preserve current renderer/tRPC chat APIs during migration, with any temporary dual path carrying an explicit gate, deletion condition, and tests.

## Impact
- Affected specs:
  - `agent-runtime-core`
  - `desktop-agent-jobs`
  - `agent-workbench`
  - `agent-scope-contracts`
  - `provider-diagnostics`
- Affected code after approval:
  - `docs/OWNERSHIP_MAP.md`
  - `src/main/lib/agent-runtime/**`
  - `src/main/lib/desktop-agent-jobs.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/trpc/routers/codex.ts`
  - `src/main/lib/agent-guard/**`
  - `src/main/lib/provider-profiles/**`
  - `src/main/lib/job-store.ts`
  - `src/shared/agent-jobs.ts`
  - `src/renderer/features/agents/**`
  - `tests/desktop-agent-jobs.test.ts`
  - new focused tests for preflight, permission policy, event mapping, redaction, and route-boundary behavior
- Validation:
  - `openspec validate add-runtime-control-layer --strict --no-interactive`
  - `bun run architecture:check`
  - focused Bun tests for preflight, policy mapping, route boundary, redaction, desktop job events, and Workbench timeline data

## Non-Goals
- Do not implement Codex app-server in this change.
- Do not migrate Claude desktop/chat away from `@anthropic-ai/claude-agent-sdk`.
- Do not change renderer chat APIs unless an implementation task proves a compatibility wrapper is impossible.
- Do not add a second desktop chat implementation beside the existing Claude/Codex routes without a migration gate, deletion condition, and tests.
- Do not expose provider secrets, gateway tokens, OAuth tokens, raw headers, or secret-bearing environment values to renderer state, persisted job events, or diagnostics.
