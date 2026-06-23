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

Status: blocked

Evidence:
- Current spike policy still treats Qwen permission allow as degraded/fail-closed,
  so file-edit acceptance must remain unchecked until a real allow path is
  observed or a follow-up implements it.
- A live Locus adapter edit request against isolated
  `/private/tmp/locus-qwen-acp-smoke-y29ygf/project/qwen-smoke-edit.txt`
  produced one observed tool decision and one permission blocker. The file
  remained `before\n`, proving fail-closed behavior but not allow/apply support.

## Scenario: qwen-permission-request

Status: blocked

Evidence:
- Unit coverage proves fail-closed permission request handling and trace
  emission.
- A live Qwen edit request did produce one observed tool decision through the
  Locus adapter, and the denial was honored by leaving the file unchanged.
  However, no user approval prompt / allow UI is wired in this spike, so task
  9.3 remains unchecked.

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
