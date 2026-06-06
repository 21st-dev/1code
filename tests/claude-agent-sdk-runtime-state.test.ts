import { describe, expect, test } from "bun:test"
import { createClaudeAgentSdkRuntimeStreamSetup } from "../src/main/lib/claude/agent-sdk-runtime-state"

describe("Claude Agent SDK runtime stream setup", () => {
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
