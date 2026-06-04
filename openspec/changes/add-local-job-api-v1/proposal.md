# Change: Add Local Job API v1

## Why
Locus now has local job execution through desktop, CLI, daemon, schedules, and a
minimal protocol surface, but downstream local projects do not have a stable
consumer contract. They should not import Locus source, read the Locus SQLite
database, or embed Claude Code/Codex runtime logic.

Local Job API v1 defines the first stable downstream boundary for creating a
local agent run, reading status/events/results, canceling/retrying work,
checking runtime capabilities, and recording artifact ownership without
promoting Locus into a hosted service or a domain-specific app.

## What Changes
- Add a `local-job-api` capability that defines a machine-readable v1 contract
  for downstream consumers.
- Add `locus api` CLI commands for runtime capability listing and job run
  create/status/events/cancel/retry operations.
- Add v1 request, response, event, result, and artifact manifest shapes.
- Persist renderer-safe consumer metadata and artifact metadata on local jobs.
- Expose API-created jobs in the existing Workbench with enough context to
  diagnose the downstream call without adding downstream domain-specific UI.
- Keep provider credentials resolved only inside Locus main-process/runtime
  paths; API requests must not carry provider tokens, OAuth tokens, or raw env.
- Add focused tests, OpenSpec validation, TypeScript checks, build checks, and a
  real local smoke test using a generic package directory.

## Impact
- Affected specs:
  - `local-job-api` (new)
  - `agent-runtime-capabilities` (consumed, not redefined)
  - `headless-agent-jobs` (related active change)
- Affected code:
  - `src/shared/local-job-api.ts`
  - `src/shared/agent-jobs.ts`
  - `src/main/lib/db/schema/index.ts`
  - `src/main/lib/headless/cli-args.ts`
  - `src/main/lib/headless/cli-dispatcher.ts`
  - `src/main/lib/headless/cli-output.ts`
  - `src/main/lib/headless/job-store.ts`
  - `src/main/lib/trpc/routers/agent-jobs.ts`
  - `src/renderer/features/agents/workbench/agent-workbench.tsx`
  - focused tests under `tests/`
- Validation:
  - `openspec validate add-local-job-api-v1 --strict --no-interactive`
  - focused tests for local job API schemas, CLI parsing/dispatch, artifact
    manifest handling, sanitized persistence, runtime capabilities, and
    Workbench display
  - `bun run ts:check`
  - `bun run build`
  - real macOS smoke with a generic local package and fake runner
  - UI screenshot/video evidence if Workbench UI changes are visible

## Non-Goals
- Do not implement a local HTTP server or unauthenticated network listener.
- Do not make `locus acp` a full ACP-compatible server.
- Do not move downstream business state into Locus.
- Do not let Locus write downstream `final/` artifacts without downstream/user
  promotion.
- Do not accept provider API keys, OAuth tokens, raw headers, or raw environment
  values in the API request payload.
- Do not claim Windows packaged acceptance until real Windows smoke evidence is
  collected through the existing headless acceptance boundary.
