import type { DesktopRunRequest, DesktopRunResult } from "../agent-runtime/desktop-run-request"
import type { DesktopRuntimeAdapter } from "../agent-runtime/desktop-runner"
import {
  ClaudeAgentSdkLoadError,
  ClaudeAgentSdkQueryStartError,
} from "./agent-sdk-adapter"
import {
  resetClaudeAgentSdkPolicyRetryAttempt,
  waitForClaudeAgentSdkPolicyRetry,
  type ClaudeAgentSdkPolicyRetryState,
} from "./agent-sdk-policy-retry"
import type { UIMessageChunk } from "./types"

export type RunClaudeAgentSdkAdapterWithPolicyRetryInput = {
  adapter: DesktopRuntimeAdapter
  request: DesktopRunRequest
  policyRetry: ClaudeAgentSdkPolicyRetryState
  beforeAttempt: () => void
  getChunkCount: () => number
  subId: string
  emitError: (error: unknown, context: string) => void
  emit: (chunk: UIMessageChunk) => void
  complete: () => void
  sleep?: (delayMs: number) => Promise<unknown>
  log?: (...args: any[]) => void
  error?: (...args: any[]) => void
}

export async function runClaudeAgentSdkAdapterWithPolicyRetry({
  adapter,
  request,
  policyRetry,
  beforeAttempt,
  getChunkCount,
  subId,
  emitError,
  emit,
  complete,
  sleep,
  log = console.log,
  error = console.error,
}: RunClaudeAgentSdkAdapterWithPolicyRetryInput): Promise<DesktopRunResult> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    resetClaudeAgentSdkPolicyRetryAttempt(policyRetry)
    beforeAttempt()

    try {
      const adapterResult = await adapter.run(request)
      if (adapterResult.status === "failed") {
        return adapterResult
      }
    } catch (adapterError) {
      if (adapterError instanceof ClaudeAgentSdkLoadError) {
        emitError(
          adapterError.originalError,
          "Failed to load Claude Agent SDK",
        )
        log(`[SD] M:END sub=${subId} reason=sdk_load_error n=${getChunkCount()}`)
        emit({ type: "finish" })
        complete()
        return { status: "failed", error: { message: "SDK load error" } }
      }

      const queryError =
        adapterError instanceof ClaudeAgentSdkQueryStartError
          ? adapterError.originalError
          : adapterError
      error("[CLAUDE] ✗ Failed to create SDK query:", queryError)
      emitError(queryError, "Failed to start Claude query")
      log(`[SD] M:END sub=${subId} reason=query_error n=${getChunkCount()}`)
      emit({ type: "finish" })
      complete()
      return { status: "failed", error: { message: "SDK query error" } }
    }

    if (
      await waitForClaudeAgentSdkPolicyRetry({
        state: policyRetry,
        sleep,
        log,
      })
    ) {
      continue
    }

    return { status: "succeeded" }
  }
}
