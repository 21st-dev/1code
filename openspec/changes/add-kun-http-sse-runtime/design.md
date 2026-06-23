## Context

Locus's desktop runtime spine supports Claude Code (Agent SDK) and Codex
(app-server), plus a flag-gated Qwen Code spike over **local stdio ACP**
(`qwen --acp`). The experimental desktop chat route `agentRuntime.chat` is
nominally "runtime-neutral" but implemented Qwen-only: `z.literal("qwen-code")`,
module-level `activeQwenStreams` / `pendingQwenToolApprovals`, and
`shouldEnableQwenCodeRuntime` gating. `DesktopRuntimeAdapterSource` is
`claude-agent-sdk | codex-app-server | qwen-acp-client`; `DesktopPermissionRuntime`
is `claude-code | codex | qwen-code`; non-desktop surfaces are pinned to
`CONTRACT_RUNTIME_IDS = ["claude-code", "codex"]`.

Kun (`~/Documents/GitHub/DeepSeek-GUI/kun`, pkg `kun`, "local HTTP/SSE agent
runtime", PolyForm-NC + commercial license on file) is the rule-of-three second
consumer. It is **not** stdio ACP. `kun serve` starts an HTTP server on
`127.0.0.1`, emits a `KUN_READY {json}` handshake on stdout (host/port/model/
`approvalPolicy`/`sandboxMode`/`insecure`/pid), and exposes bearer-authed REST
`/v1/*` + SSE `/v1/threads/{id}/events`. On restart, Kun reconciles orphaned
turns as failed, so Locus must not claim a mid-turn process restart can safely
continue the current Locus run without a separately proven resume contract. Kun's
defaults are **fail-open**:
`DEFAULT_APPROVAL_POLICY='auto'`, `DEFAULT_SANDBOX_MODE='danger-full-access'`.

## Goals / Non-Goals

**Goals:**
- Generalize `agentRuntime.chat` to dispatch by `runtimeId` with per-runtime
  stream/approval state, so Kun and Qwen share one envelope-only route. Qwen
  behavior byte-for-byte unchanged.
- Add a supervised local HTTP/SSE daemon transport (`kun-http-sse`) and a Kun
  adapter: launch hardening, KUN_READY handshake, REST turn lifecycle, SSE event
  stream, cancel/interrupt, crash handling that fails the active run on child
  exit and only recovers a fresh daemon for later runs.
- Fail-closed permission mapping that overrides Kun's fail-open defaults, routes
  approval-mediated side effects through Locus guard + trace before POSTing the
  decision, and keeps sandbox-blocked side effects out of the approval path.
- Honest mostly-`degraded` `kun` manifest; BYO executable resolution; Locus↔Kun
  token separation. Default builds stay Claude + Codex.

**Non-Goals:**
- Extracting Qwen's stdio ACP transport (Kun does not use it; only the route
  generalizes).
- Bundling / auto-downloading Kun (BYO only; commercial license permits a later
  distribution change).
- Non-desktop Kun (Local Job API / headless / schedules / `locus acp` stay
  `CONTRACT_RUNTIME_IDS`).
- Kun feature parity (memory, skills, attachments, review, steer/fork) beyond what
  a first honest manifest marks `supported`.
- Kun plan mode. v1 marks `planMode` `degraded` instead of treating Kun's native
  `create_plan` output as a Locus-owned plan artifact.
- Kun's host computer-use / Electron mode — Locus launches with
  `ELECTRON_RUN_AS_NODE` semantics as a headless Node runtime, not a GUI child.

## Decisions

- **Route generalization, not a second `kunChat`.** Replace the Qwen-literal
  `agentRuntime.chat` with runtime-id dispatch: input schema accepts any enabled
  experimental runtime; `activeQwenStreams`/`pendingQwenToolApprovals` become
  per-runtime keyed maps (or move into the adapter layer); flag checks become
  "is this runtime enabled". *Alternative:* a parallel `kunChat` route — rejected:
  duplicates envelope/preflight/redaction and re-hardcodes the two-runtime smell
  one level down.
- **New adapter source `kun-http-sse`.** Extend `DesktopRuntimeAdapterSource`;
  register `kun:kun-http-sse` in the factory behind the flag. The adapter still
  satisfies the transport-agnostic `DesktopRuntimeAdapter.run()` contract, so the
  daemon transport lives entirely inside `src/main/lib/kun/`. *Alternative:* reuse
  `headless/acp-stdio` or `qwen-acp-client` — impossible, Kun has no stdio ACP.
- **Supervised daemon lifecycle.** Spawn `kun serve` with `shell:false`, isolated
  `dataDir` under Locus userData, `127.0.0.1`, port `0`/random, and a fresh
  random `runtimeToken` per run passed outside CLI argv (`KUN_RUNTIME_TOKEN` env
  or restricted config). Block on the `KUN_READY` line, then **verify the echoed
  `host` is loopback, `insecure===false`, `approvalPolicy` is an allowed value,
  and `sandboxMode` is the conservative value — refuse to proceed (fail-closed)
  if any drift.** If the child exits after a turn starts, resolve the current
  Locus run as failed/canceled; do not restart-and-continue the active turn. The
  supervisor may start a fresh daemon for a later run within a bounded retry
  budget. SIGTERM on close; cancel → `POST /turns/{id}/interrupt` then close;
  never leave an orphan.
- **Launch hardening overrides Kun's fail-open defaults.** Always pass
  `--approval-policy on-request`, a conservative `--sandbox-mode`
  (`workspace-write` for supported v1 chat/agent runs; never
  `danger-full-access`/`external-sandbox`), and keep `insecure=false`. Reject
  `auto`, `never`, `suggest`, and `untrusted`; these are not user-overridable
  downward in v1. *Why only `on-request`:* per `local-tool-host.ts:277`
  `requiresApproval`, `on-request` and `suggest` both prompt for non-`auto`
  tools, but v1 maps only the `on-request` runtime contract and rejects `suggest`
  to avoid unreviewed semantics. `untrusted` exempts `auto`+allow-listed tools,
  and the allow-list is not wired to `kun serve`/config, so Locus can neither set
  nor verify it. *Residual carve-out:* under any policy, a tool that self-declares
  `policy: auto` skips approval. Kun's native `create_plan` is such a tool
  (`file_change`, `policy: auto`) and writes `.kunsdd/plan/`, so v1 marks
  `planMode` `degraded` rather than accepting an approval-bypassing plan artifact
  path. Hardening is **behavioral, not just a flag value**: Locus verifies
  against the pinned Kun tool registry that no supported `file_change` tool is
  approval-exempt, and separately verifies `command_execution`/shell tools are
  not a supported approval path in v1.
- **Shell is sandbox-blocked in v1, not approval-mediated.** Kun evaluates the
  sandbox block before `requiresApproval`; under `workspace-write`, `file_change`
  tools may reach approval, but `command_execution` tools are blocked unless
  `sandboxMode` is `danger-full-access`. Since Locus never launches Kun with
  `danger-full-access` in v1, shell/command execution is degraded/unsupported and
  should be tested as "not advertised or sandbox-blocked", not as an approval
  request flow.
- **Kun plan mode is degraded in v1.** `--sandbox-mode read-only` blocks Kun's
  native `create_plan` (`policy: auto`, writes `.kunsdd/plan/`, gated by
  `canWritePath` → `sandbox_read_only`), while `workspace-write` would allow an
  approval-bypassing plan write that Locus does not yet own as a plan artifact.
  v1 therefore does not launch supported Kun plan/GUI-plan turns. A later change
  must decide whether Locus consumes Kun's `.kunsdd/plan/` output or replaces it
  with a Locus-owned plan capture path.
- **Permission mapping correlates events to items.** `approval_requested` carries
  only `{approvalId, toolName, status, summary?}`. The adapter joins it to the
  `tool_call` turn item only through a pinned and tested Kun wire invariant:
  `approvalId === appr_${tool_call.callId}` plus matching `toolName`. It then
  reads `toolKind` (`file_change` → workspace write, `tool_call` → generic/MCP)
  to pick the Locus side-effect class. `command_execution` is not expected to
  reach this mapping in v1 because the `workspace-write` sandbox blocks it before
  approval. Decision flows through Locus guard + trace, then `POST
  /v1/approvals/{id}` with allow/deny. Mirror `CodexAppServerPermissionMapping` /
  `QwenPermissionMapping` for the approval-mediated classes.
  **Fail-closed** if the version/invariant is unverified, the tool_call item is
  missing, the mapping is ambiguous, the class is unknown, the guard hook is
  unavailable, or the decision times out — deny by default, trace the reason.
- **Token separation.** `runtimeToken` (Locus→Kun, bearer on `/v1/*`) is a random
  per-run secret never logged/redacted-out and never placed in CLI argv. It is
  distinct from any Kun→Locus provider gateway token (profile-scoped), which Kun
  reads from its isolated config or the Locus profile-scoped `responses` gateway.
  Upstream provider API keys never enter `argv` or renderer payloads. Kun is
  DeepSeek-oriented by default, but its configurable `baseUrl`/`apiKey`/
  `endpointFormat` means provider profiles can be `supported` only after a smoke
  proves `endpointFormat=responses` works against Locus's gateway; otherwise
  provider profiles stay `degraded` in v1.
- **BYO executable, reuse the Qwen CLI status pattern.** Resolve `kun` like
  `qwen/qwen-cli-status.ts`: persisted absolute-path override (`0o600`),
  PATH-discovery excluding cwd/repo dirs (no `./kun` RCE), `execFile --version`
  with `shell:false` + timeout + redaction, spawn-block + passive Settings
  guidance when missing. No bundle/auto-download.
- **Honest manifest, flag-gated everywhere.** `kun` manifest is mostly
  `degraded`/`unsupported`; only wired capabilities `supported`. The flag
  `LOCUS_ENABLE_KUN_RUNTIME` gates manifest exposure, route admission, factory
  admission, permission resolution, chat-provider selection, and the renderer
  option. Off ⇒ identical to today.

## Risks / Trade-offs

- **Kun fail-open defaults (`approval=auto`, `sandbox=danger-full-access`).** →
  Enforce hardened launch flags AND verify the `KUN_READY` echo matches; refuse to
  run on drift. Treat any side effect without a guarded allow as denied.
- **Localhost daemon exposure.** → Bind `127.0.0.1` only; reject non-loopback host
  or `insecure=true` from `KUN_READY`; random port + random per-run `runtimeToken`;
  `/health` is the only unauthed route and carries no secrets.
- **Approval/tool_call ordering race.** → Buffer `approval_requested` until the
  matching `tool_call` item is seen; if unresolved before the decision deadline,
  fail closed.
- **Daemon crash during active turn.** → Resolve the current Locus run as
  failed/canceled; do not claim restart-and-continue semantics. Bounded retry
  applies only when starting a fresh daemon for a later run, with no silent hot
  loop.
- **SSE drift between Kun versions.** → Pin a tested `kun` version in spec notes;
  map unknown `RuntimeEvent` kinds to a single "unsupported event" diagnostic,
  never crash.
- **Route generalization regresses Qwen.** → Acceptance gate: Qwen live behavior
  unchanged, `architecture:check` + full suite green before/after.
- **License.** → BYO only this change; commercial license on file; no bundling /
  managed-download without a separate approved change.

## Migration Plan

Additive and flag-gated; no data migration. The route generalization is
behavior-preserving for Qwen (same envelope, same delegation; only dispatch keying
changes). Rollback = set `LOCUS_ENABLE_KUN_RUNTIME` off (Kun disappears) or revert
the change set; the route generalization can stand alone since it is Qwen-neutral.

## Open Questions

- Which exact `kun` version/commit is the reference for `KUN_READY`, REST, and
  `RuntimeEvent`/turn-item shapes?
- Can Kun's provider config target the Locus profile-scoped `responses` gateway
  by setting `baseUrl=<gatewayEndpoint>`, `apiKey=<scoped gateway token>`, and
  `endpointFormat=responses`? If this is not proven by smoke/test evidence,
  `providerProfiles` stays `degraded` in the first manifest.
- Are `steer` / `fork` / `review` / attachments in scope for the first manifest,
  or explicitly `degraded` until a consumer needs them?
