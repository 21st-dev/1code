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

export type PrepareClaudeAgentSdkDesktopRuntimeQueryInput = Omit<
  CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput,
  "prompt" | "systemPrompt" | "mcpServers" | "model"
> & {
  prompt: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput["prompt"]
  existingMessages: any[]
  rawMcpServers?: PrepareClaudeAgentSdkMcpServersInput["mcpServers"]
  projectPath?: string
  cwd: string
  resolvedModel?: string | null
  ensureTokensFresh: PrepareClaudeAgentSdkMcpServersInput["ensureTokensFresh"]
  readAgentsMd?: typeof readClaudeAgentSdkProjectAgentsMd
  log?: (...args: any[]) => void
}

export type PrepareClaudeAgentSdkDesktopRuntimeQueryResult = {
  queryOptions: ClaudeAgentSdkQueryParams
  mcpServers: PrepareClaudeAgentSdkMcpServersInput["mcpServers"] | undefined
  promptContext: PrepareClaudeAgentSdkPromptContextResult
}

export async function prepareClaudeAgentSdkDesktopRuntimeQuery({
  prompt,
  existingMessages,
  rawMcpServers,
  projectPath,
  cwd,
  resolvedModel,
  ensureTokensFresh,
  readAgentsMd,
  log,
  ...queryInput
}: PrepareClaudeAgentSdkDesktopRuntimeQueryInput): Promise<
  PrepareClaudeAgentSdkDesktopRuntimeQueryResult
> {
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
    queryOptions: createClaudeAgentSdkDesktopRuntimeQueryOptions({
      ...queryInput,
      prompt: promptContext.prompt,
      systemPrompt: promptContext.systemPrompt,
      mcpServers,
      model: resolvedModel,
    }),
  }
}
