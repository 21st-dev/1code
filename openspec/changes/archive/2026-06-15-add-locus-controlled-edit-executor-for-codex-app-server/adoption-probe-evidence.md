# Locus Edit Adoption Probe Evidence

Date: 2026-06-12

## Scope

This probe tests whether Codex app-server will naturally call a Locus-owned
structured MCP edit tool before Locus implements a real controlled edit
executor.

The probe server is non-writing. It exposes one MCP server/tool pair:

- Server: `locus_edit`
- Tool: `propose_file_edit`

The probe records MCP JSON-RPC traffic to `locus-edit-probe-calls.jsonl` and
never writes the requested canary file.

## Harness

The smoke harness is:

- `scripts/smoke-codex-app-server-desktop.ts`
- Built to `.tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs`

The live runs used:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
LOCUS_USER_DATA_DIR=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/user-data-locus-edit-probe \
./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=locus-edit-adoption \
  --deny-shell-approvals=1 \
  --auth=provider \
  --model=deepseek-v4-flash \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me
```

`.tmp-app-server-smoke/resources` was a local-only symlink to repo
`resources/` so the Electron smoke app could resolve the bundled Codex 0.134.0
binary from its temporary app path.

Codex generated `CODEX_HOME/shell_snapshots` during the provider-backed probe
runs. Those snapshots included provider gateway environment values, so they
were removed from the evidence directories and the harness now removes
`shell_snapshots` during MCP smoke cleanup.

Production follow-up: the local-only evidence cleanup above was not sufficient
for real app-server runs because Codex can write the selected provider gateway
token into the user's production `CODEX_HOME/shell_snapshots`. A captured
temporary snapshot confirmed the shape:

```text
export LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN=<redacted>
```

The app-server adapter now scrubs Locus-injected Codex secrets from
`shell_snapshots` before app-server startup and again after transport shutdown.
The scrubber covers both provider-profile
`LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN` and app-managed `CODEX_API_KEY`, resolves
`CODEX_HOME/shell_snapshots` or `HOME/.codex/shell_snapshots`, skips symlinks
and large files, removes any line containing the secret env names, and redacts
exact selected secret values if they appear outside the env assignment line.

Verification:

```bash
/opt/homebrew/bin/bun test tests/codex-app-server-shell-snapshots.test.ts
/opt/homebrew/bin/bun test tests/codex-app-server-adapter.test.ts
PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/bun run ts:check
```

Result: `codex-app-server-shell-snapshots` 3/3 passed,
`codex-app-server-adapter` 31/31 passed, and `tsc --noEmit` passed. The adapter
test creates a stale pre-run snapshot and a runtime snapshot written during
`turn/start`; both are scrubbed so neither the env name nor
`gateway-token-selected` remains after the run.

## Prompt Tiers

- `zero`: natural file creation request only. The prompt does not name MCP,
  `locus_edit`, shell, or patch formats.
- `light`: natural file creation request plus a generic hint to use an
  available structured file-editing tool instead of shell commands. The prompt
  still does not name `locus_edit`.
- `explicit`: diagnostic-only prompt that names `locus_edit` and
  `propose_file_edit`. This tier does not count as adoption proven.

An earlier invalid dry run without `--deny-shell-approvals=1` wrote the canary
through the existing bounded shell approval path. That run is discarded as an
adoption signal because the probe did not keep shell writes denied.

## Results

### Provider-profile gateway path

| Tier | Artifact | Job | Result |
| --- | --- | --- | --- |
| zero | `.tmp-app-server-smoke/evidence/locus-edit-adoption-zero-deny-shell/locus-edit-adoption.json` | `mqapwdoexuq3atly` | No adoption. MCP ready with `serverCount: 1`, `readyServerCount: 1`, `serverNames: ["locus_edit"]`; `locusEditToolCallCount: 0`; canary not written. |
| light | `.tmp-app-server-smoke/evidence/locus-edit-adoption-light-deny-shell/locus-edit-adoption.json` | `mqapxfge18t2k21l` | No adoption. MCP ready with `serverCount: 1`, `readyServerCount: 1`, `serverNames: ["locus_edit"]`; `locusEditToolCallCount: 0`; canary not written. |
| explicit | `.tmp-app-server-smoke/evidence/locus-edit-adoption-explicit-deny-shell/locus-edit-adoption.json` | `mqapzonj9ec8oihk` | No adoption even when named. MCP ready with `serverCount: 1`, `readyServerCount: 1`, `serverNames: ["locus_edit"]`; `locusEditToolCallCount: 0`; canary not written. |

MCP server logs confirm Codex initialized the server and requested tool lists,
but never called the tool:

| Tier | MCP log | Observed MCP methods |
| --- | --- | --- |
| zero | `.tmp-app-server-smoke/evidence/locus-edit-adoption-zero-deny-shell/locus-edit-probe-calls.jsonl` | `initialize`, `notifications/initialized`, `tools/list`; no `tools/call` |
| light | `.tmp-app-server-smoke/evidence/locus-edit-adoption-light-deny-shell/locus-edit-probe-calls.jsonl` | `initialize`, `notifications/initialized`, `tools/list`, resource list probes; no `tools/call` |
| explicit | `.tmp-app-server-smoke/evidence/locus-edit-adoption-explicit-deny-shell/locus-edit-probe-calls.jsonl` | `initialize`, `notifications/initialized`, `tools/list`, resource list probes; no `tools/call` |

The explicit run is the most diagnostic. The model reasoned that the
`locus_edit` server existed and that the server file contained a
`propose_file_edit` handler, but it reported that the tool was not available as
a callable function and continued trying shell/apply_patch paths. The MCP log
confirms no `tools/call` occurred.

### Direct ChatGPT app-server path

The provider-profile result is not an app-server-wide failure. A follow-up
direct-auth run copied the local Codex ChatGPT auth files into an isolated
temporary `CODEX_HOME`, kept shell writes denied, and used the same non-writing
`locus_edit` MCP server.

| Tier | Artifact | Job | Result |
| --- | --- | --- | --- |
| zero | `.tmp-app-server-smoke/evidence/locus-edit-adoption-direct-chatgpt-zero/locus-edit-adoption.json` | `mqar6cjcbg9kppvu` | No adoption. MCP ready with `serverNames: ["codex_apps", "locus_edit"]`; `locusEditToolCallCount: 0`; canary not written. |
| light | `.tmp-app-server-smoke/evidence/locus-edit-adoption-direct-chatgpt-light/locus-edit-adoption.json` | `mqar6cj9lvag44df` | Adoption proven. MCP ready with `serverNames: ["codex_apps", "locus_edit"]`; `locusEditAdoptionClass: "light-hint"`; `locusEditToolCallCount: 1`; proposed `operation: "create"` with the expected relative path and content; canary not written by the probe. |
| explicit | `.tmp-app-server-smoke/evidence/locus-edit-adoption-direct-chatgpt-explicit-2/locus-edit-adoption.json` | `mqar5lvbumggisx1` | Diagnostic surfacing passed. MCP ready with `serverNames: ["codex_apps", "locus_edit"]`; `locusEditAdoptionClass: "explicit-tool-name-only"`; `locusEditToolCallCount: 1`; canary not written by the probe. |

This isolates the original failure to the provider-profile/gateway path rather
than to the app-server MCP mechanism itself. Direct ChatGPT app-server runs can
surface and call the Locus MCP edit tool. The provider-profile gateway path still
does not surface the same tool to the model.

### Codex CLI comparison

The same MCP server was also tested through bundled `codex exec` with inherited
Codex auth:

- Artifact: `.tmp-app-server-smoke/evidence/codex-cli-locus-edit-explicit-3/codex-cli-locus-edit.json`
- Result: `codexMcpToolCallEventCount: 2` in Codex JSONL, proving the model
  received `locus_edit.propose_file_edit` as a callable MCP tool.
- The MCP server did not receive a `tools/call` because non-interactive
  `codex exec` marked the call as cancelled by the user. That is a CLI approval
  behavior, not a tool-surfacing failure.

Secret scan after removing `shell_snapshots`:

```bash
rg -n "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN=[A-Za-z0-9._~+/=-]+|Bearer [A-Za-z0-9._~+/=-]+|(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{12,}|locus-edit-probe-secret-[A-Za-z0-9_-]+|smoke-mcp-secret-[A-Za-z0-9_-]+" \
  openspec/changes/add-locus-controlled-edit-executor-for-codex-app-server \
  .tmp-app-server-smoke/evidence/locus-edit-adoption-zero-deny-shell \
  .tmp-app-server-smoke/evidence/locus-edit-adoption-light-deny-shell \
  .tmp-app-server-smoke/evidence/locus-edit-adoption-explicit-deny-shell
```

Result: no matches.

The direct-auth and CLI comparison artifacts were also cleaned by removing
temporary `auth.json`, `installation_id`, `sessions`, `shell_snapshots`, plugin
cache, and other Codex runtime cache directories from their isolated
`CODEX_HOME` directories. The same strict scan over the direct-auth and CLI
comparison artifacts returned no matches.

## Conclusion

At this stage, adoption was split by auth/provider path:

- Provider-profile gateway path: adoption was not proven. The gateway path
  found MCP tools but did not surface `locus_edit` as a callable model tool.
- Direct ChatGPT app-server path: light-hint adoption is proven. The model
  called `locus_edit.propose_file_edit` with structured edit intent while shell
  writes were denied.
- Bundled `codex exec` comparison: the model also emitted an MCP tool-call event,
  confirming the MCP tool is generally callable outside the provider-profile
  gateway path.

The controlled edit executor could proceed for direct ChatGPT/app-managed
app-server dogfood, while provider-profile gateway support remained degraded
until the gateway preserved or translated non-shell tool definitions. Later
evidence below supersedes the provider-profile degraded conclusion after the
gateway namespace-tool translation fix.

## Executor Fake-Transport Evidence

Date: 2026-06-12

The first productive executor uses app-server native `dynamicTools` and
handles `item/tool/call` in the desktop adapter. It does not launch a
write-capable MCP subprocess for filesystem writes.

Implemented owner:

- `src/main/lib/codex/app-server-controlled-edit.ts`

Gate and path split:

- Explicit gate: `LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR=1`
- Tool advertised only for direct/app-managed/runtime-managed Codex app-server
  guarded runs with an approved scope contract.
- Provider-profile gateway runs do not receive the dynamic tool because the
  gateway path has not proven non-shell tool surfacing.

Focused verification:

```bash
/opt/homebrew/bin/bun test \
  tests/codex-app-server-adapter.test.ts \
  tests/codex-app-server-approval.test.ts
```

Result: 37 pass, 0 fail.

Type verification:

```bash
PATH=/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node_modules/.bin/tsc --noEmit
```

Result: pass.

Fake-transport coverage added:

- dynamic tool spec is advertised only for gated direct guarded runs.
- provider-profile gateway runs do not advertise the controlled edit dynamic
  tool.
- approved `create` calls write the file from the main process after
  AskUserQuestion approval.
- out-of-scope calls fail closed before approval and do not write.
- user-denied calls fail closed and do not write.
- malformed calls fail closed before approval and do not write.
- stale `replace` calls fail closed before approval and do not write.
- timed-out approvals fail closed and do not write.

The remaining proof items below were completed after the fake-transport slice:
real desktop app-server smoke proved the direct ChatGPT guarded dynamic tool
reaches the filesystem, and real UI dogfood proved the guarded composer flow can
complete a productive controlled edit.

## Executor Real Desktop Evidence

Date: 2026-06-12

The real desktop smoke used the bundled Codex app-server 0.134.0 binary through
the desktop Electron harness with the controlled edit executor enabled:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
LOCUS_USER_DATA_DIR=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/user-data-controlled-edit \
PATH=/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/opt/homebrew/bin:$PATH \
./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=controlled-edit \
  --deny-shell-approvals=1 \
  --auth=chatgpt \
  --model=gpt-5.5 \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/controlled-edit-direct-chatgpt \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me
```

Artifact:

- `.tmp-app-server-smoke/evidence/controlled-edit-direct-chatgpt/controlled-edit.json`

Result:

- Job: `mqasmofk19z01f3o`
- Status: `succeeded`
- Auth/model: direct ChatGPT, `gpt-5.5`
- `controlledEditExecutor: true`
- `appServerExperimentalApi: true`
- `applyPatchExperimentalApi: false`
- `askUserQuestionCount: 1`
- `controlledEditApprovalQuestionCount: 1`
- `commandApprovalQuestionCount: 0`
- `fileChangeApprovalQuestionCount: 0`
- `structuredFileChangeChunkCount: 2`
- Approval header: `Apply edit`
- Canary path: `.tmp-app-server-smoke/evidence/controlled-edit-direct-chatgpt/canary-controlled-edit.txt`
- Canary content: `LOCUS_CONTROLLED_EDIT_OK_20260612\n`

This proves the direct ChatGPT app-server path can surface the Locus-owned
dynamic edit tool, route the tool call through the approval bridge, require an
AskUserQuestion approval, avoid shell approval, and write through the main
process after approval.

## Executor Real UI Dogfood Evidence

Date: 2026-06-12

The dev desktop app was launched with:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR=1 \
PATH=/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/opt/homebrew/bin:$PATH \
/opt/homebrew/bin/bun run dev
```

UI conditions:

- Workspace: `agent-code-for-me`
- Runtime: Codex app-server, direct ChatGPT auth
- Mode: Agent
- Guard: enabled with an approved guarded run scope
- Model: `GPT-5.5`

Two real UI canary tasks were submitted through the composer without naming the
internal `locus_edit.propose_file_edit` tool:

| Job | Result | Canary |
| --- | --- | --- |
| `mqasvchpv8gygmm2` | `succeeded`; runId `3bf4d3ee-16be-4c54-a783-6e37cc5f9b6c`; adapterSource `codex-app-server`; persisted `file-change-diff` and assistant text delta events | `.tmp-app-server-dogfood/ui-controlled-edit/canary.txt` = `UI_APP_SERVER_CONTROLLED_EDIT_UI_OK_20260612\n` |
| `mqat2bys2haq8oj4` | `succeeded`; runId `7b9ca63d-2d89-4011-bbe1-f909d418c32b`; adapterSource `codex-app-server`; persisted `file-change-diff` and assistant text delta events | `.tmp-app-server-dogfood/ui-controlled-edit-approval/canary.txt` = `UI_APP_SERVER_CONTROLLED_EDIT_APPROVAL_OK_20260612\n` |

The UI dogfood proves the visible guarded Codex app-server flow can complete a
productive controlled edit and reach the filesystem in a real app session. The
polling run did not capture a separate screenshot of the transient per-edit
approval card; the approval bridge's AskUserQuestion requirement remains
covered by fake-transport tests and the scripted desktop smoke above, while the
UI dogfood covers the renderer/composer/runtime/filesystem path.

At this point provider-profile gateway remained degraded for controlled edit and
general non-shell tool use because its adoption probes found MCP tools with
`tools/list` but did not surface them as callable model tools. Later evidence
below supersedes this after the gateway namespace-tool translation fix.

## Post-Review Hardening

Date: 2026-06-12

Security review follow-up added apply-time content stale detection:

- prepare still validates scope, target type, operation, optional
  `expected_previous_content`, and builds the diff before approval.
- apply now re-validates the target path and re-reads the current target
  content after user approval but before writing.
- if a `create` target appears, a `replace` target disappears, the target stops
  being a regular file, or the content differs from the prepare-time snapshot,
  the executor fails closed and does not write.

Focused regression:

```bash
/opt/homebrew/bin/bun test \
  tests/codex-app-server-adapter.test.ts \
  tests/codex-runtime-capabilities.test.ts \
  tests/provider-gateway-scope.test.ts \
  tests/provider-profile-transforms.test.ts
```

Result: 58 pass, 0 fail.

New coverage includes an approval-window race where the file is changed between
diff rendering and approval; the dynamic tool response is `success:false` and
the executor preserves the external file content.

Capability truth was also tightened. App-server `hardToolGuard` is now
auth-context aware:

- `runtime-managed` and `app-managed`: `supported`, backed by direct/app-managed
  desktop and UI controlled-edit evidence.
- unknown app-server context: `degraded`, because consumers without auth-path
  context must not present gateway support as proven.
- `provider-profile`: initially `degraded`, because the gateway path had not
  yet proven non-shell tool surfacing. Later gateway trace and productive smoke
  evidence below upgrades this context to supported.

## Provider Gateway Tool Trace Diagnostic

Date: 2026-06-12

Added an env-gated provider gateway diagnostic:

- Env: `LOCUS_PROVIDER_GATEWAY_TOOL_TRACE_PATH`
- Output: JSONL payload summaries for incoming gateway requests and forwarded
  upstream requests.
- Recorded fields: phase, endpoint kind, upstream protocol, profile id/protocol,
  model, stream flag, tool count, tool types/names, whether schemas are present,
  input item kinds, and message roles.
- Excluded fields: prompt text, message content, provider tokens, gateway
  tokens, headers, and raw request bodies.

Focused test:

- `tests/provider-gateway-scope.test.ts` starts a fake upstream, sends a
  Responses request with both a standard `type:"function"` tool and a
  `type:"namespace"` tool through the provider-profile gateway, and verifies:
  - incoming trace has one `propose_file_edit` function tool.
  - incoming trace also records the namespace `mcp__locus_edit__` with nested
    `propose_file_edit`.
  - forwarded OpenAI chat completion body still has the plain
    `propose_file_edit` function tool.
  - forwarded OpenAI chat completion body also has the flattened
    `mcp__locus_edit__propose_file_edit` function tool.
  - fake upstream receives `/v1/chat/completions` with both tool definitions.
  - trace output does not contain prompt text or the gateway token.

Conclusion:

- The shared Responses-to-chat transform and provider gateway forwarding path
  preserve standard Responses function tools and flatten Responses namespace
  tools into callable chat functions.
- The live trace below proves the original provider-profile adoption failure was
  a namespace-tool conversion drop, not missing app-server MCP/tool discovery.

Attempted live provider-profile trace:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
LOCUS_PROVIDER_GATEWAY_TOOL_TRACE_PATH=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/gateway-tool-trace-provider/gateway-tool-trace.jsonl \
PATH=/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/opt/homebrew/bin:$PATH \
./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=locus-edit-adoption \
  --deny-shell-approvals=1 \
  --auth=provider \
  --model=deepseek-v4-flash \
  --adoption-tier=light \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/gateway-tool-trace-provider \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me
```

This did not produce a valid live trace because the Electron launch hit an
existing Locus single-instance lock and exited before any provider request was
made. The generated directory only contains the isolated `CODEX_HOME` config
and probe MCP server, not a `gateway-tool-trace.jsonl` or
`locus-edit-adoption.json` evidence file. Do not treat this attempted live run
as provider-path proof.

## Provider Gateway Namespace Tool Fix

Date: 2026-06-12

Root cause from live trace:

- Incoming app-server Responses payload contained 14 tools, including
  `type:"namespace", name:"mcp__locus_edit__"` with nested
  `propose_file_edit`.
- Forwarded OpenAI chat payload previously contained only 11 plain function
  tools and dropped the namespace tools.
- Therefore the provider-profile failure was in the gateway
  Responses-to-chat conversion: it preserved standard `type:"function"` tools
  but dropped `type:"namespace"` tools such as MCP and dynamic-tool namespaces.

Implementation:

- `responsesToChatCompletionsWithToolMappings` now flattens namespace tools to
  OpenAI chat function names such as
  `mcp__locus_edit__propose_file_edit` or
  `locus_edit__propose_file_edit`.
- `chatCompletionToResponse` and the streaming Responses bridge map returned
  flattened function names back to Responses `function_call` items with the
  original `namespace` and nested tool `name`.
- Gateway trace summaries now include nested namespace tool names while still
  excluding prompt text, headers, provider tokens, gateway tokens, and raw
  bodies.

Focused regression:

```bash
/opt/homebrew/bin/bun test \
  tests/codex-app-server-adapter.test.ts \
  tests/codex-runtime-capabilities.test.ts \
  tests/provider-gateway-scope.test.ts \
  tests/provider-profile-transforms.test.ts
```

Result after namespace-tool fix and provider-profile gate update:

- 60 pass, 0 fail.

Live provider-profile adoption trace:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
LOCUS_PROVIDER_GATEWAY_TOOL_TRACE_PATH=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/gateway-tool-trace-provider-live-flat/gateway-tool-trace.jsonl \
PATH=/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/opt/homebrew/bin:$PATH \
./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=locus-edit-adoption \
  --deny-shell-approvals=1 \
  --auth=provider \
  --model=deepseek-v4-flash \
  --adoption-tier=light \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/gateway-tool-trace-provider-live-flat \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me
```

Result:

- `authMode`: `provider`
- `model`: `deepseek-v4-flash`
- `locusEditAdoptionClass`: `light-hint`
- `locusEditAdoptionProven`: `true`
- `locusEditToolCallCount`: `3`
- `askUserQuestionCount`: `9`
- `commandApprovalQuestionCount`: `6`
- `canaryExists`: `false`, as expected for the non-writing probe.

Trace proof:

- `gateway-tool-trace.jsonl`: 28 entries.
- Incoming payload: 14 tools, including
  `mcp__locus_edit__` with nested `propose_file_edit`.
- Forwarded payload: 17 tools, including
  `mcp__locus_edit__propose_file_edit`.

Live provider-profile productive controlled-edit smoke:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
LOCUS_PROVIDER_GATEWAY_TOOL_TRACE_PATH=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/controlled-edit-provider-gateway/gateway-tool-trace.jsonl \
PATH=/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/opt/homebrew/bin:$PATH \
./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=controlled-edit \
  --deny-shell-approvals=1 \
  --auth=provider \
  --model=deepseek-v4-flash \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/controlled-edit-provider-gateway \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me
```

Result:

- `jobId`: `mqaux5qo2dhcpe5g`
- `jobStatus`: `succeeded`
- `authMode`: `provider`
- `model`: `deepseek-v4-flash`
- `controlledEditExecutor`: `true`
- `appServerExperimentalApi`: `true`
- `canaryExists`: `true`
- `canaryContent`: `LOCUS_CONTROLLED_EDIT_OK_20260612`
- `askUserQuestionCount`: `2`
- `commandApprovalQuestionCount`: `1`
- `controlledEditApprovalQuestionCount`: `1`
- `structuredFileChangeChunkCount`: `2`
- `approvalQuestionHeaders`: `Run command`, `Apply edit`

Trace proof:

- Incoming payload: 26 tools, including dynamic-tool namespace `locus_edit`
  with nested `propose_file_edit`.
- Forwarded payload: 202 tools, including
  `locus_edit__propose_file_edit`.

Secret scan over the trace/evidence files:

```bash
rg -n "locus-edit-probe-secret|LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN|Bearer [A-Za-z0-9]|secret prompt text must not be traced|provider-token-secret|x-extra-secret" \
  .tmp-app-server-smoke/evidence/gateway-tool-trace-provider-live-flat/gateway-tool-trace.jsonl \
  .tmp-app-server-smoke/evidence/gateway-tool-trace-provider-live-flat/locus-edit-adoption.json \
  .tmp-app-server-smoke/evidence/gateway-tool-trace-provider-live-flat/locus-edit-probe-calls.jsonl \
  .tmp-app-server-smoke/evidence/controlled-edit-provider-gateway/gateway-tool-trace.jsonl \
  .tmp-app-server-smoke/evidence/controlled-edit-provider-gateway/controlled-edit.json
```

Result: no matches.

Capability truth after this proof:

- `runtime-managed`, `app-managed`, and `provider-profile`: `supported` for
  app-server `hardToolGuard`, still behind the explicit controlled-edit
  executor gate.
- unknown app-server auth context: `degraded`, because consumers without
  auth-path context must not inherit provider-path proof.
