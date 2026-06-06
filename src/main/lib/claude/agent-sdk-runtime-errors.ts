import {
  DesktopRunPreflightError,
  type DesktopRunPreflightBlocker,
} from "../agent-runtime/preflight"
import type { UIMessageChunk } from "./types"

export type ClaudeAgentSdkRuntimeErrorEmitter = (
  error: unknown,
  context: string,
) => void

export type ClaudeAgentSdkPreflightBlockerEmitter = (
  blocker: DesktopRunPreflightBlocker,
) => void

export type CreateClaudeAgentSdkRuntimeErrorHandlersInput = {
  cwd: string
  mode: string
  emit: (chunk: UIMessageChunk) => unknown
  complete: () => void
  env?: {
    NODE_ENV?: string
    PATH?: string
  }
  error?: (...args: any[]) => void
}

export type ClaudeAgentSdkRuntimeErrorHandlers = {
  emitError: ClaudeAgentSdkRuntimeErrorEmitter
  emitPreflightBlocker: ClaudeAgentSdkPreflightBlockerEmitter
}

export function createClaudeAgentSdkRuntimeErrorHandlers({
  cwd,
  mode,
  emit,
  complete,
  env = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
  },
  error: logError = console.error,
}: CreateClaudeAgentSdkRuntimeErrorHandlersInput): ClaudeAgentSdkRuntimeErrorHandlers {
  const emitError: ClaudeAgentSdkRuntimeErrorEmitter = (error, context) => {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    logError(`[claude] ${context}:`, errorMessage)
    if (errorStack) logError("[claude] Stack:", errorStack)

    emit({
      type: "error",
      errorText: `${context}: ${errorMessage}`,
      ...(env.NODE_ENV !== "production" && {
        debugInfo: {
          context,
          cwd,
          mode,
          PATH: env.PATH?.slice(0, 200),
        },
      }),
    } as UIMessageChunk)
  }

  return {
    emitError,
    emitPreflightBlocker(blocker) {
      emitError(
        new DesktopRunPreflightError(blocker),
        "Desktop run preflight blocked",
      )
      emit({ type: "finish" } as UIMessageChunk)
      complete()
    },
  }
}
