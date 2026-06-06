import type {
  Options as ClaudeAgentSdkOptions,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import type { DesktopRunRequest } from "../agent-runtime/desktop-run-request"
import type { ClaudePermissionMapping } from "../agent-runtime/permission-policy"

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
