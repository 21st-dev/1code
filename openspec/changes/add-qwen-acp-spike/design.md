## Context

Two-runtime spine is stable: `desktop-runner.ts` exposes a
`DesktopRuntimeAdapterFactory` keyed by `runtimeId:source`, gated by a hard
allowlist (`runtimeId !== "claude-code" && runtimeId !== "codex"`,
`desktop-runner.ts:97`). Runtime ids are fixed in `AGENT_RUNTIME_IDS`
(`agent-runtime-capabilities.ts:1`), but that tuple is consumed beyond desktop
chat by Local Job API, headless CLI, schedules, and `locus acp`. The permission
layer narrows to two runtimes via `DesktopPermissionRuntime`
(`permission-policy.ts:9`).

The renderer does not currently call a single runtime-neutral desktop runner:
Claude rides `IPCChatTransport`, while Codex rides `ACPChatTransport` into
`trpcClient.codex.chat.subscribe`. `DesktopRuntimeAdapterFactory` is also not a
global runtime registry for desktop chat; it is used inside the runtime-specific
paths. A real Qwen spike therefore needs an explicit desktop chat entry, not only
an adapter factory registration.

Qwen Code exposes ACP via `qwen --acp` (per its Zed integration docs) and ships
as Apache-2.0. This spike adds it as a third runtime to discover which of the
above seams genuinely need to generalize.

## Goals / Non-Goals

- Goals: prove `qwen --acp` end-to-end inside Locus - process launch, streaming
  events, permission requests, file edits, cancel, error mapping, MCP config
  passthrough. Open the runtime gates the cleanest possible way. Add a narrow
  runtime-neutral desktop chat subscription route for Qwen's first entry. Keep
  default builds two-runtime across desktop and non-desktop surfaces.
- Non-Goals: feature parity, renderer manifest refactor (A3), CLI bundling,
  Kun/Trae, turning the flag on by default, `qwen serve` / HTTP `/acp` /
  remote HTTP+SSE daemon lifecycle. Expected effort is 2-3 days after the
  onboarding worktree is clean; if Qwen lacks a pre-tool permission primitive,
  the spike stops at a degraded manifest instead of expanding scope.

## Decisions

- **New capability spec, not MODIFIED two-runtime requirements.** The spike is
  flag-gated and additive; default behavior (exactly Claude + Codex) is unchanged.
  A self-contained `qwen-code-runtime` capability is honest and trivially
  archivable/promotable. Existing `agent-runtime-core` requirements stay true.
- **Adapter source = `qwen-acp-client`.** Extends `DesktopRuntimeAdapterSource`
  to a third member. Mirror the Codex adapter shape
  (`src/main/lib/codex/app-server-adapter.ts:326 createCodexAppServerAdapter`) in a
  new `src/main/lib/qwen/` module returning a `DesktopRuntimeAdapter`.
- **Transport: local stdio ACP for this slice.** Launch `qwen --acp`, speak ACP
  over stdio, and translate to Locus run events. Qwen Code `0.19.1` reports
  OpenAI-compatible headless auth through `--auth-type=openai`, so the transport
  may prepend only an allowlisted, non-secret `--auth-type=<type>` from
  `LOCUS_QWEN_CODE_AUTH_TYPE`; API keys still come only from main-process runtime
  environment and are never renderer DTOs. Name the new Qwen-facing module
  `qwen-acp-client` (or equivalent) to avoid confusion with the existing
  `headless/acp-stdio.ts`, where Locus acts as an ACP-like server. This transport
  is not a remote HTTP/SSE abstraction. If Qwen's `qwen serve` `/acp` path becomes
  desirable, that later change must define daemon token/session lifecycle
  separately.
- **Static contract split, not runtime checks everywhere.** `AGENT_RUNTIME_IDS`
  may widen to include `qwen-code` for desktop/manifest typing. Non-desktop
  contract surfaces consume a narrower `CONTRACT_RUNTIME_IDS =
  ["claude-code", "codex"]`, so Local Job API, headless CLI, schedules, job store,
  and `locus acp` cannot accept `qwen-code` at schema/parse time. Future
  non-desktop Qwen support moves `qwen-code` into the contract constant through a
  separate approved change.
- **Qwen-first reuse boundary.** Switching this spike to stdio reduces the
  original Kun reuse claim: Kun's likely local-daemon path still needs a later
  HTTP/SSE transport. Qwen still goes first because it has lower licensing/install
  variance and proves the reusable runtime seams that remain valuable: third
  runtime IDs/manifests, desktop route envelope, ACP event/permission mapping
  patterns, permission policy, trace/redaction, and renderer edge selection.
- **Desktop chat entry = narrow runtime-neutral subscription route.** Add a route
  such as `agentRuntime.chat.subscribe` for the Qwen spike. The route validates
  the envelope and selected enabled runtime, then delegates to desktop preflight,
  permission policy, provider binding, adapter execution, event normalization,
  and redaction owners. Claude and Codex do not migrate in this slice.
- **Renderer uses Qwen-specific transport selection only at the edge.** Add Qwen
  to shared provider/runtime metadata and create-input validation, then route
  Qwen messages through a thin runtime-neutral desktop chat transport that calls
  the new route. Do not add Qwen branches to feature capability logic beyond this
  edge selection.
- **Permission tier is conservative/fail-closed.** New `QwenPermissionMapping`
  modeled on `CodexAppServerPermissionMapping` (`permission-policy.ts:50`):
  approval gate required, `fail-closed` when the hook is unavailable. Qwen's own
  approvals do not substitute for Locus guard/trace.
- **Auth: API key / Alibaba Cloud Coding Plan** (headless-friendly). OAuth free
  tier is deprecated (2026-04-15) and excluded. For Qwen Code `0.19.1`,
  direct ACP probing showed that `OPENAI_API_KEY` alone is not sufficient for a
  fresh HOME; `--auth-type=openai` is required before `session/new` accepts the
  runtime-managed OpenAI-compatible auth path. Spike smoke must isolate Qwen
  config/HOME/userData or remain read-only against existing BYO status; no task
  may write the user's real `~/.qwen` without explicit approval.
- **Feature flag.** A shared flag gates Qwen manifest exposure, desktop route
  admission, adapter factory admission, permission-policy resolution, chat
  provider selection, and the renderer option. Non-desktop contract surfaces stay
  statically Claude Code + Codex in this slice. Off -> identical to today.

## Risks / Trade-offs

- ACP surface drift between Qwen versions -> pin a tested `qwen` version in the
  spike notes; map unknown ACP events to a single "unsupported event" diagnostic
  rather than crashing.
- Opening the known runtime tuple could make non-desktop schemas accept Qwen too
  early -> keep those consumers on `CONTRACT_RUNTIME_IDS` and add a focused guard
  test that the contract constant stays narrower than the known runtime set.
- Permission mapping too permissive -> default to fail-closed; treat any
  unmapped Qwen tool as `unknown-tool` side effect.
- Desktop chat route duplicates business logic -> route remains envelope-only.
  Avoid a broad architecture guard in this spike; add focused route tests now and
  promote to an architecture guard only after a second consumer needs the route.
- Smoke mutates real Qwen config -> tests/smoke use isolated HOME/Qwen config and
  isolated Locus userData, or they perform read-only BYO status checks only.

## Migration Plan

Additive and flag-gated; no migration. Rollback = remove the change set or leave
the flag off. If the spike fails its acceptance checks, the new capability spec is
archived as "explored, not adopted" and the gates revert.

## Open Questions

- Minimum MCP config passthrough Qwen accepts vs. Locus's project MCP model.
