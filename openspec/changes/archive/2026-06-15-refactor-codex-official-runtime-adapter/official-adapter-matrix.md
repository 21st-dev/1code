# Codex Official Adapter Matrix

Status: task 2.3 complete; not sufficient to enable app-server by default

Provider calls: none

This matrix records current repo and generated-protocol evidence before product
implementation. It completes task 2.3 by comparing ACP, SDK, and app-server
across the required desktop/chat capability set. It does not complete task 2.4:
the formal app-server target decision still needs review acceptance of this
matrix.

## Version Boundary

- App-server evidence in this matrix uses the bundled runtime only:
  `resources/bin/darwin-arm64/codex`, `codex-cli 0.134.0`.
- SDK evidence uses the current npm package inspected for task 2.1:
  `@openai/codex-sdk@0.139.0` with runtime dependency `@openai/codex@0.139.0`.
- Do not infer app-server 0.139 fields from SDK/npm inspection. The app-server
  column below is limited to the generated 0.134.0 schema.

## Status Vocabulary

- `preserved`: current ACP behavior exists in Locus code.
- `schema-present`: app-server 0.134.0 protocol has a relevant stable type or
  method, but Locus has not wired or tested it.
- `needs-proof`: the surface exists or likely exists, but Locus still needs a
  fake-adapter test, env/redaction test, provider-binding proof, or smoke.
- `unsupported`: the inspected surface does not expose the capability.
- `blocked`: do not enable app-server default until the listed proof exists.

## Sources

- Current ACP path:
  - `src/main/lib/trpc/routers/codex.ts`
  - `src/main/lib/codex/acp-temporary-compat-adapter.ts`
  - `src/main/lib/codex/acp-adapter.ts`
  - `src/main/lib/codex/acp-runtime.ts`
  - `src/main/lib/codex/acp-permission.ts`
  - `src/main/lib/codex/acp-text-stream.ts`
  - `src/main/lib/codex/acp-ui-stream.ts`
  - `src/main/lib/codex/acp-message-persistence.ts`
  - `src/main/lib/codex/provider-runtime-binding.ts`
  - `src/main/lib/codex/usage-metadata.ts`
  - `src/main/lib/codex/desktop-run-request.ts`
  - `src/main/lib/chat-attachments.ts`
  - `src/main/lib/long-text-attachments.ts`
- App-server schema evidence:
  - `openspec/changes/refactor-codex-official-runtime-adapter/app-server-schema-evidence.md`
  - Generated 0.134.0 TypeScript files inspected under `/tmp/locus-codex-appserver-2-3.*/ts-stable`
- SDK evidence:
  - `openspec/changes/refactor-codex-official-runtime-adapter/sdk-type-inspection-evidence.md`
  - No `@openai/codex-sdk` or `@openai/codex` dependency is present in
    `package.json` or `bun.lock` in this repo snapshot.

## Decision Summary

| Capability | Current ACP temporary-compat path | Bundled app-server 0.134.0 schema | SDK status | Decision before implementation |
| --- | --- | --- | --- | --- |
| Adapter target | `preserved`: working desktop/chat compatibility path behind `codex-acp-temporary-compat`; emits adapter metadata and fallback reason through runtime trace/status. | `schema-present`: rich-client protocol exists and remains the target candidate, but no Locus app-server adapter exists. | `unsupported for desktop/chat`: inspected SDK wraps `codex exec --experimental-json`, not app-server. | Keep app-server as the candidate, ACP as temporary fallback, SDK out of desktop/chat. |
| Provider profile binding | `preserved`: route resolves provider profile in main process, local-only checks gateway URL, builds gateway endpoint/token, then ACP env/args route through `LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN` and `model_provider` config. | `schema-present, needs-proof`: `ThreadStartParams` and `ThreadForkParams` expose `modelProvider`, `config`, `cwd`, and model fields. Gateway token/env mapping is outside schema and unproven. | `needs-proof for tooling only`: `baseUrl`, `apiKey`, and `config` map to CLI env/config flags; no proof of Locus provider-profile gateway binding. | Preserve through app-server or block provider-profile app-server runs honestly. |
| Renderer secret boundary | `preserved`: chat schema accepts IDs and providerProfileId, not raw tokens; profile/API key lookup stays in main process; renderer chunks pass through redaction. | `needs-proof`: protocol accepts broad `config`; adapter must reject raw renderer secrets and construct app-server payloads itself. | `needs-proof for tooling only`: SDK exposes `apiKey`, `baseUrl`, `config`, and `env`; all must stay main-process-only. | Add protocol guard tests before adapter implementation. |
| Runtime env | `preserved`: `buildCodexProviderEnv` filters sensitive host env names and regex token/secret names; injects only app-managed `CODEX_API_KEY` or profile-scoped gateway token. | `needs-proof`: app-server process startup env is outside generated request schema and must be an explicit allowlist. | `blocked for default use`: SDK inherits `process.env` when `env` is omitted; explicit `env` prevents inheritance but still allows SDK-added values. | Complete 2.7 env allowlist tests before any SDK/app-server runtime start. |
| MCP readiness/auth | `preserved`: route resolves Codex MCP snapshot before job start, blocks auth-needed servers, passes session MCP servers/fingerprint into ACP provider, and emits MCP runtime blockers. | `schema-present, needs-mapping`: `mcpServerStatus/list`, `mcpServer/oauth/login`, `McpServerStatus`, and `mcpServer/startupStatus/updated` exist. | `unsupported`: SDK only exposes streamed `mcp_tool_call` items; no startup/auth readiness API found. | Map app-server MCP readiness before provider work or keep blocker. |
| Plan mode approvals | `preserved`: shared `PermissionPolicy` maps to ACP mode; missing ACP permission handler fails plan-mode startup instead of running unsafe work; dynamic tool denial cancels stream. | `schema-present, blocked`: `AskForApproval`, `approvalsReviewer`, command/file/permission approval requests and responses exist, but pre-execution timing is not proven in Locus. | `unsupported for hard safety`: SDK exposes `approvalPolicy` as CLI config only; no pre-execution approval callback type. | 2.6 must prove fail-closed app-server approval installation before provider/tool work. |
| Guarded scope | `preserved`: route validates scope contract, captures pre-run git status, uses ACP permission/dynamic-tool decisions, emits guard events, and persists guarded audit. | `schema-present, blocked`: command, file-change, permission, and guardian review notification types exist, but Locus guard mapping and pre-side-effect enforcement are unimplemented. | `unsupported for hard safety`: streamed command/file-change events are after-the-fact; no guarded pre-execution hook found. | Fake app-server guard denial test must pass before enabling guarded app-server runs. |
| AskUserQuestion | `preserved`: ACP tool emits `ask-user-question`, registers pending approval, handles result/timeout, and normalizes tool result shape. | `schema-present, needs-mapping`: `item/tool/requestUserInput` with `ToolRequestUserInputParams/Response` exists. The generated type marks it experimental, so adapter must deliberately handle or gate it. | `unsupported`: no AskUserQuestion or user-input request/response type found. | Preserve pending/result/timeout/cancel semantics before app-server default. |
| MCP elicitation | `partial preserved`: current ACP path can carry MCP tools and AskUserQuestion, but there is no separate app-server-style MCP elicitation mapping in Locus ACP code. | `schema-present, needs-mapping`: `mcpServer/elicitation/request` with form/url modes and structured responses exists. | `unsupported`: no MCP elicitation request/response type found. | Normalize app-server elicitation into runtime-neutral question events or mark degraded. |
| Image attachments | `preserved`: image attachments are staged behind opaque local refs, validated for type/size/path root, resolved in main process, and sent to ACP stream as file parts. | `schema-present, needs-mapping`: `UserInput` supports `image` URLs and `localImage` paths. Locus must avoid leaking raw renderer paths and prefer main-process prepared input. | `partial for tooling`: SDK supports `{ type: "local_image"; path }` and forwards `--image`; path safety must come from Locus preflight. | Preserve local-ref boundary and reject unsupported forms before provider work. |
| Long-text context | `preserved`: long-text local refs are resolved from controlled storage, size-checked, escaped, and prepended as prompt blocks. | `schema-present, needs-proof`: stable `UserInput` supports text and mentions, but no dedicated large-context local-ref primitive was found in 0.134.0 schema. | `partial for tooling`: SDK supports text input only; no local-ref long-text primitive found. | Preserve prompt-block delivery or block honestly if app-server input shape cannot support it. |
| Streaming events | `preserved`: ACP stream normalizes UI chunks, detects dynamic tool approvals, emits errors/auth/errors/finish, and runtime-control mapper persists run events. | `schema-present, needs-mapping`: notifications include thread/turn lifecycle, item lifecycle, deltas, command output, file changes, MCP progress, warnings, token usage, and terminal completion/failure. | `partial for tooling`: SDK streams coarse exec JSONL thread/turn/item lifecycle events. | Map app-server notifications to shared `RunEvent` before renderer/persistence. |
| Usage metadata | `preserved`: ACP path derives session ID and polls Codex session JSONL token_count into message metadata. | `schema-present, needs-mapping`: `thread/tokenUsage/updated` with `ThreadTokenUsage` exists. | `partial for tooling`: SDK `turn.completed` includes token counts. | Use app-server token usage when available; omit unavailable fields rather than fabricating parity. |
| Session resume | `preserved`: ACP provider can reuse `existingSessionId`; app-managed API key path intentionally avoids stale session resume. | `schema-present, needs-proof`: `thread/start`, `thread/resume`, `thread/read`, loaded/list APIs exist. | `partial for tooling`: SDK has `startThread`, `Thread.id`, and `resumeThread`. | Keep resume degraded until app-server resume is tested with Locus session metadata. |
| Fork/rollback | `unsupported/degraded`: current ACP desktop/chat path does not implement product fork/rollback as supported behavior. | `schema-present, needs-proof`: `thread/fork` and `thread/rollback` exist; rollback type explicitly says it does not revert local file changes. | `unsupported`: no SDK fork/rollback type found. | Do not mark fork/rollback supported without adapter tests and local file rollback policy. |
| Cancellation | `preserved`: route aborts active stream, clears pending approvals, cancels reader, cleans provider on abort/cancel, and records canceled terminal job state. | `schema-present, needs-proof`: `turn/interrupt` exists and accepts `threadId`/`turnId`; adapter needs active turn tracking. | `partial for tooling`: SDK passes `AbortSignal` to spawned exec; terminal semantics still need tests if used. | Preserve terminal canceled event and cleanup before app-server default. |
| Diagnostics/readiness | `preserved`: runtime status reports login CLI, ACP runtime/spawn, adapter source/fallback reason, provider-profile unknown, MCP unknown, and local-only state; run path emits blockers. | `schema-present, needs-diagnostics`: app-server version/schema/startup/handshake must be separate from provider auth readiness; this is not implemented. | `unsupported`: SDK has no explicit diagnostics API; version must come from package metadata or child process. | Add app-server readiness diagnostics separately from provider auth. |
| Local-only and cwd boundary | `preserved`: preflight verifies chat/sub-chat/cwd; provider URL passes local-only guard; image/long-text refs are resolved under app storage roots; no raw renderer cwd goes straight to adapter startup. | `needs-proof`: protocol accepts `cwd` on thread/turn; adapter must consume runtime-control preflight and never trust renderer cwd or raw local paths. | `needs-proof for tooling only`: SDK exposes `workingDirectory`, `skipGitRepoCheck`, `additionalDirectories`, and local image paths. | Consume Preflight/RunRequest owners and canonicalize every path before adapter calls. |

## 2.3 Verdict

The matrix supports these conclusions:

1. `codex app-server` remains the only viable official desktop/chat target
   candidate because 0.134.0 exposes the rich-client protocol surfaces Locus
   needs: initialization, thread/turn lifecycle, approval requests, user input
   requests, MCP status/elicitation, streamed notifications, token usage, and
   cancellation.
2. App-server is not enabled or marked supported by this matrix. Its current
   state is `schema-present` plus several `needs-proof`/`blocked` rows.
3. The current ACP path remains the only implemented desktop/chat path and must
   stay labeled `codex-acp-temporary-compat`.
4. The TypeScript SDK remains internal automation/tooling only. It is not a
   desktop/chat target because its inspected surface is a typed `codex exec`
   wrapper without the required rich-client approval, MCP readiness, elicitation,
   or rollback/fork controls.
5. Task 2.4 should remain open until this matrix is reviewed and accepted as the
   formal target decision input.

## 2.4 Decision Record

Decision: `codex app-server` is the desktop/chat target, `@openai/codex-sdk`
is internal automation/tooling only, and ACP remains `temporary-compat` only.

## 2.6 Safety Proof

Implemented proof:

- `src/main/lib/codex/app-server-safety.ts`
- `tests/codex-app-server-safety.test.ts`

The proof uses fake app-server server requests only. It does not start
app-server, does not call a provider, and does not implement a happy-path
app-server adapter.

Covered cases:

- Missing approval hook fails closed before dispatching
  `item/commandExecution/requestApproval`.
- Delayed approval hook installation fails closed before dispatching the first
  side-effecting `item/tool/call` request.
- Command, file-change, permission-escalation, and MCP/dynamic-tool requests
  dispatch only after approval hook readiness is true.

## 2.7 Env Allowlist Proof

Implemented proof:

- `src/main/lib/codex/official-runtime-env.ts`
- `tests/codex-official-runtime-env.test.ts`

The proof builds SDK/app-server runtime env from a small explicit allowlist
instead of inheriting `process.env`. It copies portable process basics such as
`PATH`, `HOME`, and temp-directory variables, rejects arbitrary host variables,
and injects only the selected app-managed `CODEX_API_KEY` or selected
provider-profile `LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN`.

Covered stale-token exclusions:

- `OPENAI_API_KEY`
- `CODEX_API_KEY`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `GITHUB_TOKEN`
- stale `LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN`

## 2.8 Redaction Proof

Implemented proof:

- `tests/runtime-stream-event-mapper.test.ts`

The proof keeps app-server diagnostic redaction on the existing runtime
redaction owner instead of creating a parallel path. It verifies that app-server
provider/MCP diagnostic shapes are redacted before both renderer emission and
job-event persistence.

Covered secret shapes:

- provider gateway token fields
- authorization headers
- bearer-token and `access_token=...` text
- MCP env secret fields such as `OPENAI_API_KEY`
- MCP OAuth payloads

## 2.9 Related Spec Review

Reviewed before app-server adapter implementation:

- `openspec/specs/agent-runtime-capabilities/spec.md`
- `openspec/specs/agent-chat-attachments/spec.md`
- `openspec/specs/agent-long-text-context/spec.md`
- `openspec/specs/agent-scope-contracts/spec.md`
- `openspec/specs/runtime-mcp-import-preview/spec.md`
- `openspec/specs/usage-panel/spec.md`
- `openspec/specs/desktop-agent-jobs/spec.md`
- `openspec/specs/agent-protocol-interfaces/spec.md`
- `openspec/specs/runtime-security-baseline/spec.md`
- This change's deltas under
  `openspec/changes/refactor-codex-official-runtime-adapter/specs/`

Findings for implementation:

| Spec area | Review result | Implementation constraint |
| --- | --- | --- |
| Capability evidence | Current specs require `supported` only when adapter or shared-layer code and tests/smoke cover the exact path. The change delta adds adapter-specific Codex evidence. | Do not promote app-server capability states from ACP, SDK, or `codex exec` evidence. Each app-server supported claim needs its own fake/live proof. |
| Attachments | Current image specs require local staging, metadata/local refs in renderer state, provider capability checks, and guardrail rejection. The change delta requires app-server input mapping in the main process. | App-server must receive only main-process-resolved supported image inputs. Unsupported image/file shapes block before provider work. |
| Long-text context | Current specs require local storage, metadata-only renderer state, size checks, deterministic main-process prompt injection, and blocking on unresolved refs. The change delta allows structured app-server text items only if boundaries remain intact. | Keep local refs and size enforcement outside the adapter transport. If app-server cannot support the mapped long-text shape, fail before startup instead of dropping context. |
| Scope contracts | Current specs still include older Codex contract-and-audit behavior, but newer requirements make guarded desktop runs feed `PermissionPolicy` and require fail-closed behavior when hard enforcement is unavailable. The change delta explicitly rejects prompt-only/post-run audit for app-server guarded support. | App-server guarded mode must enforce write, shell, file, and MCP side-effect decisions before execution or use an explicitly supported fallback before provider work. |
| MCP import | Current MCP import preview specs are renderer-safe and pending-only: no apply, enable, secret return, or raw deep-link logging. | App-server MCP readiness/config work must not reuse preview payloads as trusted runtime config, and must keep env/header/OAuth values redacted. |
| Usage metadata | Usage specs allow only locally observed usage and provider-reported context/limit data; unavailable context must stay unavailable. | Map `thread/tokenUsage/updated` when present, but do not fabricate account quota, context percent, or missing token fields. |
| Jobs and protocol events | Desktop job specs require verified preflight context, preserved chat transcript source of truth, exact-stream cancellation, sanitized semantic run events, and no raw provider chunks. Protocol specs require advertised capability checks and no plaintext provider tokens. | App-server notifications must map through normalized run events and redaction before renderer/job persistence. Protocol/job callers must be gated by capability manifests before startup. |
| Runtime security | Runtime security specs require provider secrets to stay in main-process boundaries, inherited env secrets not to override selected config, scoped MCP writes, canonical paths, and redacted gateway errors. | Keep the 2.7 env allowlist and 2.8 redaction owner as mandatory adapter prerequisites. Reject renderer/protocol/job secret-bearing inputs before runtime startup. |

No related spec changes are needed for 2.9 itself. The review confirms that
section 3 implementation must consume the approved runtime-control owners for
preflight, permission policy, run requests, normalized events, trace/redaction,
and capability truth instead of rebuilding route-local equivalents.

## 2.10 Runtime-Control Consumption Gate

Reviewed owners:

- `docs/OWNERSHIP_MAP.md`
- `src/main/lib/agent-runtime/preflight.ts`
- `src/main/lib/agent-runtime/permission-policy.ts`
- `src/main/lib/agent-runtime/desktop-run-request.ts`
- `src/main/lib/agent-runtime/runtime-events.ts`
- `src/main/lib/agent-runtime/redaction.ts`
- `src/main/lib/agent-runtime/desktop-runner.ts`
- `src/main/lib/codex/desktop-run-request.ts`
- `src/main/lib/codex/acp-temporary-compat-adapter.ts`
- `src/main/lib/trpc/routers/codex.ts`

Section 3 app-server work must consume the approved runtime-control layer:

| Runtime-control owner | Existing contract | App-server implementation gate |
| --- | --- | --- |
| Preflight | `verifyDesktopRunPreflight` verifies chat, sub-chat, project, cwd, and blockers before runtime startup. Codex route already creates `verifiedRunContext` before adapter creation. | App-server adapter must not accept raw renderer `cwd`, chat IDs, attachment refs, provider metadata, or local-only state as authority. It must receive verified context through `DesktopRunRequest`. |
| Permission policy | `resolveDesktopPermissionPolicy` owns plan, observed, and guarded desktop semantics. Current Codex mapping is explicitly ACP-specific through `adapterSource: "acp-temporary-compat"` and `getCodexPermissionMapping`. | Section 3 must extend this owner for `codex-app-server` mapping or fail closed before adapter startup. Do not derive plan/guarded/app-server approval semantics inside `app-server-adapter.ts` or `codex.ts`. |
| Desktop run request | `DesktopRunRequest` carries identity, verified context, prompt, permission policy, provider binding, MCP readiness, attachments, trace observer, abort signal, and session metadata. `createCodexDesktopRunRequest` maps Codex route state into this shared contract. | App-server adapter entrypoint must be `run(request: DesktopRunRequest)` behind the desktop adapter factory. Transport-specific thread/turn payloads are built from this request, not from route-local input envelopes. |
| Runtime events and trace | `RunEvent` and `DesktopTraceObserver` define normalized persisted/renderer-safe event emission. `emitDesktopRuntimeAdapterStarted` records adapter source/fallback metadata through the shared runner. | App-server notifications must map into `RunEvent` before persistence or Workbench replay. Adapter-specific app-server chunks must not become a second durable event schema. |
| Redaction | `redactRuntimePayload` and the stream-event mapper own renderer/job-event redaction. 2.8 proves app-server provider/MCP diagnostic shapes pass through this owner. | New app-server diagnostics, provider binding errors, MCP payloads, and protocol warnings must pass through existing redaction before renderer return or persistence. |
| Capability truth | `src/shared/agent-runtime-capabilities.ts` is the canonical capability manifest owner. The 2.9 review and change deltas require adapter-specific evidence. | App-server support claims must be updated in the shared capability owner only after tests/smoke prove that app-server path, not by copying ACP evidence. |

Implementation stop rule:

- If a section 3 patch introduces app-server route-local copies of preflight,
  permission policy, run request assembly, trace/event mapping, redaction, or
  capability truth, the patch is out of scope and must be rewritten against the
  owner above.
- If app-server approval, guarded scope, MCP readiness, attachment mapping,
  provider binding, or cancellation cannot be expressed through
  `DesktopRunRequest` plus the shared owners, the behavior must stay blocked or
  use the explicit `temporary-compat` fallback before provider work starts.
- The app-server adapter may contain transport mapping only: app-server
  startup/handshake, schema-pinned client messages, notification parsing, and
  conversion into the shared contracts.

## 3.1 Adapter Interface

Implemented:

- `src/main/lib/codex/adapter-types.ts`
- `src/main/lib/codex/acp-temporary-compat-adapter.ts`
- `tests/desktop-runtime-adapter-factory.test.ts`

The Codex adapter interface is intentionally a narrow type wrapper around the
shared main-process `DesktopRuntimeAdapter` contract. It constrains Codex
adapter metadata to `runtimeId: "codex"` and the known Codex desktop adapter
sources:

- `codex-acp-temporary-compat`
- `codex-app-server`

This keeps the renderer/tRPC API stable and avoids introducing a second Codex
run contract. Codex adapters still receive `DesktopRunRequest` and return
`DesktopRunResult` through the runtime-control owner. The current ACP adapter
now returns `CodexDesktopAdapter`; future app-server work must implement the
same interface rather than accepting route-local input envelopes.

## 3.2 App-Server Adapter Gate

Implemented:

- `src/main/lib/codex/app-server-adapter.ts`
- `src/main/lib/codex/app-server-safety.ts`
- `src/main/lib/agent-runtime/desktop-adapter-metadata.ts`
- `tests/codex-app-server-adapter.test.ts`
- `tests/codex-app-server-safety.test.ts`
- `tests/desktop-runtime-adapter-factory.test.ts`

The app-server adapter now exists as a main-process Codex desktop adapter source
behind an explicit `enabled` gate that defaults to `false`. It is not wired as
the default Codex route adapter and does not start app-server or provider work.

Safety properties established before any happy-path transport:

- Unknown app-server server-request methods fail closed by default.
- The bundled 0.134.0 `ServerRequest` method union is recorded in
  `CODEX_APP_SERVER_0_134_SERVER_REQUEST_METHODS`.
- Every side-effecting 0.134.0 server request is covered by the approval gate,
  including legacy `applyPatchApproval` and `execCommandApproval`.
- Selecting app-server with the current ACP-specific `PermissionPolicy` mapping
  fails closed before transport startup.
- App-server metadata is available to the desktop adapter factory as
  `codex-app-server`, while ACP remains the only implemented/default Codex
  route path.

## 3.3 ACP Temporary-Compat Wrapper

Implemented:

- `src/main/lib/agent-runtime/desktop-adapter-metadata.ts`
- `src/main/lib/agent-runtime/desktop-runner.ts`
- `src/main/lib/codex/runtime-status.ts`
- `tests/desktop-runtime-adapter-factory.test.ts`

The current ACP path remains available only as `codex-acp-temporary-compat`.
Its renderer-safe adapter metadata now carries:

- exact `temporary-compat` label text
- fallback reason naming app-server as the target desktop/chat adapter
- default-disable condition
- removal condition

`emitDesktopRuntimeAdapterStarted` includes those conditions in normalized trace
events, and Codex runtime status includes them in the adapter-source component
hint. This keeps ACP visible as a migration fallback and avoids treating ACP
behavior as app-server capability evidence.

## 3.4 Provider-Profile Gateway Binding

Implemented:

- `src/main/lib/codex/app-server-provider-binding.ts`
- `tests/codex-app-server-provider-binding.test.ts`
- `tests/desktop-runtime-adapter-factory.test.ts`

The app-server provider binding helper consumes only the shared
`DesktopRunRequest.providerBinding` metadata plus main-process selected
credentials. It builds:

- an explicit allowlisted runtime environment through
  `buildCodexOfficialRuntimeEnv`
- app-server client provider config containing the Locus gateway endpoint and
  `LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN` env-key name, but not the token value

Covered cases:

- Provider-profile runs inject only the selected gateway token into runtime env.
- Stale host `OPENAI_API_KEY`, `CODEX_API_KEY`, `GITHUB_TOKEN`, and unrelated
  tokens cannot override the selected provider profile.
- App-managed runs inject only the selected main-process Codex API key.
- Missing provider-profile gateway token fails closed before app-server startup.
- Secret-bearing renderer/protocol/job payloads containing raw `apiKey`,
  `authConfig`, `env`, `headers`, `Authorization`, OAuth, gateway tokens, or
  provider tokens are rejected before runtime startup.

## 3.5 App-Server Permission Policy Mapping

Implemented:

- `src/main/lib/agent-runtime/permission-policy.ts`
- `src/main/lib/codex/app-server-adapter.ts`
- `tests/agent-runtime-permission-policy.test.ts`
- `tests/codex-app-server-adapter.test.ts`

The shared permission-policy owner now exposes an explicit
`codexAdapterSource: "codex-app-server"` resolver path. Existing Codex callers
still default to `acp-temporary-compat`, so the current route behavior remains
unchanged until app-server is explicitly selected behind its gate.

App-server mapping properties:

- Plan mode maps to `codex-app-server-plan-approval-gate`.
- Guarded mode maps to `codex-app-server-guarded-approval-gate`.
- Observed mode maps to `codex-app-server-agent-approval-gate` and uses
  fail-closed degradation when the approval hook is unavailable.
- Every app-server mapping requires an approval gate and records missing or
  delayed hook installation as `fail-closed`.

The app-server adapter no longer inspects `runtimeMapping` with an untyped
`adapterSource` cast. It consumes `getCodexAppServerPermissionMapping` from the
permission-policy owner and refuses startup unless the owner-provided mapping
requires a fail-closed approval gate. The adapter still stops before transport
startup because the app-server happy path remains unimplemented.

## 3.6 App-Server User Input And MCP Elicitation Bridge

Implemented:

- `src/main/lib/codex/app-server-user-interaction.ts`
- `tests/codex-app-server-user-interaction.test.ts`
- existing normalized event coverage in
  `src/main/lib/agent-runtime/stream-event-mapper.ts`

The bridge maps fake app-server server requests into the existing desktop
question UI/event contract. It does not start app-server and is not wired as a
happy-path transport.

Covered `item/tool/requestUserInput` behavior:

- App-server questions normalize into existing `ask-user-question` chunks.
- Pending approvals are registered with the existing Codex pending-question
  shape.
- Accepted answers return the app-server response shape
  `{ answers: { [questionId]: { answers: string[] } } }`.
- Skipped and timed-out questions return empty answers, emit
  `ask-user-question-result`, and timeouts also emit
  `ask-user-question-timeout`.
- Secret question answers are returned to app-server but redacted from emitted
  renderer/result chunks.

Covered `mcpServer/elicitation/request` behavior:

- Form-mode schemas normalize to shared question chunks with enum options and
  multi-select hints where available.
- URL-mode elicitations normalize to accept/decline questions.
- Accepted form answers return structured MCP content.
- Rejected elicitations return `decline`; timed-out elicitations return
  `cancel`.
- Secret-looking MCP response keys are redacted from emitted result chunks.

The emitted app-server interaction chunks pass through the existing
`mapDesktopStreamChunkToRunEvents` owner as `question_pending` and
`question_result`, so this proof does not introduce a second durable event
schema.

## 3.7 App-Server Attachment Mapping

Implemented:

- `src/main/lib/codex/app-server-attachments.ts`
- `tests/codex-app-server-attachments.test.ts`
- existing attachment-boundary coverage in
  `tests/rich-chat-attachments-pipeline.test.ts`

The app-server attachment mapper accepts only main-process resolved image
attachments and builds app-server `UserInput` items from those resolved bytes.
It does not accept renderer local refs, raw renderer paths, filenames, or
unresolved metadata as app-server input authority.

Covered cases:

- Text prompt maps to a stable app-server text input item.
- Resolved image attachments map to app-server image input items using
  main-process prepared `data:<mediaType>;base64,...` URLs.
- The app-server payload does not include Locus `localRef` or filename metadata.
- Image refs present in `DesktopRunRequest.attachments` must already have
  matching resolved image bytes before app-server startup.
- Unsupported media types and missing resolved bytes fail before provider work.
- Long-text refs fail closed in this mapper and remain assigned to task 3.10,
  so 3.7 does not silently drop or pretend to support long-text context.

## 3.8 App-Server Stream, Usage, Session, Terminal, And Cancellation Mapping

Implemented:

- `src/main/lib/codex/app-server-stream-events.ts`
- `tests/codex-app-server-stream-events.test.ts`
- `src/main/lib/agent-runtime/stream-event-mapper.ts`

The app-server stream mapper converts fake bundled-0.134.0 notifications into
the existing desktop stream chunk shapes, and those chunks continue through
`mapDesktopStreamChunkToRunEvents`. It does not persist raw app-server
notifications and does not introduce a second durable event schema.

Covered cases:

- `thread/started` records app-server `threadId` and `sessionId` as status
  metadata.
- `turn/started` records the active `turnId`, allowing cancellation to build a
  `turn/interrupt` request only after both thread and turn IDs are known.
- `item/agentMessage/delta` maps to existing text delta chunks and normalized
  `assistant_delta` run events.
- reasoning deltas map to existing reasoning chunks and normalized
  `reasoning_delta` run events.
- `thread/tokenUsage/updated` maps provider-reported last/cumulative usage and
  model context window into existing `message-metadata` / `usage_update`
  events without fabricating missing quota fields.
- `turn/completed` preserves successful, interrupted, and failed terminal
  statuses in the existing `finish` chunk path.
- app-server `error` notifications map to existing error chunks and do not
  produce terminal success.

The shared stream-event mapper still defaults legacy `finish` chunks to
`succeeded`, but now preserves an explicit `failed`, `canceled`, or
`interrupted` status when a runtime chunk provides one.

## 3.9 App-Server Rollback And Fork Unsupported Gate

Implemented:

- `src/main/lib/codex/app-server-session-primitives.ts`
- `tests/codex-app-server-session-primitives.test.ts`
- existing capability truth coverage in `tests/agent-runtime-capabilities.test.ts`

The bundled app-server schema exposes `thread/fork` and `thread/rollback`, but
Locus still does not have a tested durable shared-session reference model or a
local file rollback policy for Codex app-server. Schema presence is therefore
not treated as support.

Covered cases:

- App-server `rollback` resolves to unsupported and throws fail-closed when a
  caller tries to assert support.
- App-server `fork` resolves to unsupported and throws fail-closed when a
  caller tries to assert support.
- The shared runtime capability manifest still reports Codex `rollback` as
  `unsupported` / `unavailable`.

## 3.10 App-Server Long-Text Local-Ref Boundary

Implemented:

- `src/main/lib/codex/app-server-attachments.ts`
- `tests/codex-app-server-attachments.test.ts`
- existing long-text owner coverage in `tests/long-text-attachments.test.ts`
  and `tests/long-text-send-pipeline.test.ts`

Long-text attachments remain local-ref based in renderer/persisted message
state. For app-server, Locus resolves those refs through the existing
`prependLongTextAttachmentPromptBlocks` owner before building app-server user
input. The app-server payload receives a text input containing the prepared
prompt block, not unresolved renderer metadata or raw local refs.

Covered cases:

- Prepared long-text refs can pass through `buildCodexAppServerUserInputItems`
  only with an explicit `allowPreparedLongTextRefs` flag.
- The app-server text input contains the resolved long-text body and prompt
  block generated by the shared long-text owner.
- The app-server payload does not include the Locus long-text `localRef`.
- Deleted or otherwise unresolvable long-text refs fail before app-server
  startup/provider work.
- Long-text attachment bodies remain absent from renderer draft, queue, and
  persisted message metadata.

## 3.11 App-Server Guarded Scope Gate

Implemented:

- `src/main/lib/codex/app-server-guarded-scope.ts`
- `tests/codex-app-server-guarded-scope.test.ts`
- existing permission/safety coverage in
  `tests/agent-runtime-permission-policy.test.ts` and
  `tests/codex-app-server-safety.test.ts`

The app-server guarded-scope gate consumes the shared permission-policy owner
and the validated scope-contract type. It does not reimplement guard decision
logic inside app-server transport code.

Covered cases:

- Guarded app-server policy plus a validated scope contract resolves to a hard
  app-server approval-gate enforcement context.
- Guarded app-server policy without a validated scope contract fails closed.
- ACP temporary-compat permission mapping cannot be consumed by the app-server
  guarded-scope gate.
- A scope contract without guarded app-server policy fails closed.
- The gate requires fail-closed app-server approval enforcement before guarded
  app-server startup.

## 3.12 App-Server Transport Wiring

Implemented:

- `src/main/lib/codex/app-server-transport.ts`
- `src/main/lib/codex/app-server-adapter.ts`
- `src/main/lib/trpc/routers/codex.ts`
- `tests/codex-app-server-adapter.test.ts`
- `tests/desktop-runtime-adapter-factory.test.ts`

The app-server adapter now has a real transport path and is the default Codex
desktop/chat path. ACP remains available only as an explicit
temporary-compat rollback path through `LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT=1`
or the preserved legacy `LOCUS_CODEX_APP_SERVER_ADAPTER=0` escape hatch.

Covered behavior:

- `initialize` request and `initialized` notification are sent over bundled
  app-server stdio.
- `thread/start` receives model, provider-profile client config, cwd,
  approval policy, approval reviewer, sandbox, and service metadata.
- `turn/start` receives the prepared app-server user input items, cwd,
  approval policy, approval reviewer, sandbox policy, and model.
- app-server notifications pass through `createCodexAppServerRuntimeEventMapper`
  and then through `mapDesktopStreamChunkToRunEvents`.
- app-server server requests pass through the default-deny safety dispatcher
  before the adapter returns a response.
- app-server user-input and MCP elicitation requests are bridged to the shared
  pending-question owner used by the existing Codex UI approval route.
- cancellation uses `turn/interrupt` once thread and turn IDs are known.
- provider-profile runs inject the selected gateway token only into the
  allowlisted runtime env and pass only env-key client config to app-server.
- renderer chunks can be emitted by the existing route emitter while durable
  events still flow through the runtime event owner.

Local live probe:

```bash
bun - <<'TS'
import { createCodexAppServerStdioTransport } from './src/main/lib/codex/app-server-transport'
const transport = createCodexAppServerStdioTransport({ executable: 'resources/bin/darwin-arm64/codex', cwd: process.cwd(), env: process.env })
const result = await transport.request('initialize', { clientInfo: { name: 'locus-smoke', title: 'Locus Smoke', version: '0.0.0' }, capabilities: { experimentalApi: false, requestAttestation: false } })
transport.notify('initialized')
console.log(JSON.stringify({ ok: true, userAgent: (result as any)?.userAgent ?? null }))
await transport.close()
TS
```

Observed output:

```json
{"ok":true,"userAgent":"Codex Desktop/0.134.0 (Mac OS 15.6.1; arm64) dumb (locus-smoke; 0.0.0)"}
```

The probe only proves stdio framing and initialize compatibility. It is not a
desktop smoke substitute.

## 3.13 Guarded Approval Grant Path And Stderr Redaction

Implemented:

- `src/main/lib/codex/app-server-approval.ts`
- `src/main/lib/codex/app-server-adapter.ts`
- `src/main/lib/codex/app-server-transport.ts`
- `src/main/lib/trpc/routers/codex.ts`
- `tests/codex-app-server-adapter.test.ts`
- `tests/codex-app-server-approval.test.ts`
- `tests/codex-app-server-transport.test.ts`

The adapter now routes app-server side-effect approval requests through the
same Locus permission/guard decision owner used by the ACP temporary path before
returning an app-server response:

- `item/commandExecution/requestApproval` maps policy/user approval to
  `{ decision: "accept" | "decline" | "cancel" }`.
- `item/fileChange/requestApproval` maps policy/user approval to
  `{ decision: "accept" | "decline" | "cancel" }`.
- `item/permissions/requestApproval` maps policy/user approval to
  `{ permissions, scope: "turn", strictAutoReview: true }`.
- Network permission expansions remain fail-closed; this grant path only
  permits file-system permission profiles that pass the shared policy owner.
- Legacy `execCommandApproval` and `applyPatchApproval` map policy/user
  approval to `{ decision: "approved" | "denied" | "timed_out" }`.
- Plan mode and guarded policy denial still fail closed without presenting an
  approval prompt.
- Guarded approvals require the validated scope contract and emit the existing
  `guard-event` chunk. Observed-mode decisions emit the existing
  `observed-tool-decision` chunk.
- User approval prompts are registered with the existing Codex pending-question
  owner after prompt text redaction and include explicit `Approve` and `Deny`
  options; if that bridge is missing, the app-server approval response
  declines.
- Direct approval-policy tests cover network denial, workspace-escaping
  permission paths, and per-path guarded scope checks without going through the
  full adapter harness.

Transport stderr is now redacted through the runtime redaction owner before it
is used as a pending-request error message. The redacted message is also capped
before it can flow into renderer chunks or durable events.

## 4.1 Runtime Status Adapter Truth

Implemented:

- `src/main/lib/codex/cli-path.ts`
- `src/main/lib/codex/runtime-status.ts`
- `tests/codex-runtime-status.test.ts`

Codex runtime status now exposes renderer-safe adapter metadata instead of
leaving the official-adapter decision only in OpenSpec evidence.

Covered status fields:

- Bundled Codex CLI version is reported as `0.134.0`.
- Current desktop/chat adapter source is
  `codex-app-server` by default.
- Target desktop/chat adapter source is `codex-app-server`.
- ACP temporary-compat status includes the fallback reason,
  default-disable condition, and removal condition recorded in the adapter
  metadata owner.
- ACP temporary-compat is selected only through an explicit rollback env
  (`LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT=1`) or the preserved legacy
  `LOCUS_CODEX_APP_SERVER_ADAPTER=0` escape hatch.
- The adapter metadata object is covered by a renderer-safety assertion that
  rejects token, API key, or secret-shaped fields.

## 4.2 Adapter-Specific Capability Truth

Implemented:

- `src/shared/codex-runtime-capabilities.ts`
- `src/shared/agent-runtime-capabilities.ts`
- `tests/codex-runtime-capabilities.test.ts`
- `tests/agent-runtime-capabilities.test.ts`

The Codex runtime manifest now reports the app-server desktop path as the
default Codex runtime path. Adapter-specific Codex capability views are derived
from the canonical manifest and override ACP fallback or app-server fields where
isolated proofs differ.

App-server-supported capability claims are limited to:

- `hardToolGuard`: fail-closed approval and guarded-scope proof.
- `planMode`: permission-policy owner maps app-server plan mode to a
  fail-closed approval gate.
- `askUserQuestion`: app-server user-input and MCP elicitation requests map to
  the shared question contract.
- `providerProfiles`: app-server provider binding uses main-process gateway
  credentials and renderer-safe client config.
- `attachments`: app-server input mapping accepts resolved images and prepared
  long-text prompt blocks.
- `usageMetadata`: app-server usage notifications map to normalized usage
  events without fabricating missing values.

Kept degraded or unsupported:

- `scopeExpansion` remains degraded until live transport scope-expansion retry
  behavior is proven.
- `mcpAuth` and `mcpConfiguration` remain degraded until app-server readiness
  and config handoff are proven.
- `rollback` / fork remain unsupported despite schema presence.
- runtime plugins, commands, and workflows remain unsupported.

## 4.3 Provider Diagnostics App-Server Readiness Split

Implemented:

- `src/shared/provider-profile-types.ts`
- `src/main/lib/provider-profiles/gateway.ts`
- `tests/provider-profile-diagnostics.test.ts`

Provider diagnostics now include a separate `codex_app_server` check after the
runtime target check. Provider endpoint/auth/model/protocol success can remain
`ok` while app-server readiness is reported as skipped behind the explicit
adapter gate. This prevents app-server migration blockers from being reported
as provider endpoint or auth failures.

No SDK readiness check was added because this change has not added the SDK as a
product dependency or internal tooling runtime.

## 4.4 Product And Documentation Language

Implemented:

- `src/shared/agent-runtime-capabilities.ts`
- `docs/locus-runtime-workbench-completion-roadmap.zh-CN.md`
- `docs/codex-runtime-capability-audit-plan.md`

Updated language distinguishes:

- ACP as the current `temporary-compat` desktop adapter.
- `codex app-server` as the desktop/chat target.
- app-server proof/stub work from a real product transport and desktop smoke.
- historical CLI/ACP audit evidence from the current app-server target.

## 4.5 Codex Exec Headless/Batch Boundary

Implemented:

- `src/main/lib/headless/adapters/codex.ts`
- `tests/headless-runtime-adapters.test.ts`
- existing ownership coverage in `docs/OWNERSHIP_MAP.md` and
  `openspec/specs/architecture-ownership/spec.md`

The headless Codex adapter is labeled `Codex headless/batch`, still builds
`codex exec` arguments, and is guarded by a test that prevents this file from
becoming an app-server or desktop-chat implementation.

## 4.6 App-Server Renderer Secret Rejection

Implemented:

- `src/main/lib/codex/app-server-provider-binding.ts`
- `src/main/lib/codex/app-server-adapter.ts`
- `src/main/lib/codex/chat-input-schema.ts`
- `tests/codex-app-server-provider-binding.test.ts`
- `tests/codex-app-server-adapter.test.ts`
- `tests/provider-credential-storage.test.ts`

The app-server adapter now calls the renderer-secret guard before permission
policy readiness and before any transport startup. The guard rejects raw API
keys, OAuth/token fields, authorization headers, cookies, custom env/process
env/shell env, provider config objects, and raw MCP server payloads. It
continues to allow renderer-safe `providerProfileId` because provider profile
secrets are resolved only in the main process.

The strict Codex chat input schema is covered against top-level raw `env`,
`headers`, `providerConfig`, and `mcpServers` payloads.

## 6.7 Build Verification

Completed:

```bash
bun run build
```

Observed result: production Electron/Vite build completed successfully. The
build emitted existing Rollup dynamic/static import and Browserslist data-age
warnings, but exited with code 0.

## 6.8 Desktop Smoke Status

Real desktop smoke evidence is recorded in `desktop-smoke-evidence.md`. 6.8 is
complete under the accepted bounded scoped shell approval interpretation for
guarded edit evidence.

Passed through real desktop/Electron/tRPC/product routes:

- bundled Codex `0.134.0` accepts `app-server --listen stdio://` newline JSON;
- app-server adapter is the default Codex desktop/chat path; the legacy
  `LOCUS_CODEX_APP_SERVER_ADAPTER=1` smoke commands remain historical evidence
  from before the default flip;
- provider-profile binding reaches the app-server adapter and persists
  `adapterSource: codex-app-server`;
- provider-profile app-server chat produces real text deltas through the Locus
  gateway;
- plan-mode denial prevents the requested filesystem write;
- guarded denial emits and persists blocked guard decisions;
- non-empty app-server MCP readiness reports ready status for a real stdio MCP
  server through isolated `CODEX_HOME` config handoff;
- cancellation transitions the job to `canceled`;
- setting `LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT=1` selects the labeled ACP
  temporary-compat fallback diagnostics path.

Recorded deferred structured-edit evidence:

- Follow-up implementation mapped guarded app-server runs to native
  `approvalPolicy: "untrusted"` and added a narrow scoped shell-file approval
  path. Real desktop follow-up job `mqacq9t4i3tcjxpr` reached user approval for
  scoped `Run command` requests and created
  `.tmp-app-server-smoke/evidence/desktop-structured-edit/canary-guarded-approve.txt`.
  This closes the guarded approve-and-edit filesystem blocker for the bounded
  scoped shell approval path. A stricter structured-only probe,
  `mqactd9o7mo7rh4p`, denied shell approvals and did not trigger fileChange or
  applyPatch approval. A follow-up structured apply-patch probe,
  `mqai5zfmwn8bz3cm`, forced an explicit apply_patch patch and denied shell
  approvals; it still produced only two `Run command` approvals,
  `fileChangeApprovalQuestionCount: 0`, and
  `structuredFileChangeChunkCount: 0`. Review then identified three local
  enablement variables that had not yet been tried: app-server
  `experimentalApi`, candidate apply-patch config keys, and a Codex-native model
  name. Follow-up experiment jobs `mqaip9c1v2e4ncul` and `mqais7qomrhhy0if`
  enabled `experimentalApi: true`, passed candidate config keys
  (`features.apply_patch_freeform`, `features.apply_patch_streaming_events`,
  `include_apply_patch_tool`, `tools.apply_patch.enabled`,
  `tools.apply_patch.approval_mode`,
  `model_providers.locus_profile.apply_patch_tool_type`, and
  `model_providers.locus_profile.experimental_supported_tools`), and tested
  both `deepseek-v4-flash` and `gpt-5-codex`. Those real desktop runs still
  produced only `Run command` approvals, with
  `fileChangeApprovalQuestionCount: 0` and
  `structuredFileChangeChunkCount: 0`. Structured-only edit evidence is
  explicitly deferred: the local adapter enablement experiment is complete, and
  the remaining gap is app-server/runtime tool-surface availability under the
  current provider path, not a missing Locus approval handler or an untried
  local `experimentalApi`/config/model switch. The bounded shell classifier is
  now owned by `src/main/lib/agent-guard/decision.ts` and consumed by the
  app-server bridge only before its second explicit user-approval gate. It
  rejects shell-expanded paths (`$`, `~`, glob/braces, redirection metachars)
  before prompting. Its public return type carries `requiresUserApproval: true`,
  and the app-server bridge checks that flag before prompting, so the helper is
  not a bare execute-allow API.
- MCP readiness follow-up job `mqagb08gu6j9836k` created an isolated Codex home
  with a real stdio MCP server, passed `CODEX_HOME` through the official
  runtime env allowlist, queried app-server `mcpServerStatus/list`, and
  recorded `serverCount: 1`, `readyServerCount: 1`,
  `serverNames: ["locus_smoke_mcp"]`, and `authStatuses: ["unsupported"]`.
  The evidence JSON redacted the synthetic MCP secret. The older `Working: 0/0`
  log line is from unrelated global MCP warmup, not the app-server readiness
  signal.
- Provider-profile rich text follow-up job `mqahvugfwj1tsfdg` succeeded through
  the real Electron/tRPC/product route, emitted 14 `text-delta` chunks, and
  reconstructed `LOCUS_PROVIDER_TEXT_DELTA_OK_20260612`. This closes the
  earlier "401 or empty gateway response" blocker for the current desktop path.
  The evidence artifact contains no `Bearer`, `sk-`,
  `LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN`, `access_token`, or `refresh_token`.
- Real UI dogfood used the visible dev Electron renderer with the app-server
  gate enabled. Provider-profile chat and plan-mode turns persisted
  `adapterSource: codex-app-server` and reused the same app-server session.
  App-managed ChatGPT/GPT-5.5 UI job `mqaof7h5uk3shkvk` created
  `.tmp-app-server-dogfood/ui-chatgpt/canary.txt` with the expected marker.
  Guarded UI job `mqaoh6sq0mbdukry` proved the renderer can submit a guarded
  app-server job with `permissionPolicy.guarded: true` and
  `appServerApprovalPolicy: untrusted`, but the visible UI flow did not
  complete a guarded write; it failed closed with the assistant response
  `未创建：写入操作被拒绝。` This is recorded as a dogfood usability follow-up,
  not as a 6.8 safety blocker, because the automated desktop proof already
  covers bounded scoped shell approval and filesystem execution.

Deferred after checking 6.8:

- Structured-only file edit approval remains unproven and is not part of the
  accepted 6.8 completion claim. The strict probe
  `mqactd9o7mo7rh4p` denied shell approvals and the model did not trigger
  fileChange or applyPatch approval. The stronger structured apply-patch probe
  `mqai5zfmwn8bz3cm` also produced no fileChange/applyPatch approvals or
  file-change notifications. The apply-patch enablement experiment then tried
  `experimentalApi: true`, candidate apply-patch config keys, and both
  `deepseek-v4-flash` (`mqaip9c1v2e4ncul`) and `gpt-5-codex`
  (`mqais7qomrhhy0if`); both runs still produced
  `fileChangeApprovalQuestionCount: 0` and
  `structuredFileChangeChunkCount: 0`.
- Real UI guarded editing remains a dogfood follow-up: the UI can create a
  guarded app-server job and fails closed on invalid success checks, but the
  observed UI session did not complete a guarded file edit even after a valid
  bounded scope contract was approved.

## Required Proof Before Enabling App-Server

- Schema/client pinning test for the bundled Codex runtime version.
- Completed: fake transport test where missing approval callback fails before
  provider or tool work starts.
- Completed: fake transport test where delayed approval callback installation
  fails before the first command, file change, MCP call, or permission
  escalation.
- Completed: runtime env allowlist test that strips `OPENAI_API_KEY`,
  `CODEX_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, and unrelated host
  tokens.
- Renderer protocol guard tests rejecting `apiKey`, `authConfig`, `env`,
  `headers.Authorization`, gateway tokens, OAuth tokens, and raw provider
  config.
- Provider-profile gateway binding proof or an honest app-server blocker.
- Completed: MCP env/header/OAuth redaction tests for diagnostics, job events,
  and renderer chunks.
- Desktop smoke evidence after fake-adapter safety tests pass.
