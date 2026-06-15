# Runtime Error Semantics

Date: 2026-06-16

This table defines product-facing error semantics for Locus runtime, provider,
MCP, guard, worktree, and job failures. It does not claim every code is already
implemented as a centralized formatter. It is the target vocabulary for future
UI formatting.

Related docs:

- `docs/DESIGN.md`
- `docs/run-event-trace-inventory.md`

## Current Sources

Current errors are emitted from several layers:

- Desktop preflight blockers:
  `src/main/lib/agent-runtime/preflight.ts`
- Runtime capability errors:
  `src/shared/codex-runtime-capabilities.ts`
- Codex runtime status blockers:
  `src/shared/codex-runtime-status.ts`
- Claude provider startup blockers:
  `src/main/lib/claude/agent-sdk-provider-startup.ts`
- Desktop and headless job error codes:
  `src/main/lib/desktop-agent-jobs.ts`,
  `src/main/lib/headless/job-runner.ts`,
  `src/main/lib/headless/process-runner.ts`
- Renderer transport toasts:
  `src/renderer/features/agents/lib/ipc-chat-transport.ts`,
  `src/renderer/features/agents/lib/acp-chat-transport.ts`
- Existing localized strings:
  `src/renderer/lib/i18n/dictionaries.ts`

## Formatting Contract

Every user-visible error should be formatted into:

- `code`: stable snake_case product code.
- `title`: short summary.
- `body`: plain explanation of what blocked the user.
- `nextAction`: one concrete action when possible.
- `details`: optional, redacted technical context.

`Status` in the tables below is documentation metadata, not user-facing copy.

Renderer-visible details must never include provider secrets, OAuth codes,
Authorization headers, cookies, raw environment variables, unredacted MCP
payloads, or full stack traces.

## Status Legend

| Status | Meaning |
| --- | --- |
| `implemented` | Current code already has this product/internal code or an equivalent persisted `errorCode`. |
| `source-exists` | The failure source exists today, but this exact product code is not centralized yet. |
| `target` | Target vocabulary for future formatter or backlog work. Do not treat it as current behavior. |

## Runtime Setup And Availability

| Status | Code | When | User title | User body | Next action |
| --- | --- | --- | --- | --- | --- |
| `source-exists` | `runtime_missing` | Runtime binary or CLI is missing | Runtime is missing | Locus cannot find the selected runtime on this machine. | Reinstall the app or run the documented runtime download/setup command. |
| `source-exists` | `runtime_not_executable` | Runtime path exists but cannot run | Runtime is not executable | The runtime file exists, but macOS or the filesystem will not execute it. | Fix file permissions or reinstall the runtime. |
| `source-exists` | `runtime_spawn_failed` | Spawn probe or child process fails before a run | Runtime failed to start | Locus tried to start the runtime, but the process failed before it became ready. | Open runtime diagnostics and follow the probe hint. |
| `target` | `runtime_unhealthy` | Runtime starts but readiness/health check fails | Runtime is unhealthy | The runtime started, but its health check did not pass. | Restart the app or runtime, then retry. |
| `implemented` | `runtime_auth_required` | Runtime-managed auth is missing or expired | Runtime needs authentication | The selected runtime needs a valid login before this run can start. | Reconnect the runtime in Settings. |
| `source-exists` | `runtime_adapter_unavailable` | Selected adapter is not registered or disabled | Runtime adapter is unavailable | The selected runtime path is not available in this build or environment. | Switch adapter/runtime or remove the temporary rollback flag. |
| `implemented` | `unsupported_runtime` | Request names an unknown runtime | Runtime is not supported | This Locus build does not support the requested runtime. | Choose `codex` or `claude-code`. |

## Provider And Model Binding

| Status | Code | When | User title | User body | Next action |
| --- | --- | --- | --- | --- | --- |
| `source-exists` | `provider_profile_missing` | A run requires a provider profile but none is selected | Provider profile is missing | This run needs a provider profile before provider work can start. | Choose or create a provider profile in Settings. |
| `source-exists` | `provider_profile_wrong_target` | Selected profile does not target the runtime | Provider profile cannot run here | The selected provider profile is not enabled for this runtime. | Edit the profile targets or choose a compatible profile. |
| `source-exists` | `provider_secret_unavailable` | Main process cannot resolve the required secret | Provider credential is unavailable | Locus could not resolve the saved provider credential in the main process. | Re-save the provider credential in Settings. |
| `source-exists` | `provider_auth_rejected` | Provider rejects token or subscription auth | Provider authentication failed | The provider rejected the saved credential. | Update the credential or reconnect the provider. |
| `source-exists` | `provider_request_failed` | Provider endpoint request fails | Provider request failed | The runtime reached the provider, but the provider request failed. | Check provider status, base URL, model name, and network access. |
| `target` | `provider_rate_limited` | Provider reports rate limit or quota | Provider limit reached | The provider refused the request because of rate limits or quota. | Wait, change model/provider, or update provider billing. |
| `target` | `provider_model_unsupported` | Provider/model lacks required behavior | Model does not support this run | The selected model cannot provide a required capability for this run. | Choose a model/profile with the required capability. |

## MCP

| Status | Code | When | User title | User body | Next action |
| --- | --- | --- | --- | --- | --- |
| `source-exists` | `mcp_auth_required` | MCP server reports `needs-auth` | MCP server needs authentication | One or more MCP servers need authentication before this run can use them. | Authenticate the MCP server in Settings. |
| `source-exists` | `mcp_server_failed` | MCP server fails to start/connect | MCP server failed | A configured MCP server did not become available. | Open MCP settings and inspect the server command or auth state. |
| `source-exists` | `mcp_status_unknown` | Runtime cannot fetch MCP status | MCP status is unknown | The runtime could not confirm MCP readiness. The run may continue with degraded visibility. | Retry or inspect runtime diagnostics if tools are missing. |
| `target` | `mcp_configuration_unsupported` | Runtime cannot modify/import MCP config | MCP configuration is not supported here | This runtime path cannot change MCP configuration through Locus yet. | Use the existing MCP settings surface or choose a supported runtime path. |

## Guard, Permission, And Scope

| Status | Code | When | User title | User body | Next action |
| --- | --- | --- | --- | --- | --- |
| `source-exists` | `command_denied` | Guard or plan mode denies a shell command | Command was denied | The command is outside the allowed policy for this run. | Review the command and switch mode or approve scope if appropriate. |
| `source-exists` | `file_change_denied` | Guard denies edit/move/delete/write | File change was denied | The requested file change is outside the approved scope. | Approve a scope expansion or edit the scope contract. |
| `source-exists` | `scope_expansion_required` | Runtime requests paths outside approved scope | Scope expansion required | The agent needs access to paths that are not in the approved editable scope. | Review and approve or reject the scope expansion. |
| `implemented` | `permission_policy_fail_closed` | Approval/permission hook is missing or delayed | Permission policy blocked the run | Locus could not prove that required approvals would be enforced, so it stopped before provider work. | Use a supported runtime path or retry after diagnostics are ready. |
| `implemented` | `no_interaction_channel` | Headless/API run asks for interaction without a bridge | No user interaction channel | This run needs approval, a question answer, or MCP elicitation, but no visible user channel was declared. | Use the desktop workbench or provide a bounded policy grant. |
| `implemented` | `missing_policy_grant` | Policy-grant execution has no usable scopes | Policy grant is incomplete | The request asked Locus to decide without a visible user, but did not provide bounded scopes. | Add explicit policy grant scopes or use an interactive run. |
| `source-exists` | `controlled_edit_rejected` | User rejects a controlled edit request | Edit was not applied | The proposed controlled edit was rejected. | Continue the run, revise the request, or approve a new edit. |
| `source-exists` | `controlled_edit_failed` | Approved controlled edit fails before/during write | Edit failed | Locus approved the edit path, but applying the edit failed. | Inspect the diff and filesystem state, then retry. |

## Project, CWD, Worktree, And Files

| Status | Code | When | User title | User body | Next action |
| --- | --- | --- | --- | --- | --- |
| `source-exists` | `chat_context_missing` | Chat, sub-chat, or project record is missing | Chat context is missing | Locus could not find the saved chat, sub-chat, or project for this run. | Refresh the workspace or reopen the project. |
| `source-exists` | `cwd_mismatch` | Requested cwd does not match verified project/worktree | Workspace path mismatch | The run requested a different path than the verified project or worktree path. | Reopen the chat from the correct workspace. |
| `implemented` | `invalid_cwd` | Headless or CLI cwd is invalid/inaccessible | Workspace path is invalid | The requested working directory does not exist or cannot be accessed. | Choose an accessible project folder. |
| `source-exists` | `worktree_checkout_timeout` | Worktree checkout times out | Worktree checkout timed out | Git did not finish checking out the worktree in time. | Retry, then inspect git status if it repeats. |
| `source-exists` | `worktree_creation_failed` | Git worktree creation fails | Worktree creation failed | Locus could not create the temporary worktree for this agent run. | Inspect the repository state and retry. |
| `source-exists` | `worktree_setup_failed` | Project setup command fails in worktree | Worktree setup failed | The worktree was created, but the configured setup command failed. | Open project settings and fix or disable the setup command. |
| `source-exists` | `attachment_invalid` | Attachment reference is missing, stale, too large, or not a file | Attachment is invalid | One attachment could not be resolved safely before provider work. | Remove the attachment or attach it again. |
| `source-exists` | `attachment_unsupported` | Runtime/provider does not support attachment type | Attachment is not supported | The selected runtime or provider cannot use this attachment type. | Remove the attachment or choose a compatible runtime/provider. |

## Jobs And Process Execution

| Status | Code | When | User title | User body | Next action |
| --- | --- | --- | --- | --- | --- |
| `implemented` | `job_canceled` | User or caller cancels before completion | Job was canceled | The run was stopped before it completed. | Retry from the chat or job history if needed. |
| `implemented` | `desktop_chat_canceled` | Desktop chat stream is aborted | Chat run was canceled | The desktop chat stream was stopped before natural completion. | Retry from the linked chat. |
| `implemented` | `desktop_chat_failed` | Desktop chat stream saw an error | Chat run failed | The desktop runtime stream failed before a successful finish. | Open the run trace and inspect the first error event. |
| `implemented` | `runtime_process_failed` | Process exits non-zero | Runtime process failed | The runtime process exited with a failure code. | Inspect stdout/stderr in job logs. |
| `implemented` | `process_error` | Child process emits an error event | Process error | The process failed while running. | Inspect the process error and retry after fixing the environment. |
| `implemented` | `spawn_failed` | Process cannot be spawned | Process could not start | Locus could not spawn the runtime command. | Check path, permissions, and runtime installation. |
| `implemented` | `heartbeat_failed` | Job heartbeat update fails | Job heartbeat failed | Locus could not update the running job heartbeat. | Retry, then inspect local database/storage health if it repeats. |
| `implemented` | `internal_error` | Unclassified exception | Internal error | Locus hit an unexpected local error. | Copy redacted details and inspect logs. |

## Local And Policy Boundaries

| Status | Code | When | User title | User body | Next action |
| --- | --- | --- | --- | --- | --- |
| `implemented` | `local_only_guard_blocked` | Local-only policy blocks an external action | Blocked by local-only mode | This action would leave the allowed local boundary. | Disable local-only mode only if you intend to use hosted/external services. |
| `implemented` | `unsupported_capability` | Required capability is degraded/unsupported | Capability is not available | The selected runtime cannot safely provide the required capability. | Choose another runtime/profile or change the run mode. |
| `implemented` | `unsupported_execution_profile` | Headless adapter rejects execution profile | Execution profile is unsupported | This adapter cannot run with the requested execution profile. | Use batch, interactive desktop, or a supported policy grant. |
| `target` | `unsupported_attachment_path` | Attachment local ref cannot be resolved safely | Attachment path is unsupported | The attachment path cannot be safely resolved for this run. | Attach the file through the supported UI flow. |

## Copy Rules

Use direct, action-oriented wording:

- For `target` rows, implement a source mapper/formatter before using the code
  as current behavior.
- Good: "MCP server needs authentication. Authenticate it in Settings."
- Good: "Provider profile cannot run here. Enable Codex as a target or choose
  another profile."
- Bad: "TRPCError: INTERNAL_SERVER_ERROR"
- Bad: "spawn ENOENT"
- Bad: "Unexpected provider failure"

Technical details may be shown only as secondary details:

```text
Details
runtime=codex
component=mcp
status=needs-auth
jobId=...
```

## Implementation Notes

Future formatter modules should map raw sources into this table rather than
changing every caller at once.

Suggested owners:

- Shared product error vocabulary: `src/shared/errors/`
- Main-process mapping from runtime/preflight/provider/job errors:
  `src/main/lib/*`
- Renderer display components: workbench or settings feature surfaces only

Do not put provider secret resolution, capability truth, MCP auth decisions, or
guard allow/deny logic inside a renderer formatter. The formatter should only
translate already-redacted status into user-facing copy.
