import { describe, expect, test } from "bun:test"
import {
  createClaudeAgentSdkRuntimeStreamSetup,
  createClaudeAgentSdkRuntimeStreamState,
} from "../src/main/lib/claude/agent-sdk-runtime-state"

describe("Claude Agent SDK runtime stream setup", () => {
  test("creates mutable stream state through the runtime-state owner facade", () => {
    const state = createClaudeAgentSdkRuntimeStreamState()

    expect(state).toMatchObject({
      metadata: {},
      currentSessionId: null,
      currentText: "",
      chunkCount: 0,
      lastChunkType: "",
      messageCount: 0,
      pendingFinishChunk: null,
    })
  })

  test("creates transform, accumulation state, stderr capture, and guard metadata", () => {
    const setup = createClaudeAgentSdkRuntimeStreamSetup({
      historyEnabled: true,
      isUsingOllama: false,
      guardedContract: {
        id: "contract-1",
        runId: "run-1",
        editableScope: [],
        readOnlyEvidence: [],
        successChecks: [],
        blockedPaths: [],
      } as any,
    })

    expect(typeof setup.transform).toBe("function")
    expect(setup.parts).toEqual([])
    expect(setup.stderrLines).toEqual([])
    expect(setup.metadata).toEqual({
      guardedRun: {
        contractId: "contract-1",
        runId: "run-1",
        runtime: "claude",
        enforcementMode: "hard",
      },
    })
  })
})
