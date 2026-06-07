import { describe, expect, test } from "bun:test"
import {
  runClaudeAgentSdkDesktopRuntimeWithMcpReadiness,
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

  test("applies MCP readiness before entering lifecycle", async () => {
    const desktopRunState = createClaudeAgentSdkDesktopRunState()
    const lifecycleInputs: any[] = []
    const rawMcpServers = {
      zeta: { command: "zeta" },
      github: { command: "github" },
    }
    const desktopRunRequest = {
      identity: { runId: "run-1" },
      context: {
        runtimeId: "claude-code",
        mode: "agent",
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/repo",
      },
      prompt: "hello",
      permissionPolicy: { runtimeId: "claude-code", mode: "agent" },
      providerBinding: {},
      mcp: { status: "skipped", serverNames: [], blockers: [] },
      attachments: [],
      trace: { emit: () => {} },
      signal: new AbortController().signal,
      session: {},
    }

    const result = await runClaudeAgentSdkDesktopRuntimeWithMcpReadiness({
      desktopRunRequest,
      mcpReadinessStatus: "ready",
      runtimeQuery: {
        existingMessages: [],
        rawMcpServers,
      },
      desktopRunState,
      runLifecycle: async (input) => {
        lifecycleInputs.push(input)
        return {
          status: "completed",
          reachedNaturalFinish: true,
        }
      },
    } as any)

    expect(result.status).toBe("completed")
    expect(lifecycleInputs).toHaveLength(1)
    expect(lifecycleInputs[0].request).not.toBe(desktopRunRequest)
    expect(lifecycleInputs[0].request.mcp).toEqual({
      status: "ready",
      serverNames: ["github", "zeta"],
      blockers: [],
    })
    expect(lifecycleInputs[0].runtimeQuery.rawMcpServers).toBe(rawMcpServers)
    expect(desktopRunRequest.mcp).toEqual({
      status: "skipped",
      serverNames: [],
      blockers: [],
    })
  })
})
