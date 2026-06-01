# Smoke Evidence: Codex Runtime Parity

Date: 2026-06-01

## Static and Build Verification

- `openspec validate upgrade-codex-runtime-parity --strict --no-interactive`: passed.
- `bun run test`: passed, 165 tests.
- `bun run ts:check`: passed.
- `bun run build`: passed. Build emitted the existing Browserslist/caniuse-lite age warning.
- `git diff --check`: passed.

## Runtime Availability

- `resources/bin/darwin-arm64/codex login status`: `Logged in using ChatGPT`.
- `node_modules/@zed-industries/codex-acp-darwin-arm64/bin/codex-acp --help`: started and printed usage.
- `resources/bin/darwin-arm64/codex mcp list --json`: parsed successfully. Current configured servers:
  - `computer-use`: enabled, stdio, auth unsupported.
  - `node_repl`: enabled, stdio, auth unsupported.
  - `obsidian`: enabled, streamable HTTP, bearer token auth.

## Real ACP Permission Enforcement

Command: Bun script using `@mcpc-tech/acp-ai-provider`, bundled `codex-acp`, `installCodexAcpPermissionHandler`, and `createCodexAcpPermissionHandler({ mode: "plan" })`.

Result:
- Permission handler installed: `true`.
- Prompt asked Codex to create a temp file.
- ACP emitted tool activity.
- Target file existed after the run: `false`.
- Target preview: `null`.

Environment note: Codex also reported the user's configured `obsidian` MCP server failed to start at `http://127.0.0.1:27123/mcp/`. This is real local environment evidence that MCP startup failures can occur before/around provider work and must remain surfaced by runtime status.

## Real ACP AskUserQuestion Host Tool

Command: Bun script using bundled `codex-acp`, `createCodexAskUserQuestionTools`, and a forced `acp-ai-sdk-tools/AskUserQuestion` call.

Result:
- `acp-ai-provider` created the host-side MCP proxy for `AskUserQuestion`.
- Codex started the `acp-ai-sdk-tools` MCP server.
- The Locus tool emitted `ask-user-question`.
- The script answered through the pending approval resolver.
- The Locus tool emitted `ask-user-question-result` with `{ "Choose yes or no?": "Yes" }`.
- Stream errors collected by the script: `[]`.
- Codex final text preview: `answer recorded.`

The first smoke attempt returned a structured object to the MCP proxy and Codex logged `Unexpected response type`; the implementation was adjusted to return JSON text to the tool caller while keeping structured UI result events.

## Rescoped or Degraded Surfaces

- Codex rollback/fork is not claimed as supported. Server-side fork and rollback fail closed for Codex-backed history before mutating messages, git state, or provider session state; the Codex UI path does not pass rollback/fork handlers.
- Codex MCP configuration remains degraded for project-scoped add/remove writes. Global add/remove/list and status/preflight behavior remain available.
- Codex runtime plugins, runtime commands, runtime workflows, and App Agent runtime execution remain unsupported or degraded unless a later change adds runtime-native execution paths.
