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

Status: blocked

Evidence:
- No real provider API key was available in the local environment
  (`OPENAI_API_KEY`, `DASHSCOPE_API_KEY`, and `QWEN_API_KEY` were absent).
- Direct ACP `session/new` with a fresh isolated HOME and no auth returned
  `Authentication required: Use Qwen Code CLI to authenticate first.`
- Direct ACP `session/new` with placeholder `OPENAI_API_KEY` but no
  `--auth-type=openai` returned the same authentication error.
- Direct ACP `session/new` with `--auth-type=openai` advanced to session
  creation, proving the non-secret auth type selector is required before a real
  API-key smoke can complete.

## Scenario: qwen-launch-stream

Status: blocked

Evidence:
- Blocked on `qwen-auth-session`; no authenticated model response was requested.

## Scenario: qwen-file-edit

Status: blocked

Evidence:
- Blocked on authenticated model execution.
- Current spike policy still treats Qwen permission allow as degraded/fail-closed,
  so file-edit acceptance must remain unchecked until a real allow path is
  observed or a follow-up implements it.

## Scenario: qwen-permission-request

Status: blocked

Evidence:
- Unit coverage proves fail-closed permission request handling and trace
  emission, but no live Qwen permission prompt/allow decision was observed.

## Scenario: qwen-cancel

Status: blocked

Evidence:
- Blocked on authenticated live streaming.

## Scenario: qwen-error-mapping

Status: pending

Evidence:
- Direct ACP authless failure returns a structured protocol error instead of
  hanging. Locus adapter unit tests cover mapping transport errors into error
  chunks, but no live Locus desktop route error proof has been captured yet.
