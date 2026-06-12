# Codex App-Server Schema Evidence

Date: 2026-06-07

Provider calls: none. This evidence only uses local help and schema generation
commands.

## Runtime Inspected

- Bundled binary: `resources/bin/darwin-arm64/codex`
- Version: `codex-cli 0.134.0`
- Repo download target: `bun run codex:download` uses `--version=0.134.0`
- System binary observed separately: `/opt/homebrew/bin/codex` is
  `0.136.0-alpha.1`; do not use that as bundled-version truth.

## Commands Run

```bash
resources/bin/darwin-arm64/codex --version
resources/bin/darwin-arm64/codex app-server --help
resources/bin/darwin-arm64/codex app-server generate-json-schema --out /tmp/locus-codex-app-server-bundled.Ji26Ag/json-stable
resources/bin/darwin-arm64/codex app-server generate-json-schema --experimental --out /tmp/locus-codex-app-server-bundled.Ji26Ag/json-experimental
resources/bin/darwin-arm64/codex app-server generate-ts --out /tmp/locus-codex-app-server-bundled.Ji26Ag/ts-stable
resources/bin/darwin-arm64/codex app-server generate-ts --experimental --out /tmp/locus-codex-app-server-bundled.Ji26Ag/ts-experimental
```

Generated files were written to `/tmp` only and were not committed.

## Output Shape

- Stable TypeScript files: 539
- Experimental TypeScript files: 589
- Stable JSON Schema files: 254
- Experimental JSON Schema files: 304
- Total generated files across both formats and modes: 1686

The app-server command exposes `stdio://` by default, plus `unix://`,
`unix://PATH`, `ws://IP:PORT`, and `off`. WebSocket auth modes are
`capability-token` and `signed-bearer-token`.

The generator has explicit stable and experimental modes. `initialize`
negotiates `experimentalApi` through `InitializeCapabilities`, so adapter code
must choose the mode deliberately rather than depending on accidental fields.

## Stable Protocol Findings

The stable generated protocol includes the core rich-client surface needed for
the next matrix pass:

- Client requests include `initialize`, `thread/start`, `thread/resume`,
  `thread/fork`, `thread/rollback`, `turn/start`, `turn/steer`,
  `turn/interrupt`, `model/list`, `mcpServerStatus/list`,
  `mcpServer/oauth/login`, `config/read`, and account/auth/status methods.
- `ThreadStartParams` has `model`, `modelProvider`, `cwd`, `approvalPolicy`,
  `approvalsReviewer`, `sandbox`, `config`, base/developer instructions, and
  source metadata.
- `TurnStartParams` has `threadId`, structured `input`, `cwd`,
  `approvalPolicy`, `approvalsReviewer`, `sandboxPolicy`, `model`,
  `serviceTier`, reasoning controls, and `outputSchema`.
- `UserInput` supports `text`, `image`, `localImage`, `skill`, and `mention`.
- Server requests include `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/permissions/requestApproval`,
  `item/tool/requestUserInput`, `mcpServer/elicitation/request`,
  `item/tool/call`, auth token refresh, attestation, and legacy approval
  request forms.
- Approval responses are explicit decision payloads for command execution and
  file changes, plus granted permission profiles for permission requests.
- Notifications include thread/turn lifecycle, item events, command output,
  file-change patches, MCP tool progress, MCP OAuth completion, MCP startup
  status, token usage, model reroute/verification, warnings, and terminal
  completion/failure state.

These findings are enough to start the ACP/SDK/app-server decision matrix, but
they do not prove safety or feature parity. The app-server adapter still needs
fake-adapter fail-closed tests before any real provider run is allowed.

## Experimental Differences

Experimental generation adds process control, remote-control status, realtime
thread methods, thread search/listing details, memory mode/update APIs,
environment add APIs, fuzzy search session management, collaboration mode
listing, and other fields in thread/turn/config types.

The first app-server adapter should avoid experimental-only methods unless the
matrix records a required behavior and a separate safety decision.

## SDK Status

`@openai/codex-sdk` and `@openai/codex` are not present in `package.json` or
`bun.lock`. Task 2.1 inspected the current npm SDK package separately in
`sdk-type-inspection-evidence.md`; that SDK evidence is not app-server bundle
truth because it uses a newer npm SDK/runtime version than this 0.134.0 schema.

## Follow-Ups

- Complete the ACP, SDK, and app-server feature matrix against these generated
  protocol types.
- Add fake app-server transport tests for missing/delayed approval handler
  fail-closed behavior.
- Define the explicit app-server runtime env allowlist before any product
  adapter starts a child process.
