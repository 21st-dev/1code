# Change: Refactor runtime core execution boundary

## Why
Workbench desktop chat and headless Local Job API jobs both claim to use the
runtime core, but they currently meet the core at different depths. Desktop
Codex/Claude paths use rich `DesktopRunRequest`, permission policy, provider
binding, MCP readiness, attachments, sessions, and `RunEvent` trace mapping,
while headless jobs still run thin batch requests through `codex exec` or
`claude -p` and append process-shaped job events directly.

This split blocks Locus from becoming a reliable local agent hub for downstream
products. A downstream product can create local jobs today, but it does not get
the same execution semantics, event vocabulary, permission model, or adapter
selection that Workbench uses.

## What Changes
- Add a shared runtime execution boundary with a common run request base,
  explicit surface-specific extensions, and a normalized run observer.
- Replace one-adapter-per-runtime selection with selector-owned adapter choice
  based on runtime, source/surface, execution profile, requested capabilities,
  and permission policy.
- Bring headless jobs into the canonical `RunEvent`/redaction/persistence path
  while preserving the existing Local Job API v1 event envelope.
- Add a non-desktop permission policy mode for headless/API jobs, including
  fail-closed behavior when a run needs interactive approval but no user
  interaction channel exists.
- Keep `codex exec` and `claude -p` as batch adapters; add app-server job usage
  only behind explicit selector and policy gates.
- Defer ACP changes and Local Job API v2 rich interaction callbacks to separate
  proposals.

## Impact
- Affected specs: `agent-runtime-core`, `headless-agent-jobs`,
  `local-job-api`, `architecture-ownership`
- Reviewed adjacent specs with no delta in this change:
  `runtime-security-baseline`, `agent-scope-contracts`
- Affected code:
  - `src/main/lib/agent-runtime/*`
  - `src/main/lib/headless/agent-runtime.ts`
  - `src/main/lib/headless/agent-runtime-contract.ts`
  - `src/main/lib/headless/job-runner.ts`
  - `src/main/lib/headless/process-runner.ts`
  - `src/main/lib/headless/adapters/*`
  - `src/main/lib/trpc/routers/codex.ts`
  - `src/main/lib/codex/app-server-adapter.ts`
  - `src/main/lib/claude/agent-sdk-*`
  - `src/shared/local-job-api.ts`
  - tests under `tests/*runtime*`, `tests/*local-job-api*`, and headless job tests
