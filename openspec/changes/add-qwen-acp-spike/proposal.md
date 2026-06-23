# Change: Qwen Code ACP spike (flag-gated third runtime)

## Why

Locus has hardened the two-runtime spine (Claude Code + Codex) and the Codex ACP
temporary-compat layer is gone, leaving the `DesktopRuntimeAdapterSource` union a
clean two members. The roadmap's next real step is the **Qwen Code ACP spike**:
use a permissively licensed, package-installable runtime to open the hard-coded
two-runtime gates and prove the smallest third-runtime desktop chat path.

Qwen goes first because it isolates "add a runtime" as the only product variable:
the first slice can use Qwen Code's documented local ACP mode
(`qwen --acp`) without resolving Kun coupling, source vendoring, or hosted binary
distribution. Kun and Trae remain later consumers of whatever runtime seams this
spike proves.

This is a **spike**, not a finished runtime: flag-gated, ~2-3 days, success
measured by proving the seams work end to end - not by feature parity.

## What Changes

- Add a third desktop runtime id `qwen-code` (alias `qwen`) **behind a feature
  flag**, while statically splitting desktop/runtime-manifest IDs from
  non-desktop contract IDs. `AGENT_RUNTIME_IDS` may widen for desktop/manifest
  typing, but non-desktop contract surfaces consume a narrower
  `CONTRACT_RUNTIME_IDS = ["claude-code", "codex"]`.
- Open the hard-coded two-runtime gates so a third desktop runtime can register
  only when enabled:
  - factory allowlist `runtimeId !== "claude-code" && runtimeId !== "codex"`
    (`src/main/lib/agent-runtime/desktop-runner.ts:97`)
  - `DesktopRuntimeAdapterSource` union (`desktop-runner.ts:9`)
  - `DesktopPermissionRuntime` extract (`src/main/lib/agent-runtime/permission-policy.ts:9`)
  - the shared runtime manifest/id owner without making non-desktop schemas
    accept `qwen-code`
- Build a local stdio ACP client path (`qwen-acp-client`) that launches
  `qwen --acp` and bridges Agent Client Protocol events. A non-secret,
  allowlisted `LOCUS_QWEN_CODE_AUTH_TYPE` may add Qwen's documented
  `--auth-type=<type>` for headless auth; provider secrets remain in the main
  process environment and are not renderer DTOs. `qwen serve` / HTTP `/acp` /
  remote HTTP+SSE is explicitly deferred to a later transport proposal.
- Add a narrow runtime-neutral desktop chat subscription route for Qwen's first
  entry. The route owns only the tRPC envelope; preflight, permission policy,
  provider binding, event normalization, and redaction remain in their canonical
  owners.
- Add an ACP event mapper: ACP session/stream/permission/tool events ->
  Locus run events + `DesktopRunResult`.
- Publish an **honest** `qwen-code` capability manifest - most capabilities
  `degraded`/`unsupported` for the spike; only what is actually wired is
  `supported`.
- Add a **conservative** Qwen permission-policy tier (fail-closed, approval gate
  required), analogous to the Codex app-server mapping - never "the runtime
  manages it".
- Minimal renderer touches: add Qwen to shared provider/runtime metadata and chat
  create validation, then route Qwen through a new runtime-neutral desktop chat
  transport. **No** broad manifest-iteration refactor - that is a later follow-up,
  gated on what this spike proves.
- Decide the Qwen-first reuse boundary explicitly: this stdio slice does **not**
  build Kun's future remote HTTP/SSE transport. The reusable output is the third
  runtime seam itself - runtime IDs/manifests, the desktop route envelope, ACP
  event/permission mapping patterns, permission policy, and renderer edge
  selection.
- Authentication: headless-friendly **API key / Alibaba Cloud Coding Plan**. Do
  **not** depend on Qwen OAuth free tier (deprecated 2026-04-15). Spike smoke must
  isolate Qwen config/HOME/userData or remain read-only against existing BYO
  status; Locus must not write the user's real `~/.qwen` without explicit
  approval.

## Scope guardrails (Non-Goals)

- No renderer manifest generalization of the ~113 hardcoded claude/codex branches.
- No Kun/Trae work. A Kun-style local daemon remains a later HTTP/SSE transport
  proposal, not a consumer of this stdio client transport.
- No bundling of the `qwen` CLI yet - discover/BYO for the spike.
- No default-on: the flag stays off until the spike's acceptance checks pass.
- No `qwen serve` / HTTP `/acp` / remote HTTP+SSE daemon lifecycle in this slice.

## Impact

- OpenSpec delta: `qwen-code-runtime` (new).
- Related owner/spec surfaces touched by implementation:
  `agent-runtime-core`, `agent-runtime-capabilities`,
  `provider-runtime-bindings`, `agent-protocol-interfaces`, and
  `architecture-ownership`.
- Affected code:
  - `src/main/lib/agent-runtime/desktop-runner.ts` (gates, adapter source)
  - `src/main/lib/agent-runtime/permission-policy.ts` (Qwen tier)
  - `src/shared/agent-runtime-capabilities.ts` (runtime id, manifest)
  - static non-desktop contract runtime split for Local Job API, headless CLI,
    schedules, job store, and `locus acp`
  - new `src/main/lib/agent-runtime/` local ACP client transport + ACP mapper
    modules
  - new `src/main/lib/qwen/` adapter (mirrors `src/main/lib/codex/app-server-adapter.ts`)
  - new runtime-neutral desktop chat subscription envelope in
    `src/main/lib/trpc/routers/agent-runtime.ts` or an equivalently narrow route
  - `src/shared/agent-chat-provider.ts`,
    `src/main/lib/trpc/routers/chats-crud.ts`
  - `src/renderer/features/agents/main/active-chat.tsx`, `new-chat-form.tsx`,
    runtime transport selection, and question/approval state plumbing touched only
    as needed for Qwen
  - feature-flag wiring (shared config/atoms)
