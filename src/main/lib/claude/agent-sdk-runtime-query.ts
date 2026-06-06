import {
  getActiveGuardedContract,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  getClaudePermissionMapping,
  type ClaudePermissionMapping,
} from "../agent-runtime/permission-policy"
import {
  createClaudeAgentSdkDesktopRuntimeQueryOptions,
  prepareClaudeAgentSdkMcpServers,
  type ClaudeAgentSdkQueryParams,
  type CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput,
  type PrepareClaudeAgentSdkMcpServersInput,
} from "./agent-sdk-query-options"
import {
  prepareClaudeAgentSdkPromptContext,
  type PrepareClaudeAgentSdkPromptContextResult,
  type readClaudeAgentSdkProjectAgentsMd,
} from "./agent-sdk-project-context"
import { getClaudePendingToolApprovalStore } from "./tool-approvals"

const ensureClaudeAgentSdkMcpTokensFresh: PrepareClaudeAgentSdkMcpServersInput[
  "ensureTokensFresh"
] = async (servers, projectPath) => {
  const { ensureMcpTokensFresh } = await import("../mcp-auth")
  return ensureMcpTokensFresh(servers, projectPath)
}

export type PrepareClaudeAgentSdkDesktopRuntimeQueryInput = Omit<
  CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput,
  | "prompt"
  | "systemPrompt"
  | "mcpServers"
  | "model"
  | "pendingToolApprovals"
  | "getGuardedContract"
  | "permission"
  | "guardEvents"
  | "parts"
  | "stderrLines"
  | "permissionPolicy"
  | "subChatId"
> & {
  prompt: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput["prompt"]
  existingMessages: any[]
  rawMcpServers?: PrepareClaudeAgentSdkMcpServersInput["mcpServers"]
  projectPath?: string
  cwd?: string
  resolvedModel?: string | null
  ensureTokensFresh?: PrepareClaudeAgentSdkMcpServersInput["ensureTokensFresh"]
  pendingToolApprovals?: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput[
    "pendingToolApprovals"
  ]
  getPendingToolApprovals?: typeof getClaudePendingToolApprovalStore
  getGuardedContract?: (
    contractId: string,
  ) => ValidatedAgentScopeContract | undefined
  permission?: ClaudePermissionMapping
  permissionPolicy?: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput[
    "permissionPolicy"
  ]
  subChatId?: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput["subChatId"]
  guardEvents?: AgentGuardEvent[]
  parts?: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput["parts"]
  stderrLines?: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput[
    "stderrLines"
  ]
  readAgentsMd?: typeof readClaudeAgentSdkProjectAgentsMd
  log?: (...args: any[]) => void
}

export type PrepareClaudeAgentSdkDesktopRuntimeQueryResult = {
  queryOptions: ClaudeAgentSdkQueryParams
  mcpServers: PrepareClaudeAgentSdkMcpServersInput["mcpServers"] | undefined
  promptContext: PrepareClaudeAgentSdkPromptContextResult
  guardEvents: AgentGuardEvent[]
}

export async function prepareClaudeAgentSdkDesktopRuntimeQuery({
  prompt,
  request,
  existingMessages,
  rawMcpServers,
  projectPath,
  cwd,
  resolvedModel,
  ensureTokensFresh = ensureClaudeAgentSdkMcpTokensFresh,
  pendingToolApprovals,
  getPendingToolApprovals = getClaudePendingToolApprovalStore,
  getGuardedContract = getActiveGuardedContract,
  permission,
  guardEvents,
  parts = [],
  stderrLines = [],
  readAgentsMd,
  log,
  ...queryInput
}: PrepareClaudeAgentSdkDesktopRuntimeQueryInput): Promise<
  PrepareClaudeAgentSdkDesktopRuntimeQueryResult
> {
  const runtimeGuardEvents = guardEvents ?? []
  const runtimeCwd = cwd ?? request.context.cwd
  const runtimePermissionPolicy =
    queryInput.permissionPolicy ?? request.permissionPolicy
  const runtimeSubChatId = queryInput.subChatId ?? request.context.subChatId
  const mcpServers = await prepareClaudeAgentSdkMcpServers({
    mcpServers: rawMcpServers,
    isUsingOllama: queryInput.isUsingOllama,
    projectPath,
    cwd: runtimeCwd,
    ensureTokensFresh,
  })

  const promptContext = await prepareClaudeAgentSdkPromptContext({
    prompt,
    existingMessages,
    isUsingOllama: queryInput.isUsingOllama,
    resolvedModel,
    projectPath,
    cwd: runtimeCwd,
    readAgentsMd,
    log,
  })

  return {
    mcpServers,
    promptContext,
    guardEvents: runtimeGuardEvents,
    queryOptions: createClaudeAgentSdkDesktopRuntimeQueryOptions({
      ...queryInput,
      request,
      prompt: promptContext.prompt,
      systemPrompt: promptContext.systemPrompt,
      mcpServers,
      model: resolvedModel,
      permission:
        permission ?? getClaudePermissionMapping(runtimePermissionPolicy),
      permissionPolicy: runtimePermissionPolicy,
      subChatId: runtimeSubChatId,
      pendingToolApprovals:
        pendingToolApprovals ?? getPendingToolApprovals(),
      parts,
      stderrLines,
      getGuardedContract,
      guardEvents: runtimeGuardEvents,
    }),
  }
}
