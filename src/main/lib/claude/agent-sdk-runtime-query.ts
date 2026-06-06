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
> & {
  prompt: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput["prompt"]
  existingMessages: any[]
  rawMcpServers?: PrepareClaudeAgentSdkMcpServersInput["mcpServers"]
  projectPath?: string
  cwd: string
  resolvedModel?: string | null
  ensureTokensFresh: PrepareClaudeAgentSdkMcpServersInput["ensureTokensFresh"]
  pendingToolApprovals?: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput[
    "pendingToolApprovals"
  ]
  getPendingToolApprovals?: typeof getClaudePendingToolApprovalStore
  getGuardedContract?: (
    contractId: string,
  ) => ValidatedAgentScopeContract | undefined
  permission?: ClaudePermissionMapping
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
  existingMessages,
  rawMcpServers,
  projectPath,
  cwd,
  resolvedModel,
  ensureTokensFresh,
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
  const mcpServers = await prepareClaudeAgentSdkMcpServers({
    mcpServers: rawMcpServers,
    isUsingOllama: queryInput.isUsingOllama,
    projectPath,
    cwd,
    ensureTokensFresh,
  })

  const promptContext = await prepareClaudeAgentSdkPromptContext({
    prompt,
    existingMessages,
    isUsingOllama: queryInput.isUsingOllama,
    resolvedModel,
    projectPath,
    cwd,
    readAgentsMd,
    log,
  })

  return {
    mcpServers,
    promptContext,
    guardEvents: runtimeGuardEvents,
    queryOptions: createClaudeAgentSdkDesktopRuntimeQueryOptions({
      ...queryInput,
      prompt: promptContext.prompt,
      systemPrompt: promptContext.systemPrompt,
      mcpServers,
      model: resolvedModel,
      permission:
        permission ?? getClaudePermissionMapping(queryInput.permissionPolicy),
      pendingToolApprovals:
        pendingToolApprovals ?? getPendingToolApprovals(),
      parts,
      stderrLines,
      getGuardedContract,
      guardEvents: runtimeGuardEvents,
    }),
  }
}
