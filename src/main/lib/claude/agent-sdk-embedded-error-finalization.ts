import {
  classifyClaudeAgentSdkEmbeddedError,
  extractClaudeAgentSdkEmbeddedErrorText,
} from "./agent-sdk-errors"
import {
  logClaudeAgentSdkEmbeddedError,
  logClaudeAgentSdkErrorDetails,
} from "./agent-sdk-error-logging"
import {
  CLAUDE_AGENT_SDK_POLICY_RETRY_LIMIT,
  recordClaudeAgentSdkPolicyRetry,
  type ClaudeAgentSdkPolicyRetryState,
} from "./agent-sdk-policy-retry"
import type { UIMessageChunk } from "./types"

export type FinalizeClaudeAgentSdkEmbeddedErrorInput = {
  message: any
  policyRetry: ClaudeAgentSdkPolicyRetryState
  usesApiKeyAuth: boolean
  aborted: boolean
  subChatId: string
  chatId: string
  cwd: string
  mode: string
  hasCustomConfig: boolean
  isUsingOllama: boolean
  model?: string | null
  hasOAuthToken: boolean
  mcpServerNames: string[]
  subId: string
  chunkCount: number
  emit: (chunk: UIMessageChunk) => void
  complete: () => void
  log?: (...args: any[]) => void
}

export type FinalizeClaudeAgentSdkEmbeddedErrorResult =
  | { status: "retry" }
  | {
      status: "failed"
      error: {
        message: string
        code: string
      }
    }

export function finalizeClaudeAgentSdkEmbeddedError({
  message,
  policyRetry,
  usesApiKeyAuth,
  aborted,
  subChatId,
  chatId,
  cwd,
  mode,
  hasCustomConfig,
  isUsingOllama,
  model,
  hasOAuthToken,
  mcpServerNames,
  subId,
  chunkCount,
  emit,
  complete,
  log = console.log,
}: FinalizeClaudeAgentSdkEmbeddedErrorInput): FinalizeClaudeAgentSdkEmbeddedErrorResult {
  const msgAny = message as any
  const sdkError = extractClaudeAgentSdkEmbeddedErrorText(msgAny)

  logClaudeAgentSdkEmbeddedError({
    sdkError,
    message: msgAny,
    subChatId,
    chatId,
    cwd,
    mode,
    hasCustomConfig,
    isUsingOllama,
    model,
    hasOAuthToken,
    mcpServerNames,
  })

  const errorDiagnostic = classifyClaudeAgentSdkEmbeddedError({
    rawErrorCode: msgAny.error,
    sdkError,
    usesApiKeyAuth,
    policyRetryCount: policyRetry.count,
    maxPolicyRetries: CLAUDE_AGENT_SDK_POLICY_RETRY_LIMIT,
    aborted,
  })
  const rawErrorCode = errorDiagnostic.rawErrorCode
  const errorCategory = errorDiagnostic.category
  const errorContext = errorDiagnostic.context

  if (errorDiagnostic.shouldRetryPolicy) {
    recordClaudeAgentSdkPolicyRetry({
      state: policyRetry,
      log,
    })
    return { status: "retry" }
  }

  if (errorDiagnostic.shouldEmitAuthError) {
    emit({
      type: "auth-error",
      errorText: errorContext,
    })
  } else {
    emit({
      type: "error",
      errorText: errorContext,
      debugInfo: {
        category: errorCategory,
        rawErrorCode,
        sessionId: msgAny.session_id,
        messageId: msgAny.message?.id,
      },
    } as UIMessageChunk)
  }

  log(
    `[SD] M:END sub=${subId} reason=sdk_error cat=${errorCategory} n=${chunkCount}`,
  )
  logClaudeAgentSdkErrorDetails({
    errorCategory,
    errorContext,
    rawErrorCode,
    message: msgAny,
  })
  emit({ type: "finish" })
  complete()

  return {
    status: "failed",
    error: {
      message: errorContext,
      code: errorCategory,
    },
  }
}
