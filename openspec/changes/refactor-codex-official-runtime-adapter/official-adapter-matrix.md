# Codex Official Adapter Matrix

Status: draft, not sufficient to enable app-server by default

Provider calls: none

This matrix records current repo evidence before implementation. It is a
decision aid for task 2.3, but task 2.3 remains open until SDK type inspection,
fake app-server fail-closed tests, env allowlist tests, and redaction tests are
complete.

## Sources

- Current ACP path:
  - `src/main/lib/codex/acp-temporary-compat-adapter.ts`
  - `src/main/lib/codex/acp-adapter.ts`
  - `src/main/lib/codex/acp-runtime.ts`
  - `src/main/lib/codex/acp-text-stream.ts`
  - `src/main/lib/codex/acp-ui-stream.ts`
  - `src/main/lib/codex/acp-message-persistence.ts`
  - `src/main/lib/codex/provider-runtime-binding.ts`
- App-server schema evidence:
  - `openspec/changes/refactor-codex-official-runtime-adapter/app-server-schema-evidence.md`
- SDK evidence:
  - No `@openai/codex-sdk` or `@openai/codex` dependency is present in
    `package.json` or `bun.lock` in this repo snapshot.

## Decision Summary

| Capability | Current ACP temporary-compat path | Bundled app-server 0.134.0 schema | SDK status | Decision before implementation |
| --- | --- | --- | --- | --- |
| Adapter target | Current working desktop/chat compatibility path | Rich-client protocol exists and remains the target candidate | Not installed; not desktop/chat target | Keep app-server as target, ACP as temporary fallback |
| Provider profile binding | Existing main-process binding passes `providerProfile` into ACP provider creation and builds provider env/args in main process | `ThreadStartParams` exposes `modelProvider`, `config`, and model fields, but gateway mapping is not proven | Not inspected locally | Preserve through app-server or block profile runs honestly |
| Renderer secret boundary | Current binding is main-process only; renderer receives IDs/status/chunks | Schema accepts broad `config`; adapter must reject renderer raw secrets and build payloads itself | Not inspected locally | Add protocol guards before adapter implementation |
| Runtime env | Current ACP provider uses `buildCodexProviderEnv` with app-managed key or provider gateway token mapping | App-server startup env is outside schema and must be an explicit allowlist | Not inspected locally | Add env allowlist tests before process start |
| MCP readiness | Current path passes normalized MCP servers/fingerprint into ACP provider and has status helpers | Stable protocol exposes `mcpServerStatus/list`, `mcpServer/oauth/login`, `mcpServer/elicitation/request`, resource read, and tool call methods | Not inspected locally | Map readiness before provider work or keep blocker |
| Plan mode | Current path maps shared `PermissionPolicy` into ACP runtime model | `TurnStartParams` and `ThreadStartParams` expose approval/sandbox policy, but enforcement timing is not proven | Not inspected locally | Must fail closed if app-server approval callback cannot be installed first |
| Guarded scope | Current path installs ACP permission handling and records guard events | Server requests include command, file-change, and permission approval callbacks with thread/turn/item context | Not inspected locally | Fake adapter must prove pre-execution denial before side effects |
| AskUserQuestion | Current path registers pending question state and normalizes stream chunks | Server request includes `item/tool/requestUserInput` with structured question/answer types | Not inspected locally | Preserve pending/result/timeout/cancel semantics |
| MCP elicitation | Current path has MCP/ACP integration through provider tools and question handling | Server request includes `mcpServer/elicitation/request` with form/url modes and structured response | Not inspected locally | Normalize to runtime-neutral question events |
| Image attachments | Current path passes resolved images into ACP text stream and prompt construction | `UserInput` supports `image` and `localImage` | Not inspected locally | Preserve local-ref boundaries; reject unsupported forms preflight |
| Long-text context | Current path resolves local long-text attachments before prompt construction | Stable schema has text input and mentions; no proven large-context local-ref primitive yet | Not inspected locally | Preserve through explicit text input or block honestly |
| Streaming text/events | Current path normalizes Vercel UI stream chunks and persists semantic events through runtime control layer | Notifications include agent message delta, reasoning/plan delta, item lifecycle, command output, file changes, MCP progress, warnings, and terminal turn completion | Not inspected locally | Map to shared RunEvent before renderer/persistence |
| Usage metadata | Current path uses `createCodexUsageMetadataResolver` and session metadata where available | `thread/tokenUsage/updated` is present | Not inspected locally | Map into existing usage metadata, omit unavailable fields |
| Session metadata | Current path preserves ACP session ID and parent/resume IDs where available | `thread/start`, `thread/resume`, `thread/fork`, `thread/rollback`, `thread/read`, and loaded thread listing exist | Not inspected locally | Do not mark resume/fork/rollback supported until tested |
| Cancellation | Current path passes `AbortSignal` to stream and returns canceled terminal status | `turn/interrupt` exists | Not inspected locally | Preserve terminal canceled event and cleanup |
| Diagnostics | Current ACP path now emits adapter source/fallback reason and runtime status metadata | App-server exposes version/schema generation and app-server startup/help surfaces | Not inspected locally | Report app-server readiness separately from provider auth |
| Local-only policy | Current path depends on preflight verified cwd and local-only runtime checks | Protocol accepts cwd on thread/turn start | Not inspected locally | Consume runtime control layer preflight; never pass raw renderer cwd |

## Required Proof Before Enabling App-Server

- Schema/client pinning test for the bundled Codex runtime version.
- Fake transport test where missing approval callback fails before provider or
  tool work starts.
- Fake transport test where delayed approval callback installation fails before
  the first command, file change, MCP call, or permission escalation.
- Runtime env allowlist test that strips `OPENAI_API_KEY`, `CODEX_API_KEY`,
  `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, and unrelated host tokens.
- Renderer protocol guard tests rejecting `apiKey`, `authConfig`, `env`,
  `headers.Authorization`, gateway tokens, OAuth tokens, and raw provider
  config.
- Provider-profile gateway binding proof or an honest app-server blocker.
- MCP env/header/OAuth redaction tests for diagnostics, job events, and
  renderer chunks.
- Desktop smoke evidence after fake-adapter safety tests pass.

## Current Decision

Keep the target order unchanged:

1. `codex app-server` remains the desktop/chat target candidate.
2. The current ACP path remains `codex-acp-temporary-compat` only.
3. SDK remains out of desktop/chat until an approved internal automation use
   case and local type inspection justify adding it.
