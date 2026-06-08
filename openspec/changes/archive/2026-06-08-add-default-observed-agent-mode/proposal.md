# Change: Add default observed agent mode

## Why
Normal Agent mode currently resolves to full-access runtime behavior without a
clear product control level. Users can often stop a stream, and some tool
activity is visible, but the default permission policy does not make observation,
risk signaling, or auditability a first-class contract.

Locus should default to a controlled-but-not-blocking mode: agents keep working,
actions are visible, risky actions are highlighted, and the user can interrupt
the run. This is separate from guarded scope contracts and must not be presented
as hard enforcement.

## What Changes
- Add an explicit default `observe` control level to the desktop runtime
  permission policy for normal Agent-mode runs without a scope contract.
- In observed mode, loudly block a very small set of catastrophic or
  immediately irreversible actions before execution when the runtime exposes a
  pre-tool hook, while continuing to allow ordinary actions by default.
- Keep `guarded` as the hard-enforced or contract-and-audit path for runs with a
  user-approved scope contract.
- Define `strict` as a later control level, but do not expose or implement it in
  this change.
- Route Claude and Codex default Agent-mode tool callbacks through observation
  logic when a runtime hook is available; otherwise emit a degraded observation
  diagnostic and use stream-only visibility.
- Reuse the agent-guard owner for tool category, high-risk shell, sensitive
  path, and network-egress classification; do not add a second risk classifier
  in routes or renderer UI.
- Persist sanitized observed permission/tool events so Workbench and chat
  surfaces can show visible action timelines, risk badges, and cancel/stop state.

## Impact
- Affected specs:
  - `agent-runtime-core`
  - `agent-scope-contracts`
  - `agent-workbench`
- Affected code after approval:
  - `src/main/lib/agent-runtime/permission-policy.ts`
  - `src/main/lib/agent-runtime/stream-event-mapper.ts`
  - `src/main/lib/agent-runtime/runtime-events.ts`
  - `src/main/lib/agent-guard/decision.ts` or a guard-owned helper
  - `src/main/lib/claude/agent-sdk-tool-permission.ts`
  - `src/main/lib/codex/acp-permission.ts`
  - `src/main/lib/codex/acp-runtime.ts`
  - `src/renderer/features/agents/lib/runtime-event-state.ts`
  - `src/renderer/features/agents/workbench/agent-workbench.tsx`
  - focused tests for policy mapping, observation events, risk classification,
    degraded Codex hook behavior, and Workbench visibility
- Validation:
  - `openspec validate add-default-observed-agent-mode --strict --no-interactive`
  - `bun run architecture:check`
  - focused Bun tests for permission policy, Claude tool permission, Codex ACP
    permission, runtime event mapping, and Workbench observation UI
  - `bun run ts:check`
  - `bun run build`

## Non-Goals
- Do not finish router slimming or route extraction in this change.
- Do not implement Codex app-server or replace the ACP temporary compatibility
  adapter.
- Do not implement `strict` default-deny or whitelist UI in this change.
- Do not silently change observed mode into hard blocking behavior.
- Do not expose provider secrets, raw environment values, full file contents, or
  unbounded command output in observed events.
