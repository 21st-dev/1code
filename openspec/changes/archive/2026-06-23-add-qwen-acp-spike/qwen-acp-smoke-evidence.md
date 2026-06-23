# Qwen ACP Smoke Evidence

Provider call authorization: required

Do not paste raw API keys, OAuth tokens, cookies, or provider headers here.

## Scenario: qwen-cli-acp-initialize

Status: passed

Evidence:
- Date: 2026-06-23
- Install mode: isolated npm prefix at `/tmp/locus-qwen-cli.UXX0vv`
- Command: `npm install --prefix /tmp/locus-qwen-cli.UXX0vv @qwen-code/qwen-code`
- Version: `qwen --version` returned `0.19.1`
- ACP initialize: `qwen --acp` returned `agentInfo.name = qwen-code`,
  `agentInfo.version = 0.19.1`, `protocolVersion = 1`, and no stderr.
- Auth discovery: initialize returned auth method `openai` with required args
  `--auth-type=openai`.

## Scenario: qwen-auth-session

Status: passed

Evidence:
- Direct ACP `session/new` with a fresh isolated HOME and no auth returned
  `Authentication required: Use Qwen Code CLI to authenticate first.`
- Direct ACP `session/new` with placeholder `OPENAI_API_KEY` but no
  `--auth-type=openai` returned the same authentication error.
- Direct ACP `session/new` with `--auth-type=openai` advanced to session
  creation, proving the non-secret auth type selector is required before a real
  API-key smoke can complete.
- Reusing the ignored local `.env.local` `OPENAI_API_KEY`, plus
  `OPENAI_BASE_URL=https://api.openai.com/v1`,
  `LOCUS_QWEN_CODE_AUTH_TYPE=openai`, and
  `LOCUS_QWEN_CODE_MODEL=gpt-4o-mini`, direct ACP created a session and
  completed a non-interactive prompt. No key value was printed or copied into
  evidence.

## Scenario: qwen-launch-stream

Status: passed

Evidence:
- Direct ACP prompt returned `qwen-smoke-ok` with Qwen Code `0.19.1`,
  model `$runtime|openai|gpt-4o-mini(openai)`, `stopReason = end_turn`, and
  seven notifications.
- The Locus `createQwenAcpClientAdapter` live run used the same isolated Qwen
  CLI and main-process env selectors, returned `status = succeeded`, had a
  session id, emitted `qwen-smoke-ok`, produced 11 chunks, 12 trace events, and
  one completed event.

## Scenario: qwen-file-edit

Status: passed

Evidence:
- A live Locus adapter edit request against isolated
  `/private/tmp/locus-qwen-acp-smoke-y29ygf/project/qwen-smoke-edit-allow.txt`
  used the Qwen approval bridge to answer the emitted `ask-user-question` chunk
  with Allow.
- Result: `status = succeeded`, session id present, 39 chunks, 40 trace events,
  one permission prompt, one `ask-user-question-result = approved`, one observed
  tool decision `allow`, zero runtime blockers, and the file changed from
  `before\n` to `after`.
- A separate live deny smoke against
  `/private/tmp/locus-qwen-acp-smoke-y29ygf/project/qwen-smoke-edit-deny.txt`
  answered the same permission path with Deny. Result: `status = succeeded`, one
  permission prompt, one observed tool decision `deny`, one runtime blocker, and
  the file remained `before\n`.

## Scenario: qwen-permission-request

Status: passed

Evidence:
- Unit coverage proves fail-closed handling when the approval bridge is missing,
  Allow mapping to the ACP `allow_once` option, and a submitted Deny answer not
  being treated as approval.
- A live Qwen edit request emitted one `ask-user-question` chunk, registered one
  pending approval, and the approval response was honored as `allow` with no
  runtime-status blocker.
- A live deny request emitted the same permission path and was honored as `deny`
  with the target file unchanged.
- Renderer/source guard coverage verifies Qwen chat chunks flow through the
  shared `runtime-event-state.ts` AskUserQuestion owner and Qwen approval
  responses route to `agentRuntime.respondToolApproval`, not the Claude route.

## Scenario: qwen-cancel

Status: passed

Evidence:
- A live Locus adapter run was canceled while an authenticated Qwen prompt was
  in progress after session creation. It returned `status = canceled`,
  `error.code = job_canceled`, had a session id, and no `qwen` process remained
  after the run.

## Scenario: qwen-error-mapping

Status: passed

Evidence:
- Direct ACP authless failure returns a structured protocol error instead of
  hanging. Locus adapter unit tests cover mapping transport errors into error
  chunks.
- A live Locus adapter run with missing OpenAI auth returned `status = failed`,
  `error.code = qwen_acp_failed`, one error chunk, and completed in about
  1.4 seconds rather than hanging or crashing.
