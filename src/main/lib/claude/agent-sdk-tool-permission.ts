import type {
  HookCallback,
  HookJSONOutput,
  Options as ClaudeAgentSdkOptions,
  PermissionResult,
  PreToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  classifyObservedToolRisk,
  decideClaudeToolUse,
  toClaudePermissionResult,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import type { DesktopPermissionPolicy } from "../agent-runtime/permission-policy"
import type { UIMessageChunk } from "./types"

export type ClaudeAgentSdkCanUseTool = NonNullable<
  ClaudeAgentSdkOptions["canUseTool"]
>

export type ClaudeAgentSdkPreToolUseHook = HookCallback

export type ClaudeAgentSdkPermissionControls = {
  canUseTool: ClaudeAgentSdkCanUseTool
  preToolUseHook: ClaudeAgentSdkPreToolUseHook
}

export type ClaudeAskUserQuestionDecision = {
  approved: boolean
  message?: string
  updatedInput?: unknown
}

export type ClaudeAskUserQuestionPending = {
  subChatId: string
  resolve: (decision: ClaudeAskUserQuestionDecision) => void
}

export type CreateClaudeAgentSdkToolPermissionHandlerInput = {
  isUsingOllama: boolean
  permissionPolicy: DesktopPermissionPolicy
  guardedContract: ValidatedAgentScopeContract | null
  getGuardedContract: (
    contractId: string,
  ) => ValidatedAgentScopeContract | undefined
  recordGuardEvent: (event: AgentGuardEvent) => void
  emit: (chunk: UIMessageChunk) => void
  subChatId: string
  pendingToolApprovals: Map<string, ClaudeAskUserQuestionPending>
  parts: Array<Record<string, any>>
}

const PLAN_MODE_BLOCKED_TOOLS = new Set(["Bash", "NotebookEdit"])

function fixOllamaToolInputAliases(
  toolName: string,
  toolInput: Record<string, unknown>,
): void {
  if (
    (toolName === "Read" ||
      toolName === "Write" ||
      toolName === "Edit") &&
    toolInput.file &&
    !toolInput.file_path
  ) {
    toolInput.file_path = toolInput.file
    delete toolInput.file
    console.log(`[Ollama] Fixed ${toolName} tool: file -> file_path`)
  }

  if (toolName === "Glob") {
    if (toolInput.directory && !toolInput.path) {
      toolInput.path = toolInput.directory
      delete toolInput.directory
      console.log("[Ollama] Fixed Glob tool: directory -> path")
    }
    if (toolInput.dir && !toolInput.path) {
      toolInput.path = toolInput.dir
      delete toolInput.dir
      console.log("[Ollama] Fixed Glob tool: dir -> path")
    }
  }

  if (toolName === "Grep") {
    if (toolInput.query && !toolInput.pattern) {
      toolInput.pattern = toolInput.query
      delete toolInput.query
      console.log("[Ollama] Fixed Grep tool: query -> pattern")
    }
    if (toolInput.directory && !toolInput.path) {
      toolInput.path = toolInput.directory
      delete toolInput.directory
      console.log("[Ollama] Fixed Grep tool: directory -> path")
    }
  }

  if (toolName === "Bash" && toolInput.cmd && !toolInput.command) {
    toolInput.command = toolInput.cmd
    delete toolInput.cmd
    console.log("[Ollama] Fixed Bash tool: cmd -> command")
  }
}

function isPreToolUseHookInput(
  input: Parameters<HookCallback>[0],
): input is PreToolUseHookInput {
  return input.hook_event_name === "PreToolUse"
}

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>) }
  }
  return {}
}

function toClaudePreToolUseHookOutput(
  decision: PermissionResult,
): HookJSONOutput {
  if (decision.behavior === "deny") {
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: decision.message,
      },
    }
  }

  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      ...(decision.updatedInput ? { updatedInput: decision.updatedInput } : {}),
    },
  }
}

export function createClaudeAgentSdkPermissionControls({
  isUsingOllama,
  permissionPolicy,
  guardedContract,
  getGuardedContract,
  recordGuardEvent,
  emit,
  subChatId,
  pendingToolApprovals,
  parts,
}: CreateClaudeAgentSdkToolPermissionHandlerInput): ClaudeAgentSdkPermissionControls {
  const preToolUseDecisions = new Map<string, PermissionResult>()

  const decideToolPermission = async ({
    toolName,
    toolInput,
    toolUseID,
    handleAskUserQuestion,
  }: {
    toolName: string
    toolInput: Record<string, unknown>
    toolUseID: string
    handleAskUserQuestion: boolean
  }): Promise<PermissionResult> => {
    if (isUsingOllama) {
      fixOllamaToolInputAliases(toolName, toolInput)
    }

    if (permissionPolicy.planWorkspaceSideEffects === "deny") {
      if (toolName === "Edit" || toolName === "Write") {
        return {
          behavior: "deny",
          message: `Tool "${toolName}" blocked in plan mode.`,
        }
      }
      if (toolName === "ExitPlanMode") {
        return {
          behavior: "deny",
          message:
            "IMPORTANT: DONT IMPLEMENT THE PLAN UNTIL THE EXPLIT COMMAND. THE PLAN WAS **ONLY** PRESENTED TO USER, FINISH CURRENT MESSAGE AS SOON AS POSSIBLE",
        }
      }
      if (PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
        return {
          behavior: "deny",
          message: `Tool "${toolName}" blocked in plan mode.`,
        }
      }
    }

    if (
      guardedContract &&
      permissionPolicy.enforcement === "locus-guarded-tool-policy" &&
      toolName !== "AskUserQuestion"
    ) {
      const currentGuardedContract =
        getGuardedContract(guardedContract.id) ?? guardedContract
      const decision = decideClaudeToolUse({
        contract: currentGuardedContract,
        toolName,
        toolInput,
        toolUseId: toolUseID,
      })
      recordGuardEvent(decision.event)
      emit({
        type: "guard-event",
        event: decision.event,
      })
      return toClaudePermissionResult(decision)
    }

    if (toolName === "AskUserQuestion") {
      if (!handleAskUserQuestion) {
        return {
          behavior: "allow",
          updatedInput: toolInput,
        }
      }

      emit({
        type: "ask-user-question",
        toolUseId: toolUseID,
        questions: (toolInput as any).questions,
      })

      const response = await new Promise<ClaudeAskUserQuestionDecision>(
        (resolve) => {
          const timeoutId = setTimeout(() => {
            pendingToolApprovals.delete(toolUseID)
            emit({
              type: "ask-user-question-timeout",
              toolUseId: toolUseID,
            })
            resolve({ approved: false, message: "Timed out" })
          }, 60000)

          pendingToolApprovals.set(toolUseID, {
            subChatId,
            resolve: (decision) => {
              clearTimeout(timeoutId)
              resolve(decision)
            },
          })
        },
      )

      const askToolPart = parts.find(
        (part) =>
          part.toolCallId === toolUseID &&
          part.type === "tool-AskUserQuestion",
      )

      if (!response.approved) {
        const errorMessage = response.message || "Skipped"
        if (askToolPart) {
          askToolPart.result = errorMessage
          askToolPart.state = "result"
        }
        emit({
          type: "ask-user-question-result",
          toolUseId: toolUseID,
          result: errorMessage,
        })
        return {
          behavior: "deny",
          message: errorMessage,
        }
      }

      const answers = (response.updatedInput as any)?.answers
      const answerResult = { answers }
      if (askToolPart) {
        askToolPart.result = answerResult
        askToolPart.state = "result"
      }
      emit({
        type: "ask-user-question-result",
        toolUseId: toolUseID,
        result: answerResult,
      })
      return {
        behavior: "allow",
        updatedInput: response.updatedInput as Record<string, unknown>,
      }
    }

    if (
      permissionPolicy.controlLevel === "observe" &&
      permissionPolicy.observedToolPolicy.enabled
    ) {
      const risk = classifyObservedToolRisk({
        toolName,
        toolInput,
        toolUseId: toolUseID,
      })
      const shouldDeny =
        risk.catastrophic &&
        permissionPolicy.observedToolPolicy.blocksCatastrophicActions
      const message = `Observed mode blocked ${toolName}: ${risk.reason}`
      emit({
        type: "observed-tool-decision",
        controlLevel: "observe",
        decision: shouldDeny ? "deny" : "allow",
        risk,
        ...(shouldDeny ? { message } : {}),
      })
      if (shouldDeny) {
        return {
          behavior: "deny",
          message,
        }
      }
    }

    return {
      behavior: "allow",
      updatedInput: toolInput,
    }
  }

  const canUseTool: ClaudeAgentSdkCanUseTool = async (
    toolName,
    toolInput,
    options,
  ) => {
    const cachedDecision = preToolUseDecisions.get(options.toolUseID)
    if (cachedDecision && toolName !== "AskUserQuestion") {
      return cachedDecision
    }

    return decideToolPermission({
      toolName,
      toolInput,
      toolUseID: options.toolUseID,
      handleAskUserQuestion: true,
    })
  }

  const preToolUseHook: ClaudeAgentSdkPreToolUseHook = async (
    hookInput,
    toolUseID,
  ) => {
    if (!isPreToolUseHookInput(hookInput)) {
      return { continue: true }
    }

    const resolvedToolUseID =
      hookInput.tool_use_id || toolUseID || "unknown-tool-use"
    if (hookInput.tool_name === "AskUserQuestion") {
      return { continue: true }
    }

    const decision = await decideToolPermission({
      toolName: hookInput.tool_name,
      toolInput: normalizeToolInput(hookInput.tool_input),
      toolUseID: resolvedToolUseID,
      handleAskUserQuestion: false,
    })
    preToolUseDecisions.set(resolvedToolUseID, decision)
    return toClaudePreToolUseHookOutput(decision)
  }

  return {
    canUseTool,
    preToolUseHook,
  }
}

export function createClaudeAgentSdkToolPermissionHandler(
  input: CreateClaudeAgentSdkToolPermissionHandlerInput,
): ClaudeAgentSdkCanUseTool {
  return createClaudeAgentSdkPermissionControls(input).canUseTool
}
