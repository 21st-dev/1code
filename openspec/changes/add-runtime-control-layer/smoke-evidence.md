# Runtime Control Layer Desktop Smoke Evidence

Status: passed on 2026-06-11

Provider call authorization: required

This file tracks the evidence required for task 6.6. Do not mark task 6.6
complete until every required scenario below is `passed` with real desktop app
artifacts. Unit tests, startup-only app checks, direct SDK helpers, and dry-run
commands are useful supporting evidence, but they do not satisfy this task by
themselves.

## Completion Rule

Task 6.6 requires all of the following for each scenario:

- A real Electron desktop run, not a direct SDK-only helper.
- A registered local project and verified desktop preflight before provider,
  MCP, attachment, or adapter startup.
- The selected `PermissionPolicy` visible in logs or DB/debug evidence.
- The adapter source visible as `claude-agent-sdk` or
  `codex-acp-temporary-compat`, with adapter attempt identity.
- Semantic `agent_job_events` persisted for the run, with ordered redacted
  runtime events including status and terminal completion or denial.
- Workbench timeline evidence showing the semantic trace.
- Provider/runtime logs checked for leaked provider secrets, OAuth tokens,
  headers, gateway tokens, and raw MCP secret payloads.

After each real desktop run, validate the persisted job trace with:

```bash
bun run runtime-control:smoke:job -- --db=/path/to/agents.db --job=<job-id> --scenario=<scenario-id>
```

This DB inspector proves the `agent_jobs` row, runtime/mode/source, persisted
permission policy evidence, ordered semantic events, terminal event, guard event
presence for guarded scenarios, and event redaction metadata. Adapter source and
attempt are verified from the normalized `desktop_runtime_adapter_started`
semantic trace event; app logs and UI/debug screenshots remain supporting
evidence rather than the source-of-truth check.

## Desktop Run

- App command: `bun run dev`
- App user data: `/Users/ethan/Library/Application Support/Agent Code for Me Dev`
- Evidence DB: `/Users/ethan/Library/Application Support/Agent Code for Me Dev/data/agents.db`
- Primary project: `/Users/ethan/Documents/GitHub/agent-code-for-me`
- Artifact directory: `/Users/ethan/Documents/Locus-smoke-artifacts/runtime-control-layer-20260611-desktop-smoke`
- Inspector note: local Node could not load the installed `better-sqlite3` ABI,
  so the inspector used its `sqlite3 -json` CLI fallback for these validations.

## Required Scenarios

| Scenario ID | Runtime path | Mode | Status | Job ID |
| --- | --- | --- | --- | --- |
| `claude-plan` | Claude Agent SDK desktop adapter | plan | passed | `mq91fchhlo3ysjil` |
| `claude-guard` | Claude Agent SDK desktop adapter | guarded agent | passed | `mq91po22g5tyav39` |
| `codex-temporary-compat-plan` | Codex ACP temporary-compat desktop adapter | plan | passed | `mq91vb21rr8x9od0` |
| `codex-temporary-compat-guard` | Codex ACP temporary-compat desktop adapter | guarded agent | passed | `mq9280vm6ckg0ak9` |

## Scenario: claude-plan

Status: passed

Provider call authorization: required before running.

Evidence:

- Job: `mq91fchhlo3ysjil`; chat `mq4hvr0i45x4rj8d`; sub-chat
  `mq91c2k62vvg8j3z`; cwd
  `/Users/ethan/.21st/worktrees/observed-agent-rerun-20260608-124810/annual-tor`.
- `agent_jobs`: source `desktop`, runtime `claude-code`, mode `plan`, status
  `succeeded`.
- `PermissionPolicy`: runtimeId `claude-code`, mode `plan`, guarded `false`,
  enforcement `native-plan-read-only`.
- Semantic event sequence 4:
  `desktop_runtime_adapter_started`, adapterSource `claude-agent-sdk`,
  attempt `1`.
- `bun run runtime-control:smoke:job -- --db="/Users/ethan/Library/Application Support/Agent Code for Me Dev/data/agents.db" --job=mq91fchhlo3ysjil --scenario=claude-plan`
  passed.
- Workbench artifact:
  `/Users/ethan/Documents/Locus-smoke-artifacts/runtime-control-layer-20260611-claude-plan/claude-plan-workbench.png`.

## Scenario: claude-guard

Status: passed

Provider call authorization: required before running.

Evidence:

- Job: `mq91po22g5tyav39`; chat `mpl79q0b1442cmr9`; sub-chat
  `mq91nrb7rtg6w0i5`; cwd
  `/Users/ethan/Documents/GitHub/agent-code-for-me`.
- `agent_jobs`: source `desktop`, runtime `claude-code`, mode `agent`, status
  `succeeded`.
- Guard contract: hard mode, editable `src/smoke-target.ts`, read-only
  `README.md`.
- `PermissionPolicy`: runtimeId `claude-code`, mode `agent`, guarded `true`,
  enforcement `locus-guarded-tool-policy`.
- Semantic event sequence 4:
  `desktop_runtime_adapter_started`, adapterSource `claude-agent-sdk`,
  attempt `1`.
- Guard event sequence 54: `guard_decision` type `blocked` for `.env`, reason
  `Protected path ".env" is outside guarded-run policy.`
- Requested marker was absent from `.env` after the run.
- `bun run runtime-control:smoke:job -- --db="/Users/ethan/Library/Application Support/Agent Code for Me Dev/data/agents.db" --job=mq91po22g5tyav39 --scenario=claude-guard`
  passed.

## Scenario: codex-temporary-compat-plan

Status: passed

Provider call authorization: required before running.

Evidence:

- Job: `mq91vb21rr8x9od0`; chat `mpl79q0b1442cmr9`; sub-chat
  `mq91rvk0uvldu9qc`; cwd
  `/Users/ethan/Documents/GitHub/agent-code-for-me`.
- `agent_jobs`: source `desktop`, runtime `codex`, mode `plan`, status
  `succeeded`.
- Provider/model metadata: provider `codex`, model `gpt-5.5/xhigh`.
- `PermissionPolicy`: runtimeId `codex`, mode `plan`, guarded `false`,
  enforcement `codex-acp-plan-handler`.
- Semantic event sequence 4:
  `desktop_runtime_adapter_started`, adapterSource
  `codex-acp-temporary-compat`, attempt `1`, temporaryFallback `true`.
- `bun run runtime-control:smoke:job -- --db="/Users/ethan/Library/Application Support/Agent Code for Me Dev/data/agents.db" --job=mq91vb21rr8x9od0 --scenario=codex-temporary-compat-plan`
  passed.

## Scenario: codex-temporary-compat-guard

Status: passed

Provider call authorization: required before running.

Evidence:

- Job: `mq9280vm6ckg0ak9`; chat `mpl79q0b1442cmr9`; sub-chat
  `mq91rj1v679b18br`; cwd
  `/Users/ethan/Documents/GitHub/agent-code-for-me`.
- `agent_jobs`: source `desktop`, runtime `codex`, mode `agent`, terminal
  status `failed` because the hard guard denied the requested protected write.
- Guard contract: hard mode, editable `src/smoke-target.ts`, read-only
  `README.md`.
- `PermissionPolicy`: runtimeId `codex`, mode `agent`, guarded `true`,
  enforcement `codex-acp-guarded-handler`.
- Provider/model metadata: provider `codex`, model `gpt-5.5/xhigh`.
- Semantic event sequence 4:
  `desktop_runtime_adapter_started`, adapterSource
  `codex-acp-temporary-compat`, attempt `1`, temporaryFallback `true`.
- Guard event sequence 11: `guard_decision` type `blocked` for `.env`, reason
  `Protected path ".env" is outside guarded-run policy.`
- Terminal event sequence 13: `error` with `Guarded run blocked Edit from
  touching protected path ".env".`
- Requested marker was absent from `.env` after the run.
- `bun run runtime-control:smoke:job -- --db="/Users/ethan/Library/Application Support/Agent Code for Me Dev/data/agents.db" --job=mq9280vm6ckg0ak9 --scenario=codex-temporary-compat-guard`
  passed.
- Workbench artifact:
  `/Users/ethan/Documents/Locus-smoke-artifacts/runtime-control-layer-20260611-desktop-smoke/codex-temporary-compat-guard-workbench.png`.
