# Change: Refactor Codex official runtime adapter

## Why
The current Codex desktop/chat path is built on ACP packages (`@mcpc-tech/acp-ai-provider` plus bundled `@zed-industries/codex-acp`). That path works today, but it is not the official long-term OpenAI integration surface documented for product integrations.

OpenAI documents two official programmatic surfaces that matter here: Codex SDK for application and workflow integration, and Codex app-server for rich clients that need authentication, conversation history, approvals, and streamed agent events. Locus needs an approved migration plan before it replaces the current ACP desktop/chat adapter with an app-server-first path and limits ACP to a temporary compatibility fallback.

## What Changes
- Add an explicit Codex adapter decision gate that compares the current ACP path against `@openai/codex-sdk` and `codex app-server`, with `codex app-server` as the desktop/chat target candidate and SDK scoped to internal automation/tooling unless the matrix proves otherwise.
- Require a feature matrix before implementation for provider-profile binding, MCP, approvals/permissions, AskUserQuestion, attachments, streaming, usage/context metadata, session resume/fork/rollback, cancellation, diagnostics, and local-only behavior.
- Introduce the Codex app-server adapter behind the existing main-process runtime boundary only after the matrix proves behavior can be preserved or explicitly rescoped.
- Keep the external Locus run/event/capability schema stable while allowing Codex and Claude adapter internals to remain runtime-specific.
- Treat `add-runtime-control-layer` as the cross-runtime prerequisite for Preflight, PermissionPolicy, desktop RunRequest, RunEvent, and Trace before large Codex route/product migration begins.
- Keep `codex exec` as the headless/batch path unless a later phase proves Codex SDK is worth using for richer headless/internal automation control.
- Clean up Claude SDK/package wording separately from this Codex migration; do not refactor Claude desktop/chat as part of this change.

## Impact
- Affected specs:
  - `codex-runtime-parity`
  - `agent-runtime-core`
  - `agent-runtime-capabilities`
  - `provider-runtime-bindings`
  - `provider-diagnostics`
  - `agent-chat-attachments`
  - `agent-long-text-context`
  - `agent-scope-contracts`
- Affected code after approval:
  - `package.json`, `bun.lock`
  - `src/main/lib/trpc/routers/codex.ts`
  - `src/main/lib/codex/**`
  - `src/main/lib/headless/adapters/codex.ts`
  - `src/main/lib/agent-runtime/**`
  - `src/shared/codex-runtime-capabilities.ts`
  - `src/shared/codex-runtime-status.ts`
  - `src/shared/chat-attachment-capabilities.ts`
  - `src/main/lib/chat-attachments.ts`
  - `src/main/lib/long-text-attachments.ts`
  - `src/main/lib/agent-guard/**`
  - `tests/codex-*.test.ts`
  - `tests/provider-runtime-binding.test.ts`
  - `tests/provider-profile-diagnostics.test.ts`
  - `tests/agent-runtime-capabilities.test.ts`
  - `tests/rich-chat-attachments-pipeline.test.ts`
  - `tests/long-text-send-pipeline.test.ts`
  - `tests/agent-guard-runtime-pipeline.test.ts`
- Validation:
  - `openspec validate refactor-codex-official-runtime-adapter --strict --no-interactive`
  - focused tests for Codex adapter selection, permission handling, provider binding, MCP readiness, attachments, streaming/event normalization, usage/session metadata, cancellation, and diagnostics
  - desktop smoke proving the app-server adapter path cannot bypass guarded-run or plan-mode enforcement

## Non-Goals
- Do not implement product code before this proposal is approved.
- Do not bypass the approved runtime control layer when implementing Codex app-server desktop/chat migration.
- Do not claim the ACP path is official OpenAI long-term support unless OpenAI documents it as such.
- Do not keep ACP as a final completion target. It may remain only as a labeled migration fallback until the app-server path preserves required behavior, disables fallback by default, or a rescope is approved.
- Do not migrate Claude desktop/chat away from `@anthropic-ai/claude-agent-sdk`.
- Do not implement Claude Dynamic Workflows or Codex workflow parity in this change.
- Do not expose provider secrets, gateway tokens, OAuth tokens, raw headers, or secret-bearing env values to the renderer.
