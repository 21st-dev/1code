# Change: Kun BYO local HTTP/SSE runtime (flag-gated fourth runtime)

## Why

The Qwen ACP spike proved the third-runtime *shape* (runtime ids/manifest,
permission tier, renderer edge) but over a **local stdio ACP** transport that Kun
cannot reuse: Kun ships as a **local HTTP/SSE agent runtime** (`kun serve`,
handshake `KUN_READY`, REST `/v1/...` + SSE `/v1/threads/{id}/events`). Adding Kun
is the roadmap's designated "second consumer" that forces the desktop chat route
to become genuinely runtime-neutral and introduces Locus's first **supervised
local-daemon transport** — the wire Qwen explicitly deferred.

Kun's source is PolyForm Noncommercial; the user has confirmed a separate
**written commercial license** exists for product integration. We still ship
**BYO executable** first — chosen for update ergonomics (Kun upstream updates flow
without re-packaging Locus) and to keep this change's scope to the runtime seam,
not distribution. Any future bundling / managed-download change must record its
own license evidence path in that future proposal.

## What Changes

- Add a fourth desktop runtime id `kun` to `EXPERIMENTAL_RUNTIME_IDS`, **behind a
  feature flag** (`LOCUS_ENABLE_KUN_RUNTIME`, default off). `CONTRACT_RUNTIME_IDS`
  stays `["claude-code", "codex"]` so non-desktop surfaces still reject Kun.
- **Generalize the experimental desktop chat route** `agentRuntime.chat` from
  Qwen-only (`z.literal("qwen-code")`, `activeQwenStreams`,
  `pendingQwenToolApprovals`, `shouldEnableQwenCodeRuntime`) to **runtime-id
  dispatch** with per-runtime active-stream / pending-approval state. Qwen
  behavior unchanged. This is the rule-of-three generalization the Qwen spike
  deferred. **Only the route is neutralized — Qwen's stdio transport is NOT
  extracted** (Kun does not use it).
- Add a new desktop adapter source `kun-http-sse` and a `src/main/lib/kun/`
  adapter that **supervises `kun serve`**: bind `127.0.0.1`, random port, random
  per-run `runtimeToken`, parse the `KUN_READY {json}` handshake, fail the
  current Locus run on unexpected child exit, optionally start a fresh daemon only
  for later runs within a bounded retry budget, and SIGTERM graceful shutdown.
- Add a **REST + SSE transport**: `POST /v1/threads`, `POST
  /v1/threads/{id}/turns`, `POST .../turns/{id}/interrupt`, SSE `GET
  /v1/threads/{id}/events`, `POST /v1/approvals/{id}`; bearer `runtimeToken` on
  all `/v1/*`.
- **Fail-closed permission tier** (`KunPermissionMapping`). Kun's own defaults are
  fail-open — `approvalPolicy=auto` AND `sandboxMode=danger-full-access` — so
  Locus MUST launch with `--approval-policy on-request`, a conservative
  `--sandbox-mode workspace-write` for supported v1 chat/agent runs, and
  `insecure=false`; `auto`,
  `never`, `suggest`, and `untrusted` are rejected. For v1, Locus pins the
  reference Kun version, verifies that no supported `file_change` tool is
  approval-exempt, verifies that `command_execution`/shell tools are
  sandbox-blocked under `workspace-write` (not routed through Locus approval), and
  verifies the wire invariant
  `approval_requested.approvalId === appr_${tool_call.callId}` before deriving the
  matching `tool_call` item by derived `callId` + `toolName`; approval-mediated
  file edits are classified from the item's `toolKind`, routed through Locus
  guard + trace, and **POSTed to `/v1/approvals/{id}`**; any
  unmapped/unbridged/ambiguous path fails closed.
- Publish an **honest** `kun` capability manifest — mostly `degraded`/
  `unsupported`; only wired capabilities `supported`. `planMode` is `degraded` in
  v1 because Kun's native `create_plan` is `policy:auto`, writes `.kunsdd/plan/`,
  and cannot be gated by Locus approval; Locus plan artifact ownership is deferred
  to a later change.
- **Token separation**: Locus→Kun `runtimeToken` (transport auth) is distinct from
  any Kun→upstream provider credential. The local bearer `runtimeToken` MUST NOT
  enter CLI argv; pass it through `KUN_RUNTIME_TOKEN` env. Upstream provider API
  keys never appear in `argv` or the renderer. In v1, Kun reads them from an
  explicit user-selected BYO config file; Locus passes only `--config <path>` and
  does not read or render provider credential values. Locus provider-profile
  gateway binding remains a separate proof.
- `providerProfiles` remains `degraded` unless this change proves Kun can run
  against the Locus profile-scoped `responses` gateway by setting
  `baseUrl=<gatewayEndpoint>`, `apiKey=<scoped gateway token>`, and
  `endpointFormat=responses`; once that smoke/test evidence exists, the first
  manifest may mark provider profiles `supported`.
- BYO Kun executable and config path resolution + passive setup guidance,
  mirroring the shipped `qwen-cli-status` pattern (absolute-path override,
  cwd/PATH-shadow exclusion, no shell, `--version` probe with `help` fallback).
  **No bundling / auto-download in this change.**
- Minimal renderer edge: Kun runtime/provider metadata, a flag-gated Kun option in
  new-chat, and Kun routed through the (now shared) experimental desktop chat
  transport.

## Capabilities

### New Capabilities
- `kun-runtime`: Kun as a flag-gated BYO desktop runtime — supervised `kun serve`
  lifecycle and hardened launch flags, the `kun-http-sse` REST+SSE transport,
  fail-closed approval/permission mapping, honest manifest, BYO executable
  resolution, and Locus↔Kun token separation.

### Modified Capabilities
- `agent-runtime-core`: the experimental desktop chat route (Runtime Route
  Boundary) is generalized from a single hard-coded experimental runtime to
  runtime-id dispatch with per-runtime stream/approval state, so multiple
  flag-gated experimental runtimes share one envelope-only route.
- `qwen-code-runtime`: the "Runtime-Neutral Desktop Chat Entry" requirement is
  updated to consume the shared runtime-dispatch route instead of owning a
  Qwen-literal route. No change to Qwen runtime behavior.

## Impact

- OpenSpec delta: new `kun-runtime`; modified `agent-runtime-core`,
  `qwen-code-runtime`.
- Affected code:
  - `src/shared/agent-runtime-capabilities.ts` (runtime id `kun` in
    `EXPERIMENTAL_RUNTIME_IDS`, manifest, alias/resolver)
  - `src/main/lib/agent-runtime/desktop-runner.ts` (`DesktopRuntimeAdapterSource
    += "kun-http-sse"`, factory admit), `permission-policy.ts`
    (`DesktopPermissionRuntime += "kun"`, `KunPermissionMapping`)
  - `src/main/lib/trpc/routers/agent-runtime.ts` (route runtime-dispatch
    generalization; per-runtime active-stream/pending-approval maps)
  - new `src/main/lib/kun/` (supervised serve launcher, HTTP/SSE transport, event
    mapper, adapter, BYO `kun` CLI status owner)
  - `src/shared/agent-chat-provider.ts`,
    `src/main/lib/trpc/routers/chats-crud.ts` (Kun create validation, flag-gated)
  - renderer edge: `new-chat-form.tsx`, experimental desktop chat transport,
    runtime label/metadata, approval response routing
  - feature-flag wiring (`LOCUS_ENABLE_KUN_RUNTIME`)
- Licensing/distribution: BYO executable only in this change; future
  bundling/managed-download remains a separate change with its own recorded
  license evidence.
- Default builds unchanged: Kun flag off ⇒ Kun does not appear; existing Claude,
  Codex, and Qwen flag behavior is unchanged.
