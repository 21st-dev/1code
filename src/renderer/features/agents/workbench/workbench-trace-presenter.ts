import {
  DESKTOP_RUNTIME_CONTROL_LEVELS,
  type DesktopRuntimeControlLevel,
} from "../../../../shared/agent-runtime-control"
import type { TranslationKey } from "../../../lib/i18n"

export type WorkbenchTraceTextValues = Record<string, string | number>

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
  titleKey: TranslationKey
  bodyKey: TranslationKey
  nextActionKey: TranslationKey
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
  summaryKey?: TranslationKey
  summaryValues?: WorkbenchTraceTextValues
  nextAction?: string
  nextActionKey?: TranslationKey
  nextActionValues?: WorkbenchTraceTextValues
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

export const WORKBENCH_TRACE_PRODUCT_ERROR_CODES = [
  "runtime_missing",
  "runtime_not_executable",
  "runtime_spawn_failed",
  "runtime_auth_required",
  "runtime_adapter_unavailable",
  "unsupported_runtime",
  "provider_profile_missing",
  "provider_profile_wrong_target",
  "provider_secret_unavailable",
  "provider_auth_rejected",
  "provider_request_failed",
  "mcp_auth_required",
  "mcp_server_failed",
  "mcp_status_unknown",
  "command_denied",
  "file_change_denied",
  "scope_expansion_required",
  "permission_policy_fail_closed",
  "no_interaction_channel",
  "missing_policy_grant",
  "controlled_edit_rejected",
  "controlled_edit_failed",
  "chat_context_missing",
  "cwd_mismatch",
  "invalid_cwd",
  "worktree_checkout_timeout",
  "worktree_creation_failed",
  "worktree_setup_failed",
  "attachment_invalid",
  "attachment_unsupported",
  "job_canceled",
  "desktop_chat_canceled",
  "desktop_chat_failed",
  "runtime_process_failed",
  "process_error",
  "spawn_failed",
  "heartbeat_failed",
  "internal_error",
  "local_only_guard_blocked",
  "unsupported_capability",
  "unsupported_execution_profile",
] as const

const PRODUCT_ERROR_CODE_SET = new Set<string>(
  WORKBENCH_TRACE_PRODUCT_ERROR_CODES,
)

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
): { key: TranslationKey; values: WorkbenchTraceTextValues } | undefined {
  if (!usage) return undefined
  const total = usage.totalTokens ?? usage.inputTokens ?? usage.outputTokens
  if (total === undefined) return undefined
  return {
    key: "workbench.trace.tokens",
    values: { total: total.toLocaleString() },
  }
}

function getErrorCode(payload: unknown): string {
  if (!isRecord(payload)) return "internal_error"
  return (
    readPayloadString(payload, ["code", "errorCode", "productCode"]) ??
    "internal_error"
  )
}

function getProductErrorCode(code: string): string {
  return PRODUCT_ERROR_CODE_SET.has(code) ? code : "internal_error"
}

function getProductErrorKey(
  code: string,
  field: "title" | "body" | "nextAction",
): TranslationKey {
  return `workbench.error.${getProductErrorCode(code)}.${field}` as TranslationKey
}

export function getWorkbenchTraceError(payload: unknown): WorkbenchTraceError {
  const code = getErrorCode(payload)
  const payloadRecord = isRecord(payload) ? payload : {}
  const message =
    readPayloadString(payloadRecord, ["message", "errorMessage", "details"]) ??
    undefined

  return {
    code,
    titleKey: getProductErrorKey(code, "title"),
    bodyKey: getProductErrorKey(code, "body"),
    nextActionKey: getProductErrorKey(code, "nextAction"),
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
  return "interrupted"
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
  | "summaryKey"
  | "summaryValues"
  | "nextAction"
  | "nextActionKey"
  | "nextActionValues"
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
        nextActionKey: "workbench.trace.scopeExpansion.nextAction",
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
        nextActionKey: getProductErrorKey("mcp_auth_required", "nextAction"),
      }
    case "usage_update": {
      const usage = getUsage(semanticPayload)
      const usageSummary = getUsageSummary(usage)
      return {
        kind: "usage",
        titleKey: "workbench.event.usageUpdate",
        severity: "info",
        status: usage ? "observed" : "unavailable",
        summaryKey: usageSummary?.key,
        summaryValues: usageSummary?.values,
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
        summaryKey: error.titleKey,
        nextActionKey: error.nextActionKey,
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
            : status === "interrupted"
              ? "workbench.event.interrupted"
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
