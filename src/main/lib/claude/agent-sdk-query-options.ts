import type {
  Options as ClaudeAgentSdkOptions,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import type { DesktopRunRequest } from "../agent-runtime/desktop-run-request"
import type { ClaudePermissionMapping } from "../agent-runtime/permission-policy"
import { getBundledClaudeBinaryPath } from "./env"
import {
  createClaudeAgentSdkToolPermissionHandler,
  type CreateClaudeAgentSdkToolPermissionHandlerInput,
} from "./agent-sdk-tool-permission"

export type ClaudeAgentSdkPrompt = string | AsyncIterable<SDKUserMessage>

export type ClaudeAgentSdkQueryParams = {
  prompt: ClaudeAgentSdkPrompt
  options: ClaudeAgentSdkOptions
}

export type CreateClaudeAgentSdkQueryOptionsInput = {
  request: DesktopRunRequest
  prompt: ClaudeAgentSdkPrompt
  systemPrompt: NonNullable<ClaudeAgentSdkOptions["systemPrompt"]>
  env: NonNullable<ClaudeAgentSdkOptions["env"]>
  permission: ClaudePermissionMapping
  mcpServers?: ClaudeAgentSdkOptions["mcpServers"]
  isUsingOllama: boolean
  canUseTool: NonNullable<ClaudeAgentSdkOptions["canUseTool"]>
  stderr: NonNullable<ClaudeAgentSdkOptions["stderr"]>
  pathToClaudeCodeExecutable: string
  resumeSessionAt?: string | null
  forkSession?: boolean
  model?: string | null
  maxThinkingTokens?: number | null
}

export type CreateClaudeAgentSdkStderrHandlerInput = {
  stderrLines: string[]
  isUsingOllama: boolean
  error?: (...args: any[]) => void
}

export type CreateClaudeAgentSdkRuntimeQueryOptionsInput = Omit<
  CreateClaudeAgentSdkQueryOptionsInput,
  | "canUseTool"
  | "stderr"
  | "pathToClaudeCodeExecutable"
  | "resumeSessionAt"
  | "forkSession"
> & {
  permissionHandler: Omit<
    CreateClaudeAgentSdkToolPermissionHandlerInput,
    "isUsingOllama"
  >
  stderrLines: string[]
  shouldForkResume: boolean
  forkResumeAtUuid?: string | null
  resumeAtUuid?: string | null
  getClaudeBinaryPath?: () => string
}

export type CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput = Omit<
  CreateClaudeAgentSdkRuntimeQueryOptionsInput,
  "permissionHandler"
> &
  Omit<
    CreateClaudeAgentSdkToolPermissionHandlerInput,
    "isUsingOllama" | "recordGuardEvent"
  > & {
    guardEvents: AgentGuardEvent[]
  }

export type PrepareClaudeAgentSdkMcpServersInput = {
  mcpServers?: ClaudeAgentSdkOptions["mcpServers"]
  isUsingOllama: boolean
  projectPath?: string
  cwd: string
  ensureTokensFresh: (
    servers: NonNullable<ClaudeAgentSdkOptions["mcpServers"]>,
    projectPath: string,
  ) => Promise<ClaudeAgentSdkOptions["mcpServers"]>
  log?: (...args: any[]) => void
}

export type ClaudeAgentSdkResumeOptions = {
  resumeSessionAt: string | null
  forkSession: boolean
}

export function resolveClaudeAgentSdkResumeOptions(input: {
  isUsingOllama: boolean
  shouldForkResume: boolean
  forkResumeAtUuid?: string | null
  resumeAtUuid?: string | null
}): ClaudeAgentSdkResumeOptions {
  if (input.isUsingOllama) {
    return { resumeSessionAt: null, forkSession: false }
  }

  if (input.shouldForkResume && input.forkResumeAtUuid) {
    return {
      resumeSessionAt: input.forkResumeAtUuid,
      forkSession: true,
    }
  }

  return {
    resumeSessionAt: input.resumeAtUuid || null,
    forkSession: false,
  }
}

function createAbortControllerFromSignal(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) {
    controller.abort(signal.reason)
    return controller
  }

  signal.addEventListener(
    "abort",
    () => {
      controller.abort(signal.reason)
    },
    { once: true },
  )
  return controller
}

export function createClaudeAgentSdkStderrHandler({
  stderrLines,
  isUsingOllama,
  error = console.error,
}: CreateClaudeAgentSdkStderrHandlerInput): NonNullable<
  ClaudeAgentSdkOptions["stderr"]
> {
  return (data: string) => {
    stderrLines.push(data)
    if (isUsingOllama) {
      error("[Ollama stderr]", data)
    } else {
      error("[claude stderr]", data)
    }
  }
}

export function createClaudeAgentSdkRuntimeQueryOptions({
  permissionHandler,
  stderrLines,
  shouldForkResume,
  forkResumeAtUuid,
  resumeAtUuid,
  getClaudeBinaryPath = getBundledClaudeBinaryPath,
  ...input
}: CreateClaudeAgentSdkRuntimeQueryOptionsInput): ClaudeAgentSdkQueryParams {
  return createClaudeAgentSdkQueryOptions({
    ...input,
    canUseTool: createClaudeAgentSdkToolPermissionHandler({
      isUsingOllama: input.isUsingOllama,
      ...permissionHandler,
    }),
    stderr: createClaudeAgentSdkStderrHandler({
      stderrLines,
      isUsingOllama: input.isUsingOllama,
    }),
    pathToClaudeCodeExecutable: getClaudeBinaryPath(),
    ...resolveClaudeAgentSdkResumeOptions({
      isUsingOllama: input.isUsingOllama,
      shouldForkResume,
      forkResumeAtUuid,
      resumeAtUuid,
    }),
  })
}

export function createClaudeAgentSdkDesktopRuntimeQueryOptions({
  permissionPolicy,
  guardedContract,
  getGuardedContract,
  guardEvents,
  emit,
  subChatId,
  pendingToolApprovals,
  parts,
  ...input
}: CreateClaudeAgentSdkDesktopRuntimeQueryOptionsInput): ClaudeAgentSdkQueryParams {
  return createClaudeAgentSdkRuntimeQueryOptions({
    ...input,
    permissionHandler: {
      permissionPolicy,
      guardedContract,
      getGuardedContract,
      recordGuardEvent: (event) => {
        guardEvents.push(event)
      },
      emit,
      subChatId,
      pendingToolApprovals,
      parts,
    },
  })
}

export async function prepareClaudeAgentSdkMcpServers({
  mcpServers,
  isUsingOllama,
  projectPath,
  cwd,
  ensureTokensFresh,
  log = console.log,
}: PrepareClaudeAgentSdkMcpServersInput): Promise<
  ClaudeAgentSdkOptions["mcpServers"] | undefined
> {
  if (isUsingOllama) {
    log("[Ollama] Skipping MCP servers to speed up initialization")
    return undefined
  }
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return mcpServers
  }
  return ensureTokensFresh(mcpServers, projectPath || cwd)
}

export function createClaudeAgentSdkQueryOptions({
  request,
  prompt,
  systemPrompt,
  env,
  permission,
  mcpServers,
  isUsingOllama,
  canUseTool,
  stderr,
  pathToClaudeCodeExecutable,
  resumeSessionAt,
  forkSession,
  model,
  maxThinkingTokens,
}: CreateClaudeAgentSdkQueryOptionsInput): ClaudeAgentSdkQueryParams {
  const resumeSessionId = request.session.resumeSessionId || null
  const hasMcpServers = Boolean(mcpServers && Object.keys(mcpServers).length > 0)

  return {
    prompt,
    options: {
      abortController: createAbortControllerFromSignal(request.signal),
      cwd: request.context.cwd,
      systemPrompt,
      ...(hasMcpServers && { mcpServers }),
      env,
      permissionMode: permission.sdkPermissionMode,
      ...(permission.allowDangerouslySkipPermissions && {
        allowDangerouslySkipPermissions: true,
      }),
      includePartialMessages: true,
      ...(!isUsingOllama && {
        settingSources: ["project" as const, "user" as const],
      }),
      canUseTool,
      stderr,
      pathToClaudeCodeExecutable,
      ...(resumeSessionId && {
        resume: resumeSessionId,
        ...(forkSession && resumeSessionAt
          ? {
              resumeSessionAt,
              forkSession: true,
            }
          : resumeSessionAt
            ? { resumeSessionAt }
            : { continue: true }),
      }),
      ...(!resumeSessionId && { continue: true }),
      ...(model && { model }),
      ...(maxThinkingTokens && { maxThinkingTokens }),
    },
  }
}
