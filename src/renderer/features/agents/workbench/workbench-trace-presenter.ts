import {
  DESKTOP_RUNTIME_CONTROL_LEVELS,
  type DesktopRuntimeControlLevel,
} from "../../../../shared/agent-runtime-control"
import type { TranslationKey } from "../../../lib/i18n"

export type WorkbenchTraceEvent = {
  id: string
  jobId: string
  sequence: number
  type: string
  payload: unknown
  createdAt: Date | string | null
}

export type WorkbenchTraceKind =
  | "assistant"
  | "reasoning"
  | "runtime"
  | "provider"
  | "mcp"
  | "tool"
  | "file-change"
  | "approval"
  | "usage"
  | "error"
  | "final"
  | "question"
  | "command"
  | "artifact"
  | "unknown"

export type WorkbenchTraceSeverity = "info" | "success" | "warning" | "error"

export type WorkbenchObservedPermission = {
  controlLevel: DesktopRuntimeControlLevel
  decision: "allow" | "deny"
  message?: string
  riskLevel: string
  toolName: string | null
  reason: string | null
  categories: string[]
}

export type WorkbenchTraceUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  durationMs?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  modelContextWindow?: number
  missing: Array<"provider" | "cost" | "cache" | "context">
}

export type WorkbenchTraceError = {
  code: string
  title: string
  body: string
  nextAction: string
  details?: string
}

export type WorkbenchTraceRow = {
  id: string
  sequence: number
  type: string
  kind: WorkbenchTraceKind
  titleKey: TranslationKey
  severity: WorkbenchTraceSeverity
  status?: string
  summary?: string
  nextAction?: string
  semanticPayload: unknown
  rawPayload: unknown
  hasRawPayload: boolean
  observedPermission?: WorkbenchObservedPermission
  usage?: WorkbenchTraceUsage
  error?: WorkbenchTraceError
  createdAt: Date | string | null
}

export const JOB_EVENT_LABEL_KEYS: Record<string, TranslationKey> = {
  job_created: "workbench.event.jobCreated",
  job_started: "workbench.event.jobStarted",
  assistant_delta: "workbench.event.assistantDelta",
  reasoning_delta: "workbench.event.reasoningDelta",
  tool_started: "workbench.event.toolStarted",
  tool_delta: "workbench.event.toolDelta",
  tool_finished: "workbench.event.toolFinished",
  guard_decision: "workbench.event.guardDecision",
  permission_requested: "workbench.event.permissionRequested",
  scope_expansion_requested: "workbench.event.scopeExpansionRequested",
  question_pending: "workbench.event.questionPending",
  question_result: "workbench.event.questionResult",
  mcp_needs_auth: "workbench.event.mcpNeedsAuth",
  usage_update: "workbench.event.usageUpdate",
  command_started: "workbench.event.commandStarted",
  command_output: "workbench.event.commandOutput",
  command_finished: "workbench.event.commandFinished",
  artifact_created: "workbench.event.artifactCreated",
  status: "workbench.event.status",
  error: "workbench.event.error",
  completed: "workbench.event.completed",
}

const PRODUCT_ERROR_COPY: Record<
  string,
  { title: string; body: string; nextAction: string }
> = {
  runtime_missing: {
    title: "Runtime is missing",
    body: "Locus cannot find the selected runtime on this machine.",
    nextAction:
      "Reinstall the app or run the documented runtime setup command.",
  },
  runtime_not_executable: {
    title: "Runtime is not executable",
    body: "The runtime file exists, but macOS or the filesystem will not execute it.",
    nextAction: "Fix file permissions or reinstall the runtime.",
  },
  runtime_spawn_failed: {
    title: "Runtime failed to start",
    body: "Locus tried to start the runtime, but the process failed before it became ready.",
    nextAction: "Open runtime diagnostics and follow the probe hint.",
  },
  runtime_auth_required: {
    title: "Runtime needs authentication",
    body: "The selected runtime needs a valid login before this run can start.",
    nextAction: "Reconnect the runtime in Settings.",
  },
  runtime_adapter_unavailable: {
    title: "Runtime adapter is unavailable",
    body: "The selected runtime path is not available in this build or environment.",
    nextAction: "Switch adapter or remove the temporary rollback flag.",
  },
  unsupported_runtime: {
    title: "Runtime is not supported",
    body: "This Locus build does not support the requested runtime.",
    nextAction: "Choose codex or claude-code.",
  },
  provider_profile_missing: {
    title: "Provider profile is missing",
    body: "This run needs a provider profile before provider work can start.",
    nextAction: "Choose or create a provider profile in Settings.",
  },
  provider_profile_wrong_target: {
    title: "Provider profile cannot run here",
    body: "The selected provider profile is not enabled for this runtime.",
    nextAction: "Edit the profile targets or choose a compatible profile.",
  },
  provider_secret_unavailable: {
    title: "Provider credential is unavailable",
    body: "Locus could not resolve the saved provider credential in the main process.",
    nextAction: "Re-save the provider credential in Settings.",
  },
  provider_auth_rejected: {
    title: "Provider authentication failed",
    body: "The provider rejected the saved credential.",
    nextAction: "Update the credential or reconnect the provider.",
  },
  provider_request_failed: {
    title: "Provider request failed",
    body: "The runtime reached the provider, but the provider request failed.",
    nextAction:
      "Check provider status, base URL, model name, and network access.",
  },
  mcp_auth_required: {
    title: "MCP server needs authentication",
    body: "One or more MCP servers need authentication before this run can use them.",
    nextAction: "Authenticate the MCP server in Settings.",
  },
  mcp_server_failed: {
    title: "MCP server failed",
    body: "A configured MCP server did not become available.",
    nextAction:
      "Open MCP settings and inspect the server command or auth state.",
  },
  mcp_status_unknown: {
    title: "MCP status is unknown",
    body: "The runtime could not confirm MCP readiness.",
    nextAction: "Retry or inspect runtime diagnostics if tools are missing.",
  },
  command_denied: {
    title: "Command was denied",
    body: "The command is outside the allowed policy for this run.",
    nextAction:
      "Review the command and switch mode or approve scope if appropriate.",
  },
  file_change_denied: {
    title: "File change was denied",
    body: "The requested file change is outside the approved scope.",
    nextAction: "Approve a scope expansion or edit the scope contract.",
  },
  scope_expansion_required: {
    title: "Scope expansion required",
    body: "The agent needs access to paths that are not in the approved editable scope.",
    nextAction: "Review and approve or reject the scope expansion.",
  },
  permission_policy_fail_closed: {
    title: "Permission policy blocked the run",
    body: "Locus could not prove that required approvals would be enforced, so it stopped before provider work.",
    nextAction:
      "Use a supported runtime path or retry after diagnostics are ready.",
  },
  no_interaction_channel: {
    title: "No user interaction channel",
    body: "This run needs approval, a question answer, or MCP elicitation, but no visible user channel was declared.",
    nextAction: "Use the desktop workbench or provide a bounded policy grant.",
  },
  missing_policy_grant: {
    title: "Policy grant is incomplete",
    body: "The request asked Locus to decide without a visible user, but did not provide bounded scopes.",
    nextAction: "Add explicit policy grant scopes or use an interactive run.",
  },
  controlled_edit_rejected: {
    title: "Edit was not applied",
    body: "The proposed controlled edit was rejected.",
    nextAction: "Continue the run, revise the request, or approve a new edit.",
  },
  controlled_edit_failed: {
    title: "Edit failed",
    body: "Locus approved the edit path, but applying the edit failed.",
    nextAction: "Inspect the diff and filesystem state, then retry.",
  },
  chat_context_missing: {
    title: "Chat context is missing",
    body: "Locus could not find the saved chat, sub-chat, or project for this run.",
    nextAction: "Refresh the workspace or reopen the project.",
  },
  cwd_mismatch: {
    title: "Workspace path mismatch",
    body: "The run requested a different path than the verified project or worktree path.",
    nextAction: "Reopen the chat from the correct workspace.",
  },
  invalid_cwd: {
    title: "Workspace path is invalid",
    body: "The requested working directory does not exist or cannot be accessed.",
    nextAction: "Choose an accessible project folder.",
  },
  worktree_checkout_timeout: {
    title: "Worktree checkout timed out",
    body: "Git did not finish checking out the worktree in time.",
    nextAction: "Retry, then inspect git status if it repeats.",
  },
  worktree_creation_failed: {
    title: "Worktree creation failed",
    body: "Locus could not create the temporary worktree for this agent run.",
    nextAction: "Inspect the repository state and retry.",
  },
  worktree_setup_failed: {
    title: "Worktree setup failed",
    body: "The worktree was created, but the configured setup command failed.",
    nextAction: "Open project settings and fix or disable the setup command.",
  },
  attachment_invalid: {
    title: "Attachment is invalid",
    body: "One attachment could not be resolved safely before provider work.",
    nextAction: "Remove the attachment or attach it again.",
  },
  attachment_unsupported: {
    title: "Attachment is not supported",
    body: "The selected runtime or provider cannot use this attachment type.",
    nextAction:
      "Remove the attachment or choose a compatible runtime/provider.",
  },
  job_canceled: {
    title: "Job was canceled",
    body: "The run was stopped before it completed.",
    nextAction: "Retry from the chat or job history if needed.",
  },
  desktop_chat_canceled: {
    title: "Chat run was canceled",
    body: "The desktop chat stream was stopped before natural completion.",
    nextAction: "Retry from the linked chat.",
  },
  desktop_chat_failed: {
    title: "Chat run failed",
    body: "The desktop runtime stream failed before a successful finish.",
    nextAction: "Open the run trace and inspect the first error event.",
  },
  runtime_process_failed: {
    title: "Runtime process failed",
    body: "The runtime process exited with a failure code.",
    nextAction: "Inspect stdout/stderr in job logs.",
  },
  process_error: {
    title: "Process error",
    body: "The process failed while running.",
    nextAction:
      "Inspect the process error and retry after fixing the environment.",
  },
  spawn_failed: {
    title: "Process could not start",
    body: "Locus could not spawn the runtime command.",
    nextAction: "Check path, permissions, and runtime installation.",
  },
  heartbeat_failed: {
    title: "Job heartbeat failed",
    body: "Locus could not update the running job heartbeat.",
    nextAction:
      "Retry, then inspect local database/storage health if it repeats.",
  },
  internal_error: {
    title: "Internal error",
    body: "Locus hit an unexpected local error.",
    nextAction: "Copy redacted details and inspect logs.",
  },
  local_only_guard_blocked: {
    title: "Blocked by local-only mode",
    body: "This action would leave the allowed local boundary.",
    nextAction:
      "Disable local-only mode only if you intend to use hosted services.",
  },
  unsupported_capability: {
    title: "Capability is not available",
    body: "The selected runtime cannot safely provide the required capability.",
    nextAction: "Choose another runtime/profile or change the run mode.",
  },
  unsupported_execution_profile: {
    title: "Execution profile is unsupported",
    body: "This adapter cannot run with the requested execution profile.",
    nextAction: "Use batch, interactive desktop, or a supported policy grant.",
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isDesktopRuntimeControlLevel(
  value: unknown,
): value is DesktopRuntimeControlLevel {
  return (
    typeof value === "string" &&
    DESKTOP_RUNTIME_CONTROL_LEVELS.includes(value as DesktopRuntimeControlLevel)
  )
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function samePayload(a: unknown, b: unknown): boolean {
  return a === b
}

export function formatTracePayload(payload: unknown): string {
  if (payload === null || payload === undefined) return ""
  if (typeof payload === "string") return payload
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export function getWorkbenchSemanticPayload(
  event: WorkbenchTraceEvent,
): unknown {
  if (isRecord(event.payload) && "runEventSequence" in event.payload) {
    return event.payload.payload
  }
  return event.payload
}

function getObservedRiskCategories(risk: Record<string, unknown>): string[] {
  return Array.isArray(risk.riskCategories)
    ? risk.riskCategories.filter(
        (category): category is string => typeof category === "string",
      )
    : []
}

function getObservedPermissionPayload(
  event: WorkbenchTraceEvent,
  semanticPayload: unknown,
): WorkbenchObservedPermission | undefined {
  if (event.type !== "permission_requested") return undefined
  if (!isRecord(semanticPayload)) return undefined
  if (!isDesktopRuntimeControlLevel(semanticPayload.controlLevel)) {
    return undefined
  }
  if (semanticPayload.controlLevel !== "observe") return undefined

  const risk = isRecord(semanticPayload.risk) ? semanticPayload.risk : {}
  return {
    controlLevel: semanticPayload.controlLevel,
    decision: semanticPayload.decision === "deny" ? "deny" : "allow",
    ...(readString(semanticPayload.message)
      ? { message: readString(semanticPayload.message) }
      : {}),
    riskLevel: readString(risk.riskLevel) ?? "unknown",
    toolName: readString(risk.toolName) ?? null,
    reason: readString(risk.reason) ?? null,
    categories: getObservedRiskCategories(risk),
  }
}

function readPayloadString(
  payload: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = readString(payload[key])
    if (value) return value
  }
  return undefined
}

function getToolSummary(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  const nestedTool = isRecord(payload.tool) ? payload.tool : {}
  return (
    readPayloadString(payload, ["toolName", "name", "displayName"]) ??
    readPayloadString(nestedTool, ["toolName", "name", "displayName"])
  )
}

function getCommandSummary(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  return readPayloadString(payload, ["command", "cmd", "displayCommand"])
}

function getQuestionSummary(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  return readPayloadString(payload, ["question", "prompt", "message"])
}

function getArtifactSummary(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  return readPayloadString(payload, ["path", "artifactPath", "manifestPath"])
}

function getFileChangeSummary(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  return readPayloadString(payload, [
    "path",
    "filePath",
    "absolutePath",
    "relativePath",
    "newPath",
  ])
}

function getStatusFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  return readPayloadString(payload, [
    "status",
    "state",
    "resultSubtype",
    "decision",
  ])
}

function getRuntimeSummary(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  return (
    readPayloadString(payload, ["message", "status", "component"]) ??
    readPayloadString(isRecord(payload.runtime) ? payload.runtime : {}, [
      "id",
      "name",
    ])
  )
}

function getMcpStatus(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  const nestedMcp = isRecord(payload.mcp) ? payload.mcp : {}
  return (
    readPayloadString(payload, ["status"]) ??
    readPayloadString(nestedMcp, ["status"])
  )
}

function getUsagePayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {}
  return isRecord(payload.messageMetadata) ? payload.messageMetadata : payload
}

function getUsage(payload: unknown): WorkbenchTraceUsage | undefined {
  const usagePayload = getUsagePayload(payload)
  const inputTokens = readNumber(usagePayload.inputTokens)
  const outputTokens = readNumber(usagePayload.outputTokens)
  const totalTokens =
    readNumber(usagePayload.totalTokens) ??
    (inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined)
  const estimatedCostUsd = readNumber(usagePayload.totalCostUsd)
  const cacheReadInputTokens = readNumber(usagePayload.cacheReadInputTokens)
  const cacheCreationInputTokens = readNumber(
    usagePayload.cacheCreationInputTokens,
  )
  const modelContextWindow =
    readNumber(usagePayload.modelContextWindow) ??
    readNumber(usagePayload.contextWindow)
  const durationMs = readNumber(usagePayload.durationMs)
  const hasAnyValue =
    inputTokens !== undefined ||
    outputTokens !== undefined ||
    totalTokens !== undefined ||
    estimatedCostUsd !== undefined ||
    cacheReadInputTokens !== undefined ||
    cacheCreationInputTokens !== undefined ||
    modelContextWindow !== undefined ||
    durationMs !== undefined

  if (!hasAnyValue) return undefined

  const missing: WorkbenchTraceUsage["missing"] = []
  if (!readString(usagePayload.provider)) missing.push("provider")
  if (estimatedCostUsd === undefined) missing.push("cost")
  if (
    cacheReadInputTokens === undefined &&
    cacheCreationInputTokens === undefined
  ) {
    missing.push("cache")
  }
  if (modelContextWindow === undefined) missing.push("context")

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(cacheReadInputTokens !== undefined ? { cacheReadInputTokens } : {}),
    ...(cacheCreationInputTokens !== undefined
      ? { cacheCreationInputTokens }
      : {}),
    ...(modelContextWindow !== undefined ? { modelContextWindow } : {}),
    missing,
  }
}

function getUsageSummary(
  usage: WorkbenchTraceUsage | undefined,
): string | undefined {
  if (!usage) return undefined
  const total = usage.totalTokens ?? usage.inputTokens ?? usage.outputTokens
  if (total === undefined) return undefined
  return `${total.toLocaleString()} tokens`
}

function getErrorCode(payload: unknown): string {
  if (!isRecord(payload)) return "internal_error"
  return (
    readPayloadString(payload, ["code", "errorCode", "productCode"]) ??
    "internal_error"
  )
}

export function getWorkbenchTraceError(payload: unknown): WorkbenchTraceError {
  const code = getErrorCode(payload)
  const copy = PRODUCT_ERROR_COPY[code] ?? PRODUCT_ERROR_COPY.internal_error
  const payloadRecord = isRecord(payload) ? payload : {}
  const message =
    readPayloadString(payloadRecord, ["message", "errorMessage", "details"]) ??
    undefined

  return {
    code,
    title: copy.title,
    body: copy.body,
    nextAction: copy.nextAction,
    ...(message ? { details: message } : {}),
  }
}

function getFinalStatus(payload: unknown): string {
  const status = getStatusFromPayload(payload)
  if (status === "success") return "succeeded"
  if (status === "cancelled") return "canceled"
  if (
    status === "succeeded" ||
    status === "failed" ||
    status === "canceled" ||
    status === "interrupted"
  ) {
    return status
  }
  return "succeeded"
}

function getKindForStatusPayload(payload: unknown): WorkbenchTraceKind {
  if (!isRecord(payload)) return "runtime"
  const chunkType = readString(payload.chunkType)
  if (chunkType?.startsWith("file-change-")) return "file-change"
  const component = readString(payload.component)
  if (component === "mcp") return "mcp"
  if (component === "provider") return "provider"
  return "runtime"
}

function getStatusTitleKey(payload: unknown): TranslationKey {
  const kind = getKindForStatusPayload(payload)
  if (kind === "file-change") return "workbench.event.fileChange"
  if (kind === "mcp") return "workbench.event.mcpStatus"
  if (kind === "provider") return "workbench.event.providerStatus"
  return "workbench.event.status"
}

function getRowParts(
  event: WorkbenchTraceEvent,
  semanticPayload: unknown,
): Pick<
  WorkbenchTraceRow,
  | "kind"
  | "titleKey"
  | "severity"
  | "status"
  | "summary"
  | "nextAction"
  | "observedPermission"
  | "usage"
  | "error"
> {
  const observedPermission = getObservedPermissionPayload(
    event,
    semanticPayload,
  )

  switch (event.type) {
    case "assistant_delta":
      return {
        kind: "assistant",
        titleKey: "workbench.event.assistantDelta",
        severity: "info",
        summary: readString(semanticPayload),
      }
    case "reasoning_delta":
      return {
        kind: "reasoning",
        titleKey: "workbench.event.reasoningDelta",
        severity: "info",
        summary: readString(semanticPayload),
      }
    case "tool_started":
      return {
        kind: "tool",
        titleKey: "workbench.event.toolStarted",
        severity: "info",
        status: "started",
        summary: getToolSummary(semanticPayload),
      }
    case "tool_delta":
      return {
        kind: "tool",
        titleKey: "workbench.event.toolDelta",
        severity: "info",
        status: "running",
        summary: getToolSummary(semanticPayload),
      }
    case "tool_finished":
      return {
        kind: "tool",
        titleKey: "workbench.event.toolFinished",
        severity:
          isRecord(semanticPayload) && semanticPayload.error
            ? "error"
            : "success",
        status:
          isRecord(semanticPayload) && semanticPayload.error
            ? "failed"
            : "completed",
        summary: getToolSummary(semanticPayload),
      }
    case "guard_decision":
      return {
        kind: "approval",
        titleKey: "workbench.event.guardDecision",
        severity:
          getStatusFromPayload(semanticPayload) === "deny" ? "warning" : "info",
        status: getStatusFromPayload(semanticPayload),
        summary: isRecord(semanticPayload)
          ? readPayloadString(semanticPayload, ["message", "reason"])
          : undefined,
      }
    case "permission_requested":
      return {
        kind: "approval",
        titleKey: "workbench.event.permissionRequested",
        severity: observedPermission?.decision === "deny" ? "warning" : "info",
        status:
          observedPermission?.decision ?? getStatusFromPayload(semanticPayload),
        summary:
          observedPermission?.toolName ??
          (isRecord(semanticPayload)
            ? readPayloadString(semanticPayload, ["message", "reason"])
            : undefined),
        observedPermission,
      }
    case "scope_expansion_requested":
      return {
        kind: "approval",
        titleKey: "workbench.event.scopeExpansionRequested",
        severity: "warning",
        status: "pending",
        nextAction: "Review the requested scope expansion.",
      }
    case "question_pending":
      return {
        kind: "question",
        titleKey: "workbench.event.questionPending",
        severity: "warning",
        status: "pending",
        summary: getQuestionSummary(semanticPayload),
      }
    case "question_result":
      return {
        kind: "question",
        titleKey: "workbench.event.questionResult",
        severity: "success",
        status: "answered",
        summary: getQuestionSummary(semanticPayload),
      }
    case "mcp_needs_auth":
      return {
        kind: "mcp",
        titleKey: "workbench.event.mcpNeedsAuth",
        severity: "warning",
        status: "needs-auth",
        summary: isRecord(semanticPayload)
          ? readPayloadString(semanticPayload, [
              "serverName",
              "name",
              "message",
            ])
          : undefined,
        nextAction: PRODUCT_ERROR_COPY.mcp_auth_required.nextAction,
      }
    case "usage_update": {
      const usage = getUsage(semanticPayload)
      return {
        kind: "usage",
        titleKey: "workbench.event.usageUpdate",
        severity: "info",
        status: usage ? "observed" : "unavailable",
        summary: getUsageSummary(usage),
        usage,
      }
    }
    case "command_started":
      return {
        kind: "command",
        titleKey: "workbench.event.commandStarted",
        severity: "info",
        status: "started",
        summary: getCommandSummary(semanticPayload),
      }
    case "command_output":
      return {
        kind: "command",
        titleKey: "workbench.event.commandOutput",
        severity: "info",
        status: "running",
        summary: getCommandSummary(semanticPayload),
      }
    case "command_finished":
      return {
        kind: "command",
        titleKey: "workbench.event.commandFinished",
        severity:
          isRecord(semanticPayload) &&
          readNumber(semanticPayload.exitCode) !== 0
            ? "error"
            : "success",
        status:
          isRecord(semanticPayload) &&
          readNumber(semanticPayload.exitCode) !== 0
            ? "failed"
            : "completed",
        summary: getCommandSummary(semanticPayload),
      }
    case "artifact_created":
      return {
        kind: "artifact",
        titleKey: "workbench.event.artifactCreated",
        severity: "success",
        status: "created",
        summary: getArtifactSummary(semanticPayload),
      }
    case "status": {
      const kind = getKindForStatusPayload(semanticPayload)
      return {
        kind,
        titleKey: getStatusTitleKey(semanticPayload),
        severity:
          getStatusFromPayload(semanticPayload) === "failed" ? "error" : "info",
        status:
          kind === "mcp"
            ? getMcpStatus(semanticPayload)
            : getStatusFromPayload(semanticPayload),
        summary:
          kind === "file-change"
            ? getFileChangeSummary(semanticPayload)
            : getRuntimeSummary(semanticPayload),
      }
    }
    case "error": {
      const error = getWorkbenchTraceError(semanticPayload)
      return {
        kind: "error",
        titleKey: "workbench.event.error",
        severity: "error",
        status: error.code,
        summary: error.title,
        nextAction: error.nextAction,
        error,
      }
    }
    case "completed": {
      const status = getFinalStatus(semanticPayload)
      return {
        kind: "final",
        titleKey:
          status === "canceled"
            ? "workbench.event.canceled"
            : "workbench.event.completed",
        severity:
          status === "failed" || status === "interrupted"
            ? "error"
            : status === "canceled"
              ? "warning"
              : "success",
        status,
        summary: isRecord(semanticPayload)
          ? readPayloadString(semanticPayload, ["message", "summary"])
          : undefined,
      }
    }
    case "job_created":
      return {
        kind: "runtime",
        titleKey: "workbench.event.jobCreated",
        severity: "info",
        status: "created",
        summary: getRuntimeSummary(semanticPayload),
      }
    case "job_started":
      return {
        kind: "runtime",
        titleKey: "workbench.event.jobStarted",
        severity: "info",
        status: "started",
        summary: getRuntimeSummary(semanticPayload),
      }
    default:
      return {
        kind: "unknown",
        titleKey: "workbench.event.unknown",
        severity: "info",
        status: getStatusFromPayload(semanticPayload),
        summary: isRecord(semanticPayload)
          ? readPayloadString(semanticPayload, ["message", "summary"])
          : readString(semanticPayload),
      }
  }
}

export function getWorkbenchTraceRow(
  event: WorkbenchTraceEvent,
): WorkbenchTraceRow {
  const semanticPayload = getWorkbenchSemanticPayload(event)
  const parts = getRowParts(event, semanticPayload)
  return {
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    semanticPayload,
    rawPayload: event.payload,
    hasRawPayload: !samePayload(event.payload, semanticPayload),
    createdAt: event.createdAt,
    ...parts,
  }
}
