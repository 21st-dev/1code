import {
  createDesktopRunMcpReadiness,
  withDesktopRunMcpReadiness,
  type DesktopRunMcpReadiness,
  type DesktopRunRequest,
} from "../agent-runtime/desktop-run-request"
import {
  runClaudeAgentSdkDesktopRuntimeLifecycle,
  type RunClaudeAgentSdkDesktopRuntimeLifecycleInput,
  type RunClaudeAgentSdkDesktopRuntimeLifecycleResult,
} from "./agent-sdk-runtime-lifecycle"
import type { ClaudeAgentSdkDesktopRunState } from "./agent-sdk-desktop-run-state"

export type RunClaudeAgentSdkDesktopRuntimeWithRunStateInput = Omit<
  RunClaudeAgentSdkDesktopRuntimeLifecycleInput,
  "desktopJobSawError" | "isObservableActive"
> & {
  desktopRunState: Pick<
    ClaudeAgentSdkDesktopRunState,
    "isObservableActive" | "sawError" | "setReachedNaturalFinish"
  >
  runLifecycle?: typeof runClaudeAgentSdkDesktopRuntimeLifecycle
}

export type ClaudeAgentSdkDesktopRunMcpReadinessStatus =
  DesktopRunMcpReadiness["status"]

export type RunClaudeAgentSdkDesktopRuntimeWithMcpReadinessInput = Omit<
  RunClaudeAgentSdkDesktopRuntimeWithRunStateInput,
  "request"
> & {
  desktopRunRequest: DesktopRunRequest
  mcpReadinessStatus: ClaudeAgentSdkDesktopRunMcpReadinessStatus
}

export async function runClaudeAgentSdkDesktopRuntimeWithRunState({
  desktopRunState,
  runLifecycle = runClaudeAgentSdkDesktopRuntimeLifecycle,
  ...input
}: RunClaudeAgentSdkDesktopRuntimeWithRunStateInput): Promise<RunClaudeAgentSdkDesktopRuntimeLifecycleResult> {
  const runtimeResult = await runLifecycle({
    ...input,
    isObservableActive: desktopRunState.isObservableActive,
    desktopJobSawError: desktopRunState.sawError(),
  })
  desktopRunState.setReachedNaturalFinish(
    runtimeResult.reachedNaturalFinish,
  )
  return runtimeResult
}

export async function runClaudeAgentSdkDesktopRuntimeWithMcpReadiness({
  desktopRunRequest,
  mcpReadinessStatus,
  runtimeQuery,
  ...input
}: RunClaudeAgentSdkDesktopRuntimeWithMcpReadinessInput): Promise<RunClaudeAgentSdkDesktopRuntimeLifecycleResult> {
  const request = withDesktopRunMcpReadiness(
    desktopRunRequest,
    createDesktopRunMcpReadiness({
      status: mcpReadinessStatus,
      serverNames: Object.keys(runtimeQuery.rawMcpServers ?? {}),
    }),
  )

  return runClaudeAgentSdkDesktopRuntimeWithRunState({
    ...input,
    request,
    runtimeQuery,
  })
}
