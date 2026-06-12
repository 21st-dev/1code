# 6.8 Desktop Smoke Evidence

Date: 2026-06-12
Branch: `codex/codex-app-server-migration`
Bundled Codex runtime: `resources/bin/darwin-arm64/codex --version` -> `codex-cli 0.134.0`

Local artifacts are intentionally not committed because they include a large
screen recording, generated schema files, temporary Codex homes, and raw
runtime transcripts. The retained local artifact root is
`.tmp-app-server-smoke/`. Later dogfood runs also wrote ignored artifacts under
`.tmp-app-server-dogfood/`.

Screen recording:

- `.tmp-app-server-smoke/6.8-app-server-smoke.mov`
- Size observed after capture: 2.3 GB

Reusable desktop smoke helper:

- `scripts/smoke-codex-app-server-desktop.ts`
- The helper accepts `--profile=<id>` or automatically selects the first local
  Codex-targeted provider profile with a stored token.

## Commands

Protocol support probe:

```bash
resources/bin/darwin-arm64/codex app-server --help
```

Direct stdio initialize probe:

```bash
CODEX_HOME=.tmp-app-server-smoke/codex-home-probe \
  resources/bin/darwin-arm64/codex app-server --listen stdio://
```

Desktop app-server smoke runs:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron smoke-codex-app-server-desktop.cjs \
  --scenario=provider-plan \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop

LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron smoke-codex-app-server-desktop.cjs \
  --scenario=plan-denial \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop

LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron smoke-codex-app-server-desktop.cjs \
  --scenario=guarded-approve \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop

LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron smoke-codex-app-server-desktop.cjs \
  --scenario=cancel \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop
```

ACP fallback diagnostic run with the app-server gate disabled:

```bash
./node_modules/.bin/electron smoke-codex-app-server-desktop.cjs \
  --scenario=provider-plan \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-acp-fallback
```

The helper was bundled for Electron execution with:

```bash
bun build scripts/smoke-codex-app-server-desktop.ts \
  --target=node \
  --format=cjs \
  --external electron \
  --external better-sqlite3 \
  --external node-pty \
  --external jsonc-parser \
  --define 'import.meta.env={}' \
  --outfile smoke-codex-app-server-desktop.cjs
```

## Results

| Scenario | Evidence | Result |
| --- | --- | --- |
| Bundled app-server stdio protocol | `.tmp-app-server-smoke/protocol/initialize.json` | Passed. `codex app-server --listen stdio://` accepted newline JSON and returned `userAgent` for `0.134.0`. |
| Direct thread/turn probe | `.tmp-app-server-smoke/protocol/thread-turn.json` | Passed transport/session setup, then failed at isolated auth with `401 Missing bearer/basic authentication`. This proves the protocol path before provider auth. |
| Provider-profile binding through desktop route | `.tmp-app-server-smoke/evidence/desktop-provider-rich-text/provider-plan.json`, job `mqahvugfwj1tsfdg` | Passed. The real Electron/tRPC route persisted `adapterSource: codex-app-server`, `jobStatus: succeeded`, produced 14 `text-delta` chunks, and reconstructed `textContent: "LOCUS_PROVIDER_TEXT_DELTA_OK_20260612"`. This proves the provider-profile gateway returned real completion content rather than a 401/empty response. |
| Plan-mode denial | `.tmp-app-server-smoke/evidence/desktop/plan-denial.json`, job `mq9vqrpt35vyq72p` | Passed. The product route ran with `adapterSource: codex-app-server`, plan enforcement, text deltas saying the command was rejected, and no canary file was created. |
| Guarded denial | `.tmp-app-server-smoke/evidence/desktop/guarded-approve.json`, job `mq9vru7rdrlncl8k` | Passed for denial only. The guard emitted two blocked `Bash` events, persisted `guard_decision` events, and no canary file was created. |
| Guarded approve-and-edit | `.tmp-app-server-smoke/evidence/desktop/guarded-approve.json`, job `mq9vru7rdrlncl8k` | Not passed. The model attempted shell commands that the scope guard rejected before an app-server approval prompt surfaced. No `ask-user-question` chunk appeared, no approval response was exercised, and no file was written. |
| Cancellation | `.tmp-app-server-smoke/evidence/desktop/cancel.json`, job `mq9vtlpbaecfsvst` | Passed. The desktop route issued cancel, job status became `canceled`, and the terminal error was `Desktop Codex chat stream was canceled.` |
| MCP readiness | `.tmp-app-server-smoke/evidence/desktop-mcp-readiness/mcp-readiness.json`, job `mqagb08gu6j9836k` | Passed. The smoke created an isolated `CODEX_HOME` with a real stdio MCP server, passed that config path through the app-server runtime env allowlist, queried `mcpServerStatus/list`, and recorded `serverCount: 1`, `readyServerCount: 1`, `serverNames: ["locus_smoke_mcp"]`, `authStatuses: ["unsupported"]`. The fake MCP secret was redacted from the evidence artifact. |
| ACP fallback diagnostics | `.tmp-app-server-smoke/evidence/desktop-acp-fallback/provider-plan.json`, job `mq9vuialcuki6c3k` | Passed for fallback source/diagnostic labeling. With the app-server gate disabled, the route selected `codex-acp-temporary-compat`, `temporaryFallback: true`, and the recorded fallback/default-disable/removal conditions. The ACP run itself failed on model availability, which is separate from fallback-source selection. |

## Follow-Up Guarded Approval Probe

After the initial partial smoke, the permission-policy owner was updated so
Codex app-server guarded runs map to native `approvalPolicy: "untrusted"` while
normal app-server agent runs remain `on-request`. The app-server approval bridge
also gained a narrow guarded-shell approval path for bounded shell file writes
that resolve entirely inside the approved editable scope; these commands still
require an explicit user approval response before the adapter returns `accept`.
The bounded-shell classifier now lives in the canonical agent-guard owner as
`resolveGuardedScopedShellWriteApproval`, not as an adapter-local parser. It
rejects shell-expanded path forms (`$`, `~`, glob/braces, redirection metachars,
command substitution, pipes, semicolons, and unbounded `&`) before any user
approval prompt is emitted. Its public return type also carries
`requiresUserApproval: true`, so consumers cannot treat the guard-owned
bounded-shell classification as an unconditional execute allow without
discarding an explicit machine-readable contract.

Focused verification:

```bash
bun test tests/codex-app-server-approval.test.ts \
  tests/codex-app-server-adapter.test.ts \
  tests/agent-runtime-permission-policy.test.ts

bun run ts:check
```

Observed result: 29 focused tests passed and TypeScript check passed.

Real desktop guarded follow-up:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron smoke-codex-app-server-desktop.cjs \
  --scenario=guarded-approve \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-fix2
```

Artifact:

- `.tmp-app-server-smoke/evidence/desktop-fix2/guarded-approve.json`
- job `mq9wuguuf6ek3tt0`

Result:

- `runtimeMapping.appServerApprovalPolicy` was `untrusted`.
- `askUserQuestionCount` was `5`, proving the app-server approval bridge was
  reached on the real desktop path.
- persisted events included `question_pending` and `question_result` with
  `result: "approved"`.
- allowed guard events were emitted for scoped shell file operations.
- the canary file still was not created, so approved execution remains
  unproven.

This changes the guarded blocker from "approval bridge unreachable" to
"approval bridge reachable, approved execution/canary still not proven." 6.8
must remain unchecked until an approved action reaches the filesystem.

Follow-up retry on 2026-06-12:

- schema inspection confirmed `item/commandExecution/requestApproval` accepts
  `{ "decision": "accept" }` for approval, matching the adapter response shape.
- the raw product transcript for job `mq9wuguuf6ek3tt0` includes a complete
  scoped write command:
  `mkdir -p .../desktop-fix2 && echo 'app-server-desktop-approved-edit' > .../canary-guarded-approve.txt`.
  The guard emitted `allowed`, the desktop bridge emitted
  `question_pending`, and the user response was recorded as
  `question_result: approved`.
- the canary file still did not exist after that approved write command.
- a direct app-server protocol probe with `approvalPolicy: "untrusted"` also
  completed successfully but produced no filesystem canary. That probe's raw
  item stream contained only user/assistant messages and no tool approval
  request, so it is diagnostic evidence rather than a substitute for the
  product-route smoke.

The remaining guarded blocker is therefore specifically "approved app-server
tool execution reaches the filesystem", not approval response shape, not bridge
reachability, and not policy mapping.

Second follow-up on 2026-06-12:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=guarded-approve \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-structured-edit
```

Artifacts:

- `.tmp-app-server-smoke/evidence/desktop-structured-edit/guarded-approve.json`
- job `mqacq9t4i3tcjxpr`

Result:

- `jobStatus` was `succeeded`.
- `canaryExists` was `true`.
- `canaryContent` was `app-server-desktop-approved-edit\n`.
- `askUserQuestionCount` was `4`.
- `approvalQuestionHeaders` were all `Run command`.
- guard events included a scoped shell write approval for
  `printf 'app-server-desktop-approved-edit\n' > .../canary-guarded-approve.txt`.

This proves the remaining guarded approve-and-edit execution requirement for
the bounded app-server shell approval path: policy allowed a scoped write, the
desktop bridge returned approval, app-server executed it, and the filesystem
canary was created.

Follow-up hardening after review moved the bounded scoped shell-write
classification into `src/main/lib/agent-guard/decision.ts` and kept
`decideClaudeToolUse` unchanged. That means ACP/Claude guarded shell writes
remain denied unless they are read-only or approved success checks, while the
Codex app-server bridge may use the guard-owned classifier only because it has a
second explicit user-approval gate before returning `accept`. The classifier
returns `requiresUserApproval: true`, and the app-server bridge checks that flag
before it treats the policy result as eligible for a user approval prompt.

Strict structured-edit probe:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=guarded-approve \
  --deny-shell-approvals=1 \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-structured-only
```

Artifacts:

- `.tmp-app-server-smoke/evidence/desktop-structured-only/guarded-approve.json`
- job `mqactd9o7mo7rh4p`

Result:

- `jobStatus` was `succeeded`, but `canaryExists` was `false`.
- `askUserQuestionCount` was `0`.
- no `guard-event` chunks were emitted.
- The model did not switch to a structured file edit path after shell approval
  was denied; it reported that the available toolset could not create the file
  without shell/command execution.

So the product-route guarded approve-and-edit blocker is closed for the
bounded scoped shell path. A stricter structured-only fileChange/applyPatch
path remains unproven and should not be claimed as supported evidence.

Follow-up structured apply-patch probe:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=structured-apply-patch \
  --deny-shell-approvals=1 \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-structured-apply-patch
```

Artifacts:

- `.tmp-app-server-smoke/evidence/desktop-structured-apply-patch/structured-apply-patch.json`
- job `mqai5zfmwn8bz3cm`

Result:

- `jobStatus` was `succeeded`, but `canaryExists` was `false`.
- `askUserQuestionCount` was `2`.
- `commandApprovalQuestionCount` was `2`; both questions were `Run command`
  and the smoke denied them because `--deny-shell-approvals=1` was set.
- `fileChangeApprovalQuestionCount` was `0`.
- `structuredFileChangeChunkCount` was `0`.
- The model reported that the apply_patch tool was not surfaced as a callable
  function in this environment and that shell commands were being rejected.

This confirms that app-server's schema exposes file-change approval APIs, and
the adapter maps those APIs, but the current real desktop provider/model path
does not trigger `item/fileChange/requestApproval`, legacy
`applyPatchApproval`, or `item/fileChange/patchUpdated` from a structured-only
edit prompt. This was not enough by itself to conclude an upstream blocker,
because the local adapter had not yet tried explicit apply-patch enablement.

Follow-up apply-patch enablement experiment:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=structured-apply-patch \
  --deny-shell-approvals=1 \
  --enable-apply-patch-experiment=1 \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-apply-patch-experiment

LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=structured-apply-patch \
  --deny-shell-approvals=1 \
  --enable-apply-patch-experiment=1 \
  --model=gpt-5-codex \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-apply-patch-experiment-gpt5-codex
```

Artifacts:

- `.tmp-app-server-smoke/evidence/desktop-apply-patch-experiment/structured-apply-patch.json`
- job `mqaip9c1v2e4ncul`
- `.tmp-app-server-smoke/evidence/desktop-apply-patch-experiment-gpt5-codex/structured-apply-patch.json`
- job `mqais7qomrhhy0if`

The experiment explicitly set app-server `initialize.capabilities.experimentalApi`
to `true` and passed config keys observed from the bundled runtime binary or
candidate Codex config names:

- `features.apply_patch_freeform`
- `features.apply_patch_streaming_events`
- `include_apply_patch_tool`
- `tools.apply_patch.enabled`
- `tools.apply_patch.approval_mode`
- `model_providers.locus_profile.apply_patch_tool_type`
- `model_providers.locus_profile.experimental_supported_tools`

Result:

- `deepseek-v4-flash`: `jobStatus` was `succeeded`, `canaryExists` was
  `false`, `commandApprovalQuestionCount` was `4`,
  `fileChangeApprovalQuestionCount` was `0`, and
  `structuredFileChangeChunkCount` was `0`.
- `gpt-5-codex`: `jobStatus` was `succeeded`, `canaryExists` was `false`,
  `commandApprovalQuestionCount` was `2`,
  `fileChangeApprovalQuestionCount` was `0`, and
  `structuredFileChangeChunkCount` was `0`.
- Both runs reported `experimentalApi: true` and recorded the apply-patch
  experiment config keys above.
- Both runs still produced only `Run command` approval questions. No
  `Allow file change`, `Apply patch`, `item/fileChange/requestApproval`,
  legacy `applyPatchApproval`, or file-change notification chunks appeared.
- The `gpt-5-codex` text output explicitly reported that the `apply_patch` tool
  was not available in the session after the app-server config experiment.
- Secret grep checks found no `Bearer`, `sk-`,
  `LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN`, `access_token`, `refresh_token`,
  `SMOKE_MCP_SECRET`, or `smoke-mcp-secret` in the new evidence artifacts.

This closes the local enablement experiment requested by review: Locus now has
a smoke-only way to set `experimentalApi: true`, pass candidate apply-patch
config knobs, and select a Codex-native model name. Under those conditions the
current bundled app-server/provider path still does not expose structured
file-edit approvals. The structured fileChange/applyPatch path is therefore
deferred as runtime/tool-surface availability under the current app-server path,
not treated as a missing Locus approval handler and not claimed as supported
6.8 evidence. The bounded scoped shell approval path remains the only real
desktop guarded approve-and-edit path proven by 6.8 smoke evidence.

## Follow-Up MCP Readiness Probe

After the initial partial smoke, the app-server adapter was wired to call
`mcpServerStatus/list` after `thread/start` and emit a runtime status chunk with
a redacted readiness summary. The official runtime env allowlist now includes
`CODEX_HOME` so an isolated Codex config path can be handed to app-server
without inheriting host provider tokens.

Focused verification:

```bash
bun test tests/codex-official-runtime-env.test.ts \
  tests/codex-app-server-adapter.test.ts \
  tests/runtime-stream-event-mapper.test.ts

bun run ts:check
bunx openspec validate refactor-codex-official-runtime-adapter --strict --no-interactive
```

Observed result: 34 focused tests passed, TypeScript check passed, and
OpenSpec strict validation passed.

Real desktop MCP follow-up:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=mcp-readiness \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-mcp-readiness
```

Artifacts:

- `.tmp-app-server-smoke/evidence/desktop-mcp-readiness/mcp-readiness.json`
- job `mqagb08gu6j9836k`

Result:

- `jobStatus` was `succeeded`.
- `adapterSource` was `codex-app-server`.
- the smoke created an isolated `CODEX_HOME` containing `locus_smoke_mcp`, a
  real stdio MCP server implemented by
  `.tmp-app-server-smoke/evidence/desktop-mcp-readiness/smoke-mcp-server.mjs`.
- the app-server MCP status chunk reported `serverCount: 1`,
  `readyServerCount: 1`, `serverNames: ["locus_smoke_mcp"]`, and
  `authStatuses: ["unsupported"]`.
- persisted job events recorded the ready MCP status as ordinary `status`
  events, not `mcp_needs_auth`.
- the evidence JSON does not contain the fake `SMOKE_MCP_SECRET` value or the
  `SMOKE_MCP_SECRET` key; the temporary config file under the ignored smoke
  directory contains only a synthetic local smoke secret.

The unrelated `[MCP] Cache updated ... Working: 0/0` log line still appears
from the existing Claude/global MCP warmup path. It is not the app-server MCP
readiness signal; the app-server signal is the non-empty
`mcpRuntimeStatusChunks` entry in the evidence artifact.

## Follow-Up Provider Rich Text Probe

The initial provider-profile desktop smoke only proved session/start/finish and
adapter binding. It did not prove that the Locus provider gateway returned
assistant text to app-server. A follow-up provider-plan smoke used a unique
literal token prompt and recorded joined text deltas in the evidence artifact.

Real desktop provider follow-up:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  ./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=provider-plan \
  --project=/Users/ethan/Documents/GitHub/agent-code-for-me \
  --out=/Users/ethan/Documents/GitHub/agent-code-for-me/.tmp-app-server-smoke/evidence/desktop-provider-rich-text
```

Artifacts:

- `.tmp-app-server-smoke/evidence/desktop-provider-rich-text/provider-plan.json`
- job `mqahvugfwj1tsfdg`

Result:

- `jobStatus` was `succeeded`.
- `adapterSource` was `codex-app-server`.
- `textDeltaCount` was `14`.
- joined `textContent` was exactly `LOCUS_PROVIDER_TEXT_DELTA_OK_20260612`.
- persisted events included `assistant_delta` events and terminal
  `completed` events.
- grep checks found no `Bearer`, `sk-`, `LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN`,
  `access_token`, or `refresh_token` in the evidence artifact.

This rules out the earlier suspected provider failure modes for the current
desktop path: the gateway response was not a 401, and it was not an empty
completion. The app-server stream mapper also preserved the provider text as
renderer chunks and persisted job events.

## Real UI Dogfood Probe

After the automated desktop smoke passed, the dev app was started with the
app-server gate enabled and operated through the real renderer:

```bash
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
  bun run dev -- --remote-debugging-port=9222
```

The visible app window was the dev Electron bundle
`io.github.lupanpan1030.locus.dev`, pointed at
`/Users/ethan/Documents/GitHub/agent-code-for-me`. Computer Use verified the
real window state. CDP was used to drive renderer clicks and text input because
Computer Use could read this Electron process but did not reliably perform
click actions against it.

Artifacts:

- `.tmp-app-server-dogfood/screenshots/01-ui-app-server-chat-success.png`
- `.tmp-app-server-dogfood/screenshots/02-ui-app-server-plan-success.png`
- `.tmp-app-server-dogfood/screenshots/04-ui-app-server-chatgpt-write-success.png`
- `.tmp-app-server-dogfood/screenshots/05-ui-app-server-chatgpt-guarded-no-file.png`

Provider-profile UI chat:

- selected model label: `DeepSeek · deepseek-v4-flash`
- chat `mqanl78djbz3mjyn`, sub-chat `mqanl78gp5eea94m`
- jobs `mqanl7t7o4il8x1k` and `mqannw305jqb9o2c` both `succeeded`
- assistant messages persisted with `adapterSource: codex-app-server`
- both turns reused session/thread `019ebae8-1cac-77f0-84d3-cfb77bb654dd`
- visible responses were `UI_APP_SERVER_TEXT_OK_20260612` and
  `UI_APP_SERVER_TEXT_OK_20260612_SECOND`

Plan-mode UI chat:

- the real renderer mode switch selected `Plan`
- job `mqanyqfqvfwncwgb` persisted as `mode: plan`, `status: succeeded`
- assistant message persisted with `adapterSource: codex-app-server`, model
  `deepseek-v4-flash`, and text `UI_APP_SERVER_PLAN_OK_20260612`

ChatGPT/app-managed Codex UI write:

- the UI was switched to `GPT-5.5`; the app-server adapter normalizes the
  app-server runtime model from the UI's `gpt-5.5/high` display selection to
  `gpt-5.5` for the bundled runtime path
- job `mqaof7h5uk3shkvk` persisted as `status: succeeded`,
  `adapterSource: codex-app-server`, model `gpt-5.5`
- the filesystem canary was created at
  `.tmp-app-server-dogfood/ui-chatgpt/canary.txt` with content
  `UI_APP_SERVER_CHATGPT_WRITE_OK_20260612`
- persisted events included app-server `session-init`, `start-step`,
  `assistant_delta`, `usage_update`, and terminal `completed` events with token
  counts redacted

Guarded UI dogfood:

- configuring the Guarded Run card through the UI with invalid success checks
  failed closed with
  `Guarded run contract rejected: Success checks must be bounded commands without shell control or high-risk operations.`
- configuring a valid bounded contract (`editableScope:
  .tmp-app-server-dogfood/ui-chatgpt-guarded/**`, success check
  `test -f .tmp-app-server-dogfood/ui-chatgpt-guarded/canary.txt`) created a
  real guarded job `mqaoh6sq0mbdukry` with `permissionPolicy.guarded: true`,
  `controlLevel: guarded`, and `appServerApprovalPolicy: untrusted`
- that guarded UI job did not create the file; the assistant response was
  `未创建：写入操作被拒绝。`
- this preserves the safety claim, but it is a dogfood usability gap: the
  automated 6.8 proof shows the bounded scoped shell approval path can approve
  and execute, while the real UI guarded flow still needs product follow-up so
  users can reliably complete guarded edits without falling back to no-guard

Additional dogfood findings:

- Worktree mode in the iCloud-backed repo hung while creating a worktree; local
  mode was used for the UI app-server verification. This is an environment/git
  risk, not app-server protocol evidence.
- An earlier dogfood evidence run copied an isolated Codex home under
  `.tmp-app-server-dogfood/evidence/provider-profile/mcp-readiness/codex-home/`.
  Review found no plaintext provider token, but the copied-home evidence shape
  is too broad because SQLite WAL files and runtime state can preserve more
  material than the redacted JSON summary needs. The copied Codex homes were
  deleted from local artifacts after review. Future evidence collection should
  whitelist JSON summaries, redacted config excerpts, and minimal SQLite query
  output instead of copying a whole runtime home.

## Conclusion

6.8 is complete under the accepted bounded scoped shell approval interpretation
for guarded edit evidence. The real desktop smoke proves that bundled Codex
`0.134.0` supports `app-server --listen stdio://`, the product route can start
the app-server adapter behind the explicit gate, provider-profile binding
returns real assistant text deltas through the Locus gateway, plan-mode denial
persists correctly, guarded denial persists correctly, guarded approve-and-edit
reaches the filesystem through the bounded scoped shell approval path,
non-empty app-server MCP readiness works through isolated config handoff,
cancellation works, and ACP fallback diagnostics are labeled.

Real UI dogfood additionally proves app-server chat, multi-turn resume, plan
mode, app-managed ChatGPT text, and no-guard temporary-file writes through the
visible renderer. It also records a remaining guarded-run dogfood gap: the
guarded UI path is fail-closed and can create a guarded app-server job, but the
visible UI flow did not complete a guarded write in the dogfood session.

Structured-only fileChange/applyPatch approval is explicitly deferred. The
strict and enablement probes above show that, even with shell approvals denied,
`experimentalApi: true`, apply-patch config knobs, and a Codex-native model
name, the current app-server/provider path did not expose fileChange/applyPatch
approvals or structured file-change notifications.
