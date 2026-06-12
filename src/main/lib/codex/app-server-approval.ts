import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  decideCodexAcpToolPermission,
  type CodexAcpPermissionTool,
} from "./acp-permission"
import type { CodexAskUserQuestionPending } from "./ask-user-question"
import {
  QUESTIONS_SKIPPED_MESSAGE,
  QUESTIONS_TIMED_OUT_MESSAGE,
  type CodexAskUserQuestionApproval,
} from "./ask-user-question"
import type { CodexAppServerMessageId } from "./app-server-transport"
import type {
  CodexAppServerPermissionMapping,
  ObservedToolPolicy,
} from "../agent-runtime/permission-policy"
import { redactRuntimePayload } from "../agent-runtime/redaction"
import {
  resolveGuardedScopedShellWriteApproval,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import { normalizeToolPathInsideCwd } from "../agent-guard/contract"
import {
  applyCodexControlledEdit,
  dynamicToolResponse,
  isCodexControlledEditToolCall,
  prepareCodexControlledEdit,
  type CodexAppServerDynamicToolCallParams,
  type CodexAppServerDynamicToolCallResponse,
} from "./app-server-controlled-edit"

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type CodexAppServerCommandExecutionRequestApprovalParams = {
  threadId: string
  turnId: string
  itemId: string
  startedAtMs: number
  approvalId?: string | null
  reason?: string | null
  command?: string | null
  cwd?: string | null
}

export type CodexAppServerFileChangeRequestApprovalParams = {
  threadId: string
  turnId: string
  itemId: string
  startedAtMs: number
  reason?: string | null
  grantRoot?: string | null
}

export type CodexAppServerPermissionsRequestApprovalParams = {
  threadId: string
  turnId: string
  itemId: string
  startedAtMs: number
  cwd: string
  reason: string | null
  permissions: {
    network: { enabled: boolean | null } | null
    fileSystem: {
      read: string[] | null
      write: string[] | null
      globScanMaxDepth?: number
      entries?: JsonValue[]
    } | null
  }
}

export type CodexAppServerExecCommandApprovalParams = {
  conversationId: string
  callId: string
  approvalId: string | null
  command: string[]
  cwd: string
  reason: string | null
}

export type CodexAppServerApplyPatchApprovalParams = {
  conversationId: string
  callId: string
  fileChanges: Record<string, unknown>
  reason: string | null
  grantRoot: string | null
}

export type CodexAppServerApprovalBridgeInput = {
  subChatId: string
  permission: CodexAppServerPermissionMapping
  controlledEditEnabled?: boolean
  guardedContract?: ValidatedAgentScopeContract | null
  emit?: (chunk: Record<string, unknown>) => void
  registerPendingQuestion?: (
    toolUseId: string,
    pending: CodexAskUserQuestionPending,
  ) => void
  unregisterPendingQuestion?: (toolUseId: string) => void
  onGuardEvent?: (event: AgentGuardEvent) => void
  onObservedToolDecision?: (event: {
    controlLevel: "observe"
    decision: "allow" | "deny"
    risk: unknown
    message?: string
  }) => void
  timeoutMs?: number
}

type AppServerApprovalDecision =
  | {
      allowedByPolicy: true
      tool: CodexAcpPermissionTool
      message?: string
      permissionsGrant?: CodexAppServerPermissionsRequestApprovalParams["permissions"]
    }
  | {
      allowedByPolicy: false
      tool: CodexAcpPermissionTool
      message: string
    }

const DEFAULT_TIMEOUT_MS = 60000
const APPROVE_OPTION_LABEL = "Approve"
const DENY_OPTION_LABEL = "Deny"

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function redactedText(value: string): string {
  const result = redactRuntimePayload(value, {
    runtimeId: "codex",
    runId: "codex-app-server-approval",
    source: "desktop-adapter",
  })
  return typeof result.payload === "string" ? result.payload : value
}

function requestIdForPending(id: CodexAppServerMessageId): string {
  return String(id).replace(/[^A-Za-z0-9_.:-]/g, "_")
}

function approvalToolUseId(input: {
  prefix: string
  requestId: CodexAppServerMessageId
  toolUseId: string
}): string {
  return `codex-app-server-${input.prefix}-${requestIdForPending(input.requestId)}-${input.toolUseId}`
}

function responseForRejectedApproval(
  approval: CodexAskUserQuestionApproval,
): "decline" | "cancel" {
  return approval.message === QUESTIONS_TIMED_OUT_MESSAGE ? "cancel" : "decline"
}

function legacyResponseForRejectedApproval(
  approval: CodexAskUserQuestionApproval,
): "denied" | "timed_out" | "abort" {
  if (approval.message === QUESTIONS_TIMED_OUT_MESSAGE) return "timed_out"
  if (approval.message === QUESTIONS_SKIPPED_MESSAGE) return "denied"
  return "denied"
}

function isDenyApprovalSelection(approval: CodexAskUserQuestionApproval): boolean {
  const answers =
    typeof approval.updatedInput === "object" &&
    approval.updatedInput !== null &&
    "answers" in approval.updatedInput &&
    typeof (approval.updatedInput as { answers?: unknown }).answers === "object" &&
    (approval.updatedInput as { answers?: unknown }).answers !== null
      ? (approval.updatedInput as { answers: Record<string, unknown> }).answers
      : {}

  return Object.values(answers).some((answer) => {
    if (typeof answer === "string") return answer === DENY_OPTION_LABEL
    if (Array.isArray(answer)) return answer.includes(DENY_OPTION_LABEL)
    return false
  })
}

function approvalAccepted(approval: CodexAskUserQuestionApproval): boolean {
  return approval.approved && !isDenyApprovalSelection(approval)
}

function createCommandTool(
  params: CodexAppServerCommandExecutionRequestApprovalParams,
): CodexAcpPermissionTool {
  const toolUseId = params.approvalId || params.itemId
  const command = cleanString(params.command)
  return {
    toolUseId,
    toolName: "Bash",
    toolInput: {
      ...(command ? { command } : {}),
      ...(params.cwd ? { cwd: params.cwd } : {}),
      ...(params.reason ? { reason: params.reason } : {}),
    },
    kind: "execute",
    title: command ? `Run ${command}` : "Run command",
  }
}

function createLegacyCommandTool(
  params: CodexAppServerExecCommandApprovalParams,
): CodexAcpPermissionTool {
  const command = params.command.filter(Boolean).join(" ").trim()
  return {
    toolUseId: params.approvalId || params.callId,
    toolName: "Bash",
    toolInput: {
      ...(command ? { command } : {}),
      cwd: params.cwd,
      ...(params.reason ? { reason: params.reason } : {}),
    },
    kind: "execute",
    title: command ? `Run ${command}` : "Run command",
  }
}

function createFileTool(
  params: CodexAppServerFileChangeRequestApprovalParams,
): CodexAcpPermissionTool {
  const path = cleanString(params.grantRoot)
  return {
    toolUseId: params.itemId,
    toolName: "Edit",
    toolInput: {
      ...(path ? { path, file_path: path } : {}),
      ...(params.reason ? { reason: params.reason } : {}),
    },
    kind: "edit",
    title: path ? `Edit ${path}` : "Edit files",
  }
}

function createLegacyPatchTool(
  params: CodexAppServerApplyPatchApprovalParams,
): CodexAcpPermissionTool {
  const firstPath = Object.keys(params.fileChanges)[0] || params.grantRoot || ""
  return {
    toolUseId: params.callId,
    toolName: "Edit",
    toolInput: {
      ...(firstPath ? { path: firstPath, file_path: firstPath } : {}),
      fileChanges: params.fileChanges as JsonValue,
      ...(params.reason ? { reason: params.reason } : {}),
    },
    kind: "edit",
    title: firstPath ? `Edit ${firstPath}` : "Apply patch",
  }
}

function permissionWritePaths(
  params: CodexAppServerPermissionsRequestApprovalParams,
): string[] {
  return [
    ...(params.permissions.fileSystem?.write ?? []),
    ...(params.permissions.fileSystem?.entries ?? [])
      .map((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof entry.path === "string"
          ? entry.path
          : null,
      )
      .filter((path): path is string => Boolean(path)),
  ]
}

function createPermissionTool(
  params: CodexAppServerPermissionsRequestApprovalParams,
): CodexAcpPermissionTool {
  const writePath = permissionWritePaths(params)[0] ?? ""
  return {
    toolUseId: params.itemId,
    toolName: writePath ? "Edit" : "Bash",
    toolInput: {
      ...(writePath ? { path: writePath, file_path: writePath } : {}),
      cwd: params.cwd,
      permissions: params.permissions as JsonValue,
      ...(params.reason ? { reason: params.reason } : {}),
    },
    kind: writePath ? "edit" : "execute",
    title: params.reason || "Request permissions",
  }
}

function policyDecisionForTool(input: {
  tool: CodexAcpPermissionTool
  permission: CodexAppServerPermissionMapping
  guardedContract?: ValidatedAgentScopeContract | null
  onGuardEvent?: (event: AgentGuardEvent) => void
  onObservedToolDecision?: CodexAppServerApprovalBridgeInput["onObservedToolDecision"]
}): AppServerApprovalDecision {
  const decision = decideCodexAcpToolPermission({
    tool: input.tool,
    mode: input.permission.controlLevel === "plan" ? "plan" : "agent",
    controlLevel: input.permission.controlLevel,
    observedToolPolicy: input.permission.observedToolPolicy as ObservedToolPolicy,
    contract: input.guardedContract ?? null,
  })

  if (decision.guardEvent) input.onGuardEvent?.(decision.guardEvent)
  if (decision.observed) input.onObservedToolDecision?.(decision.observed)

  if (decision.decision !== "allow") {
    return {
      allowedByPolicy: false,
      tool: input.tool,
      message: decision.message || "Codex app-server approval denied by policy.",
    }
  }

  return {
    allowedByPolicy: true,
    tool: input.tool,
    ...(decision.message ? { message: decision.message } : {}),
  }
}

function policyDecisionForCommandTool(input: {
  tool: CodexAcpPermissionTool
  permission: CodexAppServerPermissionMapping
  guardedContract?: ValidatedAgentScopeContract | null
  onGuardEvent?: (event: AgentGuardEvent) => void
  onObservedToolDecision?: CodexAppServerApprovalBridgeInput["onObservedToolDecision"]
}): AppServerApprovalDecision {
  const command = cleanString(input.tool.toolInput.command)
  if (
    input.permission.controlLevel === "guarded" &&
    input.guardedContract &&
    input.tool.toolName === "Bash" &&
    command
  ) {
    const decision = resolveGuardedScopedShellWriteApproval({
      contract: input.guardedContract,
      toolName: input.tool.toolName,
      toolInput: input.tool.toolInput,
      toolUseId: input.tool.toolUseId,
    })
    if (decision?.decision === "allow" && decision.requiresUserApproval) {
      input.onGuardEvent?.(decision.event)
      return {
        allowedByPolicy: true,
        tool: input.tool,
        message: decision.reason,
      }
    }
  }

  return policyDecisionForTool(input)
}

export function resolveCodexAppServerPermissionsApprovalDecision(input: {
  params: CodexAppServerPermissionsRequestApprovalParams
  permission: CodexAppServerPermissionMapping
  guardedContract?: ValidatedAgentScopeContract | null
  onGuardEvent?: (event: AgentGuardEvent) => void
  onObservedToolDecision?: CodexAppServerApprovalBridgeInput["onObservedToolDecision"]
}): AppServerApprovalDecision {
  const tool = createPermissionTool(input.params)
  const requestedNetwork = input.params.permissions.network?.enabled === true

  if (requestedNetwork) {
    return {
      allowedByPolicy: false,
      tool,
      message: "Codex app-server runs do not grant network permission expansions.",
    }
  }

  if (input.guardedContract) {
    for (const rawPath of permissionWritePaths(input.params)) {
      const normalized = normalizeToolPathInsideCwd(
        input.guardedContract.cwd,
        rawPath,
      )
      const pathTool: CodexAcpPermissionTool = {
        ...tool,
        toolInput: {
          ...tool.toolInput,
          ...(normalized ? { path: normalized, file_path: normalized } : {}),
        },
      }
      const decision = policyDecisionForTool({
        tool: pathTool,
        permission: input.permission,
        guardedContract: input.guardedContract,
        onGuardEvent: input.onGuardEvent,
        onObservedToolDecision: input.onObservedToolDecision,
      })
      if (!decision.allowedByPolicy) {
        return {
          ...decision,
          message:
            normalized === null
              ? "Codex app-server permission request escapes the guarded workspace."
              : decision.message,
        }
      }
    }
  }

  const decision = policyDecisionForTool({
    tool,
    permission: input.permission,
    guardedContract: input.guardedContract,
    onGuardEvent: input.onGuardEvent,
    onObservedToolDecision: input.onObservedToolDecision,
  })
  if (!decision.allowedByPolicy) return decision

  return {
    ...decision,
    permissionsGrant: input.params.permissions,
  }
}

async function waitForApproval(input: {
  subChatId: string
  toolUseId: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
  timeoutMs: number
  emit: (chunk: Record<string, unknown>) => void
  registerPending: (
    toolUseId: string,
    pending: CodexAskUserQuestionPending,
  ) => void
  unregisterPending: (toolUseId: string) => void
}): Promise<CodexAskUserQuestionApproval> {
  input.emit({
    type: "ask-user-question",
    toolUseId: input.toolUseId,
    questions: input.questions,
  })

  return new Promise<CodexAskUserQuestionApproval>((resolve) => {
    const timeoutId = setTimeout(() => {
      input.unregisterPending(input.toolUseId)
      input.emit({
        type: "ask-user-question-timeout",
        toolUseId: input.toolUseId,
      })
      resolve({
        approved: false,
        message: QUESTIONS_TIMED_OUT_MESSAGE,
      })
    }, input.timeoutMs)

    input.registerPending(input.toolUseId, {
      subChatId: input.subChatId,
      resolve: (approval) => {
        clearTimeout(timeoutId)
        resolve(approval)
      },
    })
  })
}

function approvalQuestion(input: {
  header: string
  body: string
  policyMessage?: string
}) {
  const detail = input.policyMessage
    ? `${input.body}\n\nPolicy: ${input.policyMessage}`
    : input.body
  return {
    header: input.header,
    question: redactedText(detail),
    options: [
      { label: APPROVE_OPTION_LABEL, description: "Allow this action once." },
      { label: DENY_OPTION_LABEL, description: "Decline this action." },
    ],
    multiSelect: false,
  }
}

export function createCodexAppServerApprovalBridge({
  subChatId,
  permission,
  controlledEditEnabled = false,
  guardedContract = null,
  emit,
  registerPendingQuestion,
  unregisterPendingQuestion,
  onGuardEvent,
  onObservedToolDecision,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: CodexAppServerApprovalBridgeInput) {
  const canAskUser = Boolean(
    emit && registerPendingQuestion && unregisterPendingQuestion,
  )

  async function askUser(input: {
    requestId: CodexAppServerMessageId
    prefix: string
    tool: CodexAcpPermissionTool
    question: ReturnType<typeof approvalQuestion>
  }): Promise<CodexAskUserQuestionApproval> {
    if (!canAskUser || !emit || !registerPendingQuestion || !unregisterPendingQuestion) {
      return {
        approved: false,
        message: "Codex app-server approval bridge is not installed.",
      }
    }

    const toolUseId = approvalToolUseId({
      prefix: input.prefix,
      requestId: input.requestId,
      toolUseId: input.tool.toolUseId,
    })
    const approval = await waitForApproval({
      subChatId,
      toolUseId,
      questions: [input.question],
      timeoutMs,
      emit,
      registerPending: registerPendingQuestion,
      unregisterPending: unregisterPendingQuestion,
    })
    unregisterPendingQuestion(toolUseId)
    emit({
      type: "ask-user-question-result",
      toolUseId,
      result: approvalAccepted(approval)
        ? "approved"
        : approval.message || "declined",
    })
    return approval
  }

  return {
    async handleCommandExecution(input: {
      requestId: CodexAppServerMessageId
      params: CodexAppServerCommandExecutionRequestApprovalParams
    }) {
      const tool = createCommandTool(input.params)
      const decision = policyDecisionForCommandTool({
        tool,
        permission,
        guardedContract,
        onGuardEvent,
        onObservedToolDecision,
      })
      if (!decision.allowedByPolicy) return { decision: "decline" }

      const approval = await askUser({
        requestId: input.requestId,
        prefix: "command-approval",
        tool,
        question: approvalQuestion({
          header: "Run command",
          body: cleanString(input.params.command) || "Run command",
          policyMessage: decision.message,
        }),
      })
      return {
        decision: approvalAccepted(approval)
          ? "accept"
          : responseForRejectedApproval(approval),
      }
    },

    async handleFileChange(input: {
      requestId: CodexAppServerMessageId
      params: CodexAppServerFileChangeRequestApprovalParams
    }) {
      const tool = createFileTool(input.params)
      const decision = policyDecisionForTool({
        tool,
        permission,
        guardedContract,
        onGuardEvent,
        onObservedToolDecision,
      })
      if (!decision.allowedByPolicy) return { decision: "decline" }

      const approval = await askUser({
        requestId: input.requestId,
        prefix: "file-approval",
        tool,
        question: approvalQuestion({
          header: "Allow file change",
          body:
            cleanString(input.params.grantRoot) ||
            cleanString(input.params.reason) ||
            "Allow file change",
          policyMessage: decision.message,
        }),
      })
      return {
        decision: approvalAccepted(approval)
          ? "accept"
          : responseForRejectedApproval(approval),
      }
    },

    async handlePermissions(input: {
      requestId: CodexAppServerMessageId
      params: CodexAppServerPermissionsRequestApprovalParams
    }) {
      const decision = resolveCodexAppServerPermissionsApprovalDecision({
        params: input.params,
        permission,
        guardedContract,
        onGuardEvent,
        onObservedToolDecision,
      })
      if (!decision.allowedByPolicy) {
        return { permissions: {}, scope: "turn", strictAutoReview: true }
      }

      const approval = await askUser({
        requestId: input.requestId,
        prefix: "permissions-approval",
        tool: decision.tool,
        question: approvalQuestion({
          header: "Grant runtime permission",
          body:
            cleanString(input.params.reason) ||
            JSON.stringify(input.params.permissions),
          policyMessage: decision.message,
        }),
      })
      return {
        permissions: approvalAccepted(approval)
          ? (decision.permissionsGrant ?? input.params.permissions)
          : {},
        scope: "turn",
        strictAutoReview: true,
      }
    },

    async handleLegacyExecCommand(input: {
      requestId: CodexAppServerMessageId
      params: CodexAppServerExecCommandApprovalParams
    }) {
      const tool = createLegacyCommandTool(input.params)
      const decision = policyDecisionForCommandTool({
        tool,
        permission,
        guardedContract,
        onGuardEvent,
        onObservedToolDecision,
      })
      if (!decision.allowedByPolicy) return { decision: "denied" }
      const approval = await askUser({
        requestId: input.requestId,
        prefix: "legacy-command-approval",
        tool,
        question: approvalQuestion({
          header: "Run command",
          body: input.params.command.join(" "),
          policyMessage: decision.message,
        }),
      })
      return {
        decision: approvalAccepted(approval)
          ? "approved"
          : legacyResponseForRejectedApproval(approval),
      }
    },

    async handleLegacyApplyPatch(input: {
      requestId: CodexAppServerMessageId
      params: CodexAppServerApplyPatchApprovalParams
    }) {
      const tool = createLegacyPatchTool(input.params)
      const decision = policyDecisionForTool({
        tool,
        permission,
        guardedContract,
        onGuardEvent,
        onObservedToolDecision,
      })
      if (!decision.allowedByPolicy) return { decision: "denied" }
      const approval = await askUser({
        requestId: input.requestId,
        prefix: "legacy-patch-approval",
        tool,
        question: approvalQuestion({
          header: "Apply patch",
          body: Object.keys(input.params.fileChanges).join(", ") || "Apply patch",
          policyMessage: decision.message,
        }),
      })
      return {
        decision: approvalAccepted(approval)
          ? "approved"
          : legacyResponseForRejectedApproval(approval),
      }
    },

    async handleDynamicToolCall(input: {
      requestId: CodexAppServerMessageId
      params: CodexAppServerDynamicToolCallParams
    }): Promise<CodexAppServerDynamicToolCallResponse> {
      if (!isCodexControlledEditToolCall(input.params)) {
        return dynamicToolResponse(false, "Unsupported Codex app-server dynamic tool.")
      }
      if (!controlledEditEnabled) {
        return dynamicToolResponse(false, "Controlled edit executor is not enabled.")
      }
      if (!canAskUser || !emit || !registerPendingQuestion || !unregisterPendingQuestion) {
        return dynamicToolResponse(
          false,
          "Controlled edit requires an installed approval UI.",
        )
      }

      const prepared = prepareCodexControlledEdit({
        params: input.params,
        permission,
        guardedContract,
        onGuardEvent,
        onObservedToolDecision,
      })
      if (!prepared.ok) return dynamicToolResponse(false, prepared.message)

      emit({
        type: "file-change-diff",
        path: prepared.edit.relativePath,
        operation: prepared.edit.operation,
        diff: redactedText(prepared.edit.diff),
        source: "codex-app-server-controlled-edit",
      })
      const approval = await askUser({
        requestId: input.requestId,
        prefix: "controlled-edit-approval",
        tool: prepared.edit.tool,
        question: approvalQuestion({
          header: "Apply edit",
          body: `Apply ${prepared.edit.operation} to ${prepared.edit.relativePath}\n\n${prepared.edit.diff}`,
          policyMessage: prepared.edit.policyMessage,
        }),
      })
      if (!approvalAccepted(approval)) {
        return dynamicToolResponse(false, responseForRejectedApproval(approval))
      }

      try {
        applyCodexControlledEdit(prepared.edit)
      } catch (error) {
        return dynamicToolResponse(
          false,
          error instanceof Error
            ? error.message
            : "Controlled edit failed before writing.",
        )
      }

      emit({
        type: "file-change-delta",
        path: prepared.edit.relativePath,
        operation: prepared.edit.operation,
        status: "applied",
        source: "codex-app-server-controlled-edit",
      })
      return dynamicToolResponse(
        true,
        `Applied controlled edit to ${prepared.edit.relativePath}.`,
      )
    },
  }
}
