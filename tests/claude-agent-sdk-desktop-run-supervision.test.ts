import { describe, expect, test } from "bun:test"
import {
  superviseClaudeAgentSdkDesktopRun,
} from "../src/main/lib/claude/agent-sdk-desktop-run-supervision"
import type { UIMessageChunk } from "../src/main/lib/claude/types"

function createBaseInput() {
  const abortController = new AbortController()
  const db = { id: "db-1" } as any
  const desktopRunState = {
    getDb: () => db,
    getJobId: () => "job-1",
    reachedNaturalFinish: () => true,
    sawError: () => false,
  }
  const streamState = { chunkCount: 7 }
  const emitted: UIMessageChunk[] = []
  const completed: string[] = []
  const emittedErrors: any[] = []

  return {
    abortController,
    db,
    desktopRunState,
    streamState,
    emitted,
    completed,
    emittedErrors,
    input: {
      chatId: "chat-1",
      subChatId: "sub-1",
      abortController,
      getDb: () => db,
      desktopRunState,
      streamState,
      subId: "sub-tail",
      streamStart: 1000,
      emitError: (error: unknown, context: string) => {
        emittedErrors.push({ error, context })
      },
      emit: (chunk: UIMessageChunk) => {
        emitted.push(chunk)
        return true
      },
      complete: () => {
        completed.push("complete")
      },
    },
  }
}

describe("Claude Agent SDK desktop run supervision", () => {
  test("runs the body and finalizes lifecycle with the latest guarded contract", async () => {
    const base = createBaseInput()
    const events: string[] = []
    const finalizedUnexpectedErrors: any[] = []
    const finalizedLifecycleRuns: any[] = []
    let guardedContract: any = null

    await superviseClaudeAgentSdkDesktopRun({
      ...base.input,
      getGuardedContract: () => guardedContract,
      run: async () => {
        events.push("run")
        guardedContract = { id: "contract-1" }
      },
      dependencies: {
        finalizeUnexpectedErrorWithStreamState: (input) => {
          events.push("unexpected")
          finalizedUnexpectedErrors.push(input)
        },
        finalizeAfterLifecycle: (input) => {
          events.push("after")
          finalizedLifecycleRuns.push(input)
        },
      },
    })

    expect(events).toEqual(["run", "after"])
    expect(finalizedUnexpectedErrors).toEqual([])
    expect(finalizedLifecycleRuns).toHaveLength(1)
    expect(finalizedLifecycleRuns[0]).toEqual({
      chatId: "chat-1",
      subChatId: "sub-1",
      abortController: base.abortController,
      guardedContract: { id: "contract-1" },
      getDb: base.input.getDb,
      desktopRunState: base.desktopRunState,
    })
  })

  test("finalizes unexpected errors and still runs lifecycle cleanup", async () => {
    const base = createBaseInput()
    const error = new Error("boom")
    const events: string[] = []
    const finalizedUnexpectedErrors: any[] = []
    const finalizedLifecycleRuns: any[] = []
    const guardedContract = { id: "contract-1" } as any

    await superviseClaudeAgentSdkDesktopRun({
      ...base.input,
      getGuardedContract: () => guardedContract,
      run: async () => {
        events.push("run")
        throw error
      },
      dependencies: {
        finalizeUnexpectedErrorWithStreamState: (input) => {
          events.push("unexpected")
          finalizedUnexpectedErrors.push(input)
        },
        finalizeAfterLifecycle: (input) => {
          events.push("after")
          finalizedLifecycleRuns.push(input)
        },
      },
    })

    expect(events).toEqual(["run", "unexpected", "after"])
    expect(finalizedUnexpectedErrors).toEqual([
      {
        error,
        state: base.streamState,
        subId: "sub-tail",
        streamStart: 1000,
        emitError: base.input.emitError,
        emit: base.input.emit,
        complete: base.input.complete,
      },
    ])
    expect(finalizedLifecycleRuns).toEqual([
      {
        chatId: "chat-1",
        subChatId: "sub-1",
        abortController: base.abortController,
        guardedContract,
        getDb: base.input.getDb,
        desktopRunState: base.desktopRunState,
      },
    ])
  })
})
