import type { AgentJobDatabase } from "../headless/job-store"
import type { DesktopStreamEventMapper } from "../agent-runtime/stream-event-mapper"

export type ClaudeAgentSdkDesktopRunState = {
  setDb(db: AgentJobDatabase): void
  getDb(): AgentJobDatabase | null
  setDesktopJob(input: {
    jobId: string
    streamEventMapper: DesktopStreamEventMapper
  }): void
  getJobId(): string | null
  getStreamEventMapper(): DesktopStreamEventMapper | null
  markFailed(): void
  sawError(): boolean
  setReachedNaturalFinish(reachedNaturalFinish: boolean): void
  reachedNaturalFinish(): boolean
  isObservableActive(): boolean
  markInactive(): void
}

export function createClaudeAgentSdkDesktopRunState(): ClaudeAgentSdkDesktopRunState {
  let db: AgentJobDatabase | null = null
  let jobId: string | null = null
  let streamEventMapper: DesktopStreamEventMapper | null = null
  let sawError = false
  let reachedNaturalFinish = false
  let observableActive = true

  return {
    setDb(nextDb) {
      db = nextDb
    },
    getDb() {
      return db
    },
    setDesktopJob(input) {
      jobId = input.jobId
      streamEventMapper = input.streamEventMapper
    },
    getJobId() {
      return jobId
    },
    getStreamEventMapper() {
      return streamEventMapper
    },
    markFailed() {
      sawError = true
    },
    sawError() {
      return sawError
    },
    setReachedNaturalFinish(nextReachedNaturalFinish) {
      reachedNaturalFinish = nextReachedNaturalFinish
    },
    reachedNaturalFinish() {
      return reachedNaturalFinish
    },
    isObservableActive() {
      return observableActive
    },
    markInactive() {
      observableActive = false
    },
  }
}
