## 1. Proposal and Approval
- [x] 1.1 Review existing runtime, provider binding, capability, and workbench specs.
- [x] 1.2 Review current OpenAI Codex SDK, app-server, and non-interactive guidance.
- [x] 1.3 Create this OpenSpec proposal, design, and spec deltas.
- [x] 1.4 Validate the OpenSpec change strictly.
- [ ] 1.5 Get approval before implementing product code.
- [ ] 1.6 Approve or pair with an approved runtime control layer OpenSpec before large Codex route/product migration begins.

## 2. Official Adapter Matrix
- [ ] 2.1 Inspect `@openai/codex-sdk` TypeScript types and runtime dependency version for internal automation/tooling only.
- [ ] 2.2 Generate or inspect `codex app-server` TypeScript/JSON schema for the Codex runtime version Locus will bundle.
- [ ] 2.3 Compare ACP, SDK, and app-server for provider profile binding, MCP, approvals, AskUserQuestion, attachments, streaming, usage/session metadata, resume/fork/rollback, cancellation, diagnostics, and local-only behavior; app-server is the desktop/chat target unless this matrix explicitly disproves it.
- [ ] 2.4 Record app-server as the desktop/chat adapter target and record SDK as internal automation/tooling only unless a separate approved use case says otherwise.
- [ ] 2.5 Define ACP as a `temporary-compat` migration fallback only, including diagnostic label, fallback reason, default-disable condition, and removal condition.
- [ ] 2.6 Prove pre-execution approval/permission interception for app-server, including fail-closed behavior when the hook is missing or delayed.
- [ ] 2.7 Prove SDK/app-server runtime startup uses an explicit env allowlist and cannot inherit stale host provider tokens.
- [ ] 2.8 Prove provider gateway tokens, MCP env/header/OAuth values, and app-server diagnostics remain renderer-safe and redacted.
- [ ] 2.9 Review related specs for capability evidence, attachments, long-text context, scope contracts, MCP import, usage metadata, jobs/protocol events, and runtime security before implementation.
- [ ] 2.10 Confirm Codex app-server work consumes the approved runtime control layer for Preflight, PermissionPolicy, desktop RunRequest, RunEvent, and Trace instead of rebuilding route-local equivalents.

## 3. Adapter Implementation
- [ ] 3.1 Add a main-process Codex adapter interface that keeps the existing renderer/tRPC API stable.
- [ ] 3.2 Implement the Codex app-server adapter behind a factory or feature flag.
- [ ] 3.3 Keep or wrap the current ACP path only as a labeled `temporary-compat` adapter until the default-disable/removal gate is reached.
- [ ] 3.4 Preserve provider-profile gateway binding without exposing secrets to renderer state, logs, diagnostics, or child-process inherited env.
- [ ] 3.5 Preserve plan-mode and guarded-run permission handling, and fail closed when app-server cannot install enforcement.
- [ ] 3.6 Preserve AskUserQuestion and MCP elicitation round trips with normalized pending/result/timeout events.
- [ ] 3.7 Preserve supported attachment types and reject unsupported attachment types before provider work starts.
- [ ] 3.8 Preserve streaming, usage/context metadata, session IDs, terminal status, and cancellation semantics where available.
- [ ] 3.9 Keep rollback/fork unsupported or degraded until official durable primitives and tests prove the behavior.
- [ ] 3.10 Preserve local-ref attachment and long-text boundaries if app-server uses structured input items instead of prompt/file parts.
- [ ] 3.11 Preserve agent scope contract hard enforcement or fail closed for every app-server run that requests guarded behavior.

## 4. Capability, Diagnostics, and UI Truth
- [ ] 4.1 Add adapter source, version, fallback reason, and ACP default-disable/removal status to renderer-safe Codex runtime status.
- [ ] 4.2 Update Codex capability states only where app-server tests prove behavior.
- [ ] 4.3 Update provider diagnostics to report app-server readiness separately from provider endpoint/auth failures; report SDK readiness only for internal automation/tooling if SDK is added.
- [ ] 4.4 Update product/documentation language so ACP is never described as the long-term official OpenAI interface.
- [ ] 4.5 Keep `codex exec` labeled as headless/batch fallback unless separately migrated.
- [ ] 4.6 Add schema/protocol guards that reject renderer-supplied raw tokens, custom env, and secret-bearing headers for app-server Codex runs.

## 5. Claude Boundary Cleanup
- [x] 5.1 Keep Claude desktop/chat on `@anthropic-ai/claude-agent-sdk`.
- [x] 5.2 Fix stale docs/comments that call `@anthropic-ai/claude-code` the SDK package when they mean CLI or Claude runtime.
- [x] 5.3 Keep Claude headless SDK migration out of this change unless a separate proposal is approved.
- [x] 5.4 Confirm `add-claude-dynamic-workflows-adapter` remains Claude-specific and does not block this Codex migration.

## 6. Verification
- [x] 6.1 Run `openspec validate refactor-codex-official-runtime-adapter --strict --no-interactive`.
- [ ] 6.2 Run focused tests for Codex adapter selection and runtime status.
- [ ] 6.3 Run focused tests for provider runtime binding and provider diagnostics.
- [ ] 6.4 Run focused tests for plan mode, guarded-run permission handling, AskUserQuestion, MCP readiness, attachments, usage/session metadata, cancellation, and fallback behavior.
- [ ] 6.5 Run security tests for fake missing/delayed permission hooks, stale env token stripping, renderer secret rejection, provider gateway token scope, and MCP diagnostic redaction.
- [ ] 6.6 Run `bun run ts:check`.
- [ ] 6.7 Run `bun run build`.
- [ ] 6.8 Record desktop smoke evidence for app-server Codex chat, guarded denial, plan-mode denial, provider-profile run binding, MCP readiness, cancellation, and fallback diagnostics.
