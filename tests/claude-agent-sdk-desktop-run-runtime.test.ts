import { describe, expect, test } from "bun:test"
import {
  runClaudeAgentSdkDesktopRuntimeWithRunState,
} from "../src/main/lib/claude/agent-sdk-desktop-run-runtime"
import { createClaudeAgentSdkDesktopRunState } from "../src/main/lib/claude/agent-sdk-desktop-run-state"

describe("Claude Agent SDK desktop run runtime", () => {
  test("injects desktop run state into lifecycle and records natural finish", async () => {
    const desktopRunState = createClaudeAgentSdkDesktopRunState()
    desktopRunState.markFailed()
    const lifecycleInputs: any[] = []

    const result = await runClaudeAgentSdkDesktopRuntimeWithRunState({
      request: { id: "request-1" },
      desktopRunState,
      runLifecycle: async (input) => {
        lifecycleInputs.push(input)
        return {
          status: "completed",
          reachedNaturalFinish: true,
        }
      },
    } as any)

    expect(result).toEqual({
      status: "completed",
      reachedNaturalFinish: true,
    })
    expect(lifecycleInputs).toHaveLength(1)
    expect(lifecycleInputs[0].desktopJobSawError).toBe(true)
    expect(lifecycleInputs[0].isObservableActive).toBe(
      desktopRunState.isObservableActive,
    )
    expect("desktopRunState" in lifecycleInputs[0]).toBe(false)
    expect(desktopRunState.reachedNaturalFinish()).toBe(true)
  })

  test("records failed lifecycle runs as not naturally finished", async () => {
    const desktopRunState = createClaudeAgentSdkDesktopRunState()
    desktopRunState.setReachedNaturalFinish(true)

    const result = await runClaudeAgentSdkDesktopRuntimeWithRunState({
      request: { id: "request-1" },
      desktopRunState,
      runLifecycle: async () => ({
        status: "failed",
        phase: "adapter",
        reachedNaturalFinish: false,
        error: { message: "adapter failed" },
      }),
    } as any)

    expect(result).toEqual({
      status: "failed",
      phase: "adapter",
      reachedNaturalFinish: false,
      error: { message: "adapter failed" },
    })
    expect(desktopRunState.reachedNaturalFinish()).toBe(false)
  })
})
