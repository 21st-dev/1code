# Runtime Control Layer Desktop Smoke Evidence

Status: pending real desktop smoke

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
  `codex-acp-temporary-compat`.
- Semantic `agent_job_events` persisted for the run, with ordered redacted
  runtime events including status and terminal completion or denial.
- Workbench timeline evidence showing the semantic trace.
- Provider/runtime logs checked for leaked provider secrets, OAuth tokens,
  headers, gateway tokens, and raw MCP secret payloads.

After each real desktop run, validate the persisted job trace with:

```bash
bun run runtime-control:smoke:job -- --db=/path/to/agents.db --job=<job-id> --scenario=<scenario-id>
```

This DB inspector proves the `agent_jobs` row, runtime/mode/source, ordered
semantic events, terminal event, guard event presence for guarded scenarios, and
event redaction metadata. Adapter source is not yet persisted in `agent_jobs`,
so `adapterSource=claude-agent-sdk` or
`adapterSource=codex-acp-temporary-compat` still needs app log or UI/debug
evidence.

## Required Scenarios

| Scenario ID | Runtime path | Mode | Status |
| --- | --- | --- | --- |
| `claude-plan` | Claude Agent SDK desktop adapter | plan | pending |
| `claude-guard` | Claude Agent SDK desktop adapter | guarded agent | pending |
| `codex-temporary-compat-plan` | Codex ACP temporary-compat desktop adapter | plan | pending |
| `codex-temporary-compat-guard` | Codex ACP temporary-compat desktop adapter | guarded agent | pending |

## Scenario: claude-plan

Status: pending

Provider call authorization: required before running.

Required evidence:

- Command and app startup log for the Electron desktop run.
- Local repo path, chat ID, sub-chat ID, run ID, and job ID.
- Provider/model selected, with renderer-safe metadata only.
- Preflight accepted the registered project/cwd before provider startup.
- Permission policy resolved to Claude plan-mode read-only semantics before
  SDK query startup.
- Desktop run request reached the Claude Agent SDK adapter with
  `adapterSource=claude-agent-sdk`.
- Semantic `agent_job_events` query output for the job.
- `bun run runtime-control:smoke:job -- --db=/path/to/agents.db --job=<job-id> --scenario=claude-plan`
  passes for the job.
- Workbench timeline screenshot or recording.
- Secret grep result across logs and artifacts.

## Scenario: claude-guard

Status: pending

Provider call authorization: required before running.

Required evidence:

- Command and app startup log for the Electron desktop run.
- Local repo path, chat ID, sub-chat ID, run ID, and job ID.
- Approved guarded scope contract summary without sensitive payloads.
- Preflight accepted the registered project/cwd before provider startup.
- Permission policy included guarded editable paths, denied paths, and
  expansion policy before SDK query startup.
- A deliberate out-of-scope operation was denied or produced a scope expansion
  request before execution.
- Desktop run request reached the Claude Agent SDK adapter with
  `adapterSource=claude-agent-sdk`.
- Semantic `agent_job_events` query output showing guard decision or scope
  expansion events.
- `bun run runtime-control:smoke:job -- --db=/path/to/agents.db --job=<job-id> --scenario=claude-guard`
  passes for the job.
- Workbench timeline screenshot or recording.
- Secret grep result across logs and artifacts.

## Scenario: codex-temporary-compat-plan

Status: pending

Provider call authorization: required before running.

Required evidence:

- Command and app startup log for the Electron desktop run.
- Local repo path, chat ID, sub-chat ID, run ID, and job ID.
- Provider/model selected, with renderer-safe metadata only.
- Preflight accepted the registered project/cwd before provider startup.
- Permission policy resolved to Codex plan-mode read-only semantics before ACP
  provider/session startup.
- Desktop run request reached the Codex ACP temporary-compat adapter with
  `adapterSource=codex-acp-temporary-compat`.
- Semantic `agent_job_events` query output for the job.
- `bun run runtime-control:smoke:job -- --db=/path/to/agents.db --job=<job-id> --scenario=codex-temporary-compat-plan`
  passes for the job.
- Workbench timeline screenshot or recording.
- Secret grep result across logs and artifacts.

## Scenario: codex-temporary-compat-guard

Status: pending

Provider call authorization: required before running.

Required evidence:

- Command and app startup log for the Electron desktop run.
- Local repo path, chat ID, sub-chat ID, run ID, and job ID.
- Approved guarded scope contract summary without sensitive payloads.
- Preflight accepted the registered project/cwd before provider startup.
- Permission policy included guarded editable paths, denied paths, and
  expansion policy before ACP provider/session startup.
- A deliberate out-of-scope operation was denied or produced a scope expansion
  request before execution.
- Desktop run request reached the Codex ACP temporary-compat adapter with
  `adapterSource=codex-acp-temporary-compat`.
- Semantic `agent_job_events` query output showing guard decision or scope
  expansion events.
- `bun run runtime-control:smoke:job -- --db=/path/to/agents.db --job=<job-id> --scenario=codex-temporary-compat-guard`
  passes for the job.
- Workbench timeline screenshot or recording.
- Secret grep result across logs and artifacts.
