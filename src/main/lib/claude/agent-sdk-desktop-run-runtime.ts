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
