## Context
Locus currently has two different runtime integration shapes:

- Claude desktop/chat uses `@anthropic-ai/claude-agent-sdk` through a main-process `query()` path with tool permission handling, MCP setup, AskUserQuestion handling, provider-profile environment construction, and cancellation.
- Codex desktop/chat uses `@mcpc-tech/acp-ai-provider` with bundled `@zed-industries/codex-acp`, Vercel AI SDK `streamText`, ACP tools, and a Locus-installed ACP permission handler.
- Codex headless uses `codex exec` through a process runner and remains a batch/fallback path with thinner event semantics.

The existing ACP path is useful because it already carries provider profile binding, MCP integration, streaming, usage/session metadata, attachments, AskUserQuestion normalization, and guarded-run permission handling. The migration risk is losing those behaviors while changing package names. ACP is not the target desktop/chat surface; it is only the current compatibility path while app-server support is proven.

OpenAI's current Codex manual separates the official options:

- Codex app-server powers rich clients and is intended for deep product integration with authentication, conversation history, approvals, and streamed agent events.
- Codex SDK is intended for CI/CD, custom agents, internal tools/workflows, and integration inside applications; the TypeScript SDK is more flexible than non-interactive mode.
- `codex exec` is intended for scripts, CI, pipeline output, and explicit sandbox/approval settings.

That means the desktop/chat path should target app-server first, SDK should remain scoped to internal automation/tooling unless the matrix proves it is better for a specific non-chat use case, and headless can keep `codex exec` until a later slice proves richer parity is worth the migration.

## Goals
- Move Codex desktop/chat toward `codex app-server` as the official OpenAI-supported rich-client integration surface.
- Preserve Locus-owned external contracts: `RunRequest`, normalized run events, capability states, preflight diagnostics, provider binding metadata, cancellation, and renderer-safe payloads.
- Make adapter source visible in diagnostics and capability metadata without exposing secrets.
- Keep current ACP behavior only as a labeled temporary compatibility fallback until app-server is proven and fallback can be disabled or removed.
- Keep Claude changes limited to package-name/documentation hygiene unless a separate proposal expands Claude headless SDK work.

## Non-Goals
- No direct product-code implementation before OpenSpec approval.
- No broad runtime parity rewrite beyond the selected Codex adapter migration.
- No Claude Dynamic Workflows implementation.
- No hosted/cloud Codex task integration.
- No renderer-side credential resolution.

## Current Codex Surface
The current desktop Codex route creates an ACP provider model, installs an AskUserQuestion normalizer, merges ACP provider tools with Locus question tools, optionally installs an ACP permission handler, and streams through `streamText`.

Current behavior to preserve or explicitly rescope:

- provider profile selection and local gateway binding
- removal of inherited provider/API key env values when appropriate
- MCP config and auth readiness
- plan-mode denial before unsafe edits/commands
- guarded-run tool denial before execution
- AskUserQuestion pending/result/timeout normalization
- image and long-text attachment handling
- assistant/tool/usage/session streaming into UI chunks
- cancellation through `AbortController`
- separated runtime availability and component diagnostics

## Official Adapter Decision Matrix
Implementation MUST complete a matrix before choosing the migration target.

| Capability | Current ACP path | `@openai/codex-sdk` | `codex app-server` | Required decision |
| --- | --- | --- | --- | --- |
| Main-process provider profile binding | Existing Locus gateway path | Verify config/env/gateway support for internal automation only | Verify `thread/start`/`turn/start` config and provider model fields | Preserve for app-server or block profile runs honestly |
| Renderer-safe secret boundary | Existing main-process resolution | Verify no renderer token flow | Verify no renderer token flow | Must preserve |
| MCP startup/auth status | Existing Codex config/status handling | Verify SDK exposure | Verify `mcpServerStatus/list`, OAuth and config APIs | Must preserve or degrade honestly |
| Plan mode and guarded approvals | ACP permission handler | Verify approval callbacks | Verify server request approvals and policy fields | Must fail closed if unsupported |
| AskUserQuestion / elicitation | Locus ACP tool normalization | Verify SDK user input requests | Verify `item/tool/requestUserInput` and MCP elicitation requests | Must preserve |
| Attachments | Existing local image/long-text prompt path | Verify input item support | Verify `turn/start` input item support | Preserve supported types |
| Streaming events | Vercel UI stream normalization | Verify SDK stream shape | Verify server notifications | Normalize into existing event schema |
| Usage/context/session metadata | Existing session metadata when available | Verify thread/run metadata | Verify thread/tokenUsage notifications and thread IDs | Preserve available fields, omit unavailable |
| Resume/fork/rollback | Current rollback/fork limitations | Verify thread resume/fork/rollback | Verify `thread/resume`, `thread/fork`, `thread/rollback` | Do not mark supported without tests |
| Cancellation | Abort signal path | Verify abort/interruption | Verify `turn/interrupt` | Preserve terminal canceled event |
| Packaging | Bundled ACP packages | Add SDK and pinned runtime dependency only if internal automation requires it | Use bundled/local Codex app-server and generated schema | Pin and smoke app-server target |

## Proposed Direction
Use `codex app-server` as the desktop/chat target if the feature matrix confirms it can preserve approvals, streamed events, conversation/thread lifecycle, MCP status, and local provider binding. This matches Locus as a rich local desktop client.

Use `@openai/codex-sdk` for internal automation/tooling where programmatic workflow control is the product requirement. Do not select SDK as the desktop/chat default just because it is a library.

Keep ACP only as an explicit migration fallback when app-server cannot yet preserve a required behavior. If ACP remains during migration, product language must call it `temporary-compat`, diagnostics must include the fallback reason, and the implementation must carry a disable/remove gate.

This Codex migration depends on the cross-runtime `add-runtime-control-layer` proposal for shared Preflight, PermissionPolicy, desktop RunRequest, RunEvent, and Trace ownership. Codex app-server implementation must consume that control layer instead of rebuilding equivalent behavior inside `src/main/lib/trpc/routers/codex.ts`.

## Architecture
Add a main-process Codex adapter boundary rather than wiring official packages directly into renderer code or unrelated routers.

Expected shape after approval:

- `src/main/lib/codex/adapter-types.ts`: internal adapter contract for Codex-specific transports.
- `src/main/lib/codex/app-server-adapter.ts`: desktop/chat target implementation.
- `src/main/lib/codex/codex-sdk-adapter.ts`: optional internal automation/tooling adapter if a later use case requires it.
- `src/main/lib/codex/acp-adapter.ts`: temporary compatibility wrapper around the current ACP path if needed during migration.
- `src/main/lib/trpc/routers/codex.ts`: delegates transport-specific behavior to the selected adapter while keeping existing tRPC API stable.
- `src/shared/codex-runtime-capabilities.ts`: records adapter-specific capability states and reasons.
- `src/shared/codex-runtime-status.ts`: includes selected adapter, version, component readiness, and sanitized remediation.

The public Locus contract remains runtime-neutral. Codex internals may differ from Claude internals as long as they map back into shared run requests, events, capability states, provider binding metadata, and diagnostics.

## Versioning and Packaging
- Record the installed `@openai/codex-sdk` version and its pinned `@openai/codex` dependency only when SDK is added for internal automation/tooling.
- Record local `codex --version` and generated app-server schema version for the desktop/chat target.
- Generate app-server TypeScript or JSON schema during implementation and keep it either checked in under a clear generated path or generated in tests, depending on bundle size and stability.
- Keep Electron packaging rules explicit for any new official runtime dependency.

## Security and Local-First Boundaries
- Resolve provider profile credentials in the main process only.
- Do not send upstream tokens, gateway tokens, OAuth tokens, raw headers, or secret-bearing env values to the renderer.
- Strip inherited `CODEX_API_KEY`, `OPENAI_API_KEY`, and unrelated provider tokens from child environments when the selected provider profile uses the Locus gateway.
- Do not use raw `process.env` as the runtime environment for SDK/app-server runs. Runtime startup must build an explicit allowlisted environment.
- Prefer loopback or stdio transports. If app-server WebSocket is used, it must stay loopback-only unless explicit token authentication and a separate security review are approved.
- Fail closed when approval, permission, or guarded-run interception cannot be installed.
- Preserve local-only guards for hosted or remote paths.
- Redact all diagnostic payloads before renderer return or persistence.
- Canonicalize `cwd` to an approved local project/workspace before passing it to SDK, app-server, or `codex exec` options.

## Security Acceptance Checklist
Implementation cannot mark the app-server adapter enabled by default until these checks pass:

- Fake app-server adapter without a pre-tool approval hook fails before provider work starts.
- Fake app-server adapter with delayed approval hook installation fails before the first tool request can execute.
- Plan mode and guarded scope contracts are both enforced; satisfying one guard does not bypass the other.
- Stale host env values such as `OPENAI_API_KEY`, `CODEX_API_KEY`, `ANTHROPIC_API_KEY`, and `GITHUB_TOKEN` are absent from SDK/app-server runtime env, diagnostics, persisted events, and logs.
- Renderer requests carrying `apiKey`, `authConfig`, `env`, `headers.Authorization`, or raw provider tokens are rejected by schema or protocol guards.
- Provider profile gateway tokens remain renderer-safe and profile-scoped; cross-profile or cross-gateway token use is rejected.
- MCP env, header, OAuth, bearer, code, state, and query-token values are redacted from renderer payloads, job events, and logs.
- App-server local file, git, shell, and MCP capabilities remain local-runtime-only and do not bypass local-only policy.

## Migration Phases
1. Matrix and spike:
   - Confirm the runtime control layer proposal is approved or that equivalent owner/spec deltas are approved in the same approval bundle.
   - Generate or inspect official SDK/app-server types.
   - Prove minimal thread/run, streaming, approval request, cancellation, and provider binding behavior in tests or local smoke.
   - Prove env isolation, renderer schema rejection, gateway-token confinement, and MCP redaction behavior with fake adapters before live runtime smoke.
   - Record app-server as the desktop/chat target and define SDK/internal-automation plus ACP/migration-fallback policy.
2. Adapter introduction:
   - Add the Codex app-server adapter behind a main-process factory.
   - Keep current tRPC input/output stable.
   - Keep ACP fallback gated, labeled `temporary-compat`, and tied to a disable/remove condition.
3. Behavior preservation:
   - Port AskUserQuestion, plan mode, guarded-run, attachments, MCP readiness, usage/session metadata, cancellation, and diagnostics.
   - Update capability states only when tests prove behavior.
4. Cleanup:
   - Disable or remove ACP dependencies after app-server covers required desktop behavior.
   - Update docs and capability language to distinguish app-server adapter, temporary compatibility adapter, and headless `codex exec`.

## Risks / Mitigations
- App-server schema may not preserve one existing ACP behavior without extra protocol work.
  - Mitigation: keep ACP as a temporary fallback only for the missing behavior, emit fallback diagnostics, and keep capability truth degraded until app-server tests pass.
- App-server schema may be experimental or version-sensitive.
  - Mitigation: pin/generate schemas per bundled runtime and test protocol methods.
- Provider profile gateway may not map cleanly to app-server configuration.
  - Mitigation: block provider-profile app-server runs or keep ACP fallback until a secure main-process binding is proven.
- ACP fallback can become a permanent hidden dependency.
  - Mitigation: expose adapter source and fallback reason in diagnostics; track fallback removal as a task.
- False capability support can regress safety.
  - Mitigation: capabilities remain degraded/unsupported until adapter tests prove pre-execution enforcement.

## Open Questions
- Which internal automation/tooling scenarios actually need `@openai/codex-sdk`, instead of `codex exec` or app-server?
- Can official Codex provider configuration target the Locus loopback gateway without writing user-global Codex config during normal runs?
- Which app-server methods are stable enough for product code, and which require `experimentalApi` opt-in?
- Should generated app-server schema be committed, generated at build time, or used only in tests?
- After app-server support is proven, should ACP be disabled by default first or removed in the same release?

## Related Specs To Review During Implementation
The first proposal delta covers the main adapter and security contracts. During implementation, update archived/current specs if behavior changes in these areas:

- `codex-runtime-parity`: replace ACP-specific readiness language with app-server-specific readiness.
- `agent-runtime-capabilities`: record supported evidence per adapter source, not per runtime name only.
- `provider-runtime-bindings`: replace ACP `-c model_provider` assumptions with SDK/app-server binding semantics.
- `provider-diagnostics`: add SDK initialization, app-server handshake, schema/version, and fallback readiness checks.
- `agent-provider-profiles`: verify whether provider profiles still route through the Responses-compatible local gateway.
- `runtime-mcp-import-preview`: update apply/write boundaries if SDK/app-server changes MCP config writes.
- `agent-chat-attachments` and `agent-long-text-context`: update Codex delivery scenarios if app-server accepts structured input items instead of AI SDK parts or prompt blocks.
- `agent-scope-contracts`: remove stale audit-only language for Codex paths once app-server hard enforcement or fail-closed behavior is proven.
- `headless-agent-jobs`, `agent-protocol-interfaces`, and `desktop-agent-jobs`: update only if the migration changes headless/protocol behavior or normalized event shape.
- `usage-panel` and `runtime-security-baseline`: update if usage metadata source or secret boundaries change.
