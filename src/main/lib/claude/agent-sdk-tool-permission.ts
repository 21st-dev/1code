import type { Options as ClaudeAgentSdkOptions } from "@anthropic-ai/claude-agent-sdk"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  decideClaudeToolUse,
  toClaudePermissionResult,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import type { DesktopPermissionPolicy } from "../agent-runtime/permission-policy"
import type { UIMessageChunk } from "./types"

export type ClaudeAgentSdkCanUseTool = NonNullable<
  ClaudeAgentSdkOptions["canUseTool"]
>

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

export function createClaudeAgentSdkToolPermissionHandler({
  isUsingOllama,
  permissionPolicy,
  guardedContract,
  getGuardedContract,
  recordGuardEvent,
  emit,
  subChatId,
  pendingToolApprovals,
  parts,
}: CreateClaudeAgentSdkToolPermissionHandlerInput): ClaudeAgentSdkCanUseTool {
  return async (toolName, toolInput, options) => {
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
        toolUseId: options.toolUseID,
      })
      recordGuardEvent(decision.event)
      emit({
        type: "guard-event",
        event: decision.event,
      })
      return toClaudePermissionResult(decision)
    }

    if (toolName === "AskUserQuestion") {
      const { toolUseID } = options
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

    return {
      behavior: "allow",
      updatedInput: toolInput,
    }
  }
}
