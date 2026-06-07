import { describe, expect, test } from "bun:test"
import { createClaudeAgentSdkDesktopRunState } from "../src/main/lib/claude/agent-sdk-desktop-run-state"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

describe("Claude Agent SDK desktop run state", () => {
  test("tracks job, persistence, failure, finish, and observable state", () => {
    const db = createAgentJobTestDb()
    const streamEventMapper = { map: () => [] }
    const state = createClaudeAgentSdkDesktopRunState()

    expect(state.getDb()).toBeNull()
    expect(state.getJobId()).toBeNull()
    expect(state.getStreamEventMapper()).toBeNull()
    expect(state.sawError()).toBe(false)
    expect(state.reachedNaturalFinish()).toBe(false)
    expect(state.isObservableActive()).toBe(true)

    state.setDb(db)
    state.setDesktopJob({
      jobId: "job-1",
      streamEventMapper,
    })
    state.markFailed()
    state.setReachedNaturalFinish(true)
    state.markInactive()

    expect(state.getDb()).toBe(db)
    expect(state.getJobId()).toBe("job-1")
    expect(state.getStreamEventMapper()).toBe(streamEventMapper)
    expect(state.sawError()).toBe(true)
    expect(state.reachedNaturalFinish()).toBe(true)
    expect(state.isObservableActive()).toBe(false)
  })
})
