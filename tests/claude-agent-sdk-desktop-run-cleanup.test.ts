import { describe, expect, test } from "bun:test"
import {
  abortClaudeAgentSdkDesktopRunRequest,
  cancelClaudeAgentSdkActiveDesktopRun,
  cleanupClaudeAgentSdkDesktopRunSubscription,
  finalizeClaudeAgentSdkDesktopRunAfterLifecycle,
} from "../src/main/lib/claude/agent-sdk-desktop-run-cleanup"

function createDbRecorder() {
  const updates: any[] = []
  const db = {
    update(table: unknown) {
      const update: any = { table }
      updates.push(update)
      return {
        set(value: unknown) {
          update.set = value
          return {
            where(condition: unknown) {
              update.where = condition
              return {
                run() {
                  update.ran = true
                },
              }
            },
          }
        },
      }
    },
  }

  return { db: db as any, updates }
}

describe("Claude Agent SDK desktop run cleanup", () => {
  test("cleans owned active sessions, guard contracts, pending approvals, jobs, and stream id", () => {
    const { db, updates } = createDbRecorder()
    const controller = new AbortController()
    let inactive = false
    const deletedSessions: any[] = []
    const deletedContracts: string[] = []
    const clearedApprovals: any[] = []
    const canceledJobs: any[] = []
    const logs: any[] = []

    const result = cleanupClaudeAgentSdkDesktopRunSubscription({
      subId: "sub-tail",
      subChatId: "sub-1",
      sessionId: "session-1",
      abortController: controller,
      guardedContract: { id: "contract-1" } as any,
      getDb: () => db,
      markInactive: () => {
        inactive = true
      },
      desktopJobId: "job-1",
      desktopJobSawError: true,
      desktopJobReachedNaturalFinish: false,
      dependencies: {
        deleteActiveClaudeSessionIfController: (subChatId, abortController) => {
          deletedSessions.push({ subChatId, abortController })
          return true
        },
        deleteGuardedContract: (contractId) => {
          deletedContracts.push(contractId)
        },
        clearClaudePendingToolApprovals: (message, subChatId) => {
          clearedApprovals.push({ message, subChatId })
        },
        requestCancelClaudeAgentSdkDesktopJob: (input) => {
          canceledJobs.push(input)
        },
        log: (...args) => {
          logs.push(args)
        },
      },
    })

    expect(result).toEqual({ ownsActiveSession: true })
    expect(inactive).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    expect(logs).toEqual([
      ["[SD] M:CLEANUP sub=sub-tail sessionId=session-1"],
    ])
    expect(deletedSessions).toEqual([
      { subChatId: "sub-1", abortController: controller },
    ])
    expect(deletedContracts).toEqual(["contract-1"])
    expect(clearedApprovals).toEqual([
      { message: "Session ended.", subChatId: "sub-1" },
    ])
    expect(canceledJobs).toEqual([
      {
        db,
        jobId: "job-1",
        sawError: true,
        reachedNaturalFinish: false,
      },
    ])
    expect(updates).toEqual([
      expect.objectContaining({
        set: { streamId: null },
        ran: true,
      }),
    ])
  })

  test("keeps pending approvals and stream id when cleanup does not own the active session", () => {
    const { db, updates } = createDbRecorder()
    const controller = new AbortController()
    const clearedApprovals: any[] = []
    const canceledJobs: any[] = []

    const result = cleanupClaudeAgentSdkDesktopRunSubscription({
      subId: "sub-tail",
      subChatId: "sub-1",
      abortController: controller,
      guardedContract: null,
      getDb: () => db,
      markInactive: () => {},
      desktopJobId: null,
      desktopJobSawError: false,
      desktopJobReachedNaturalFinish: true,
      dependencies: {
        deleteActiveClaudeSessionIfController: () => false,
        clearClaudePendingToolApprovals: (message, subChatId) => {
          clearedApprovals.push({ message, subChatId })
        },
        requestCancelClaudeAgentSdkDesktopJob: (input) => {
          canceledJobs.push(input)
        },
        log: () => {},
      },
    })

    expect(result).toEqual({ ownsActiveSession: false })
    expect(controller.signal.aborted).toBe(true)
    expect(clearedApprovals).toEqual([])
    expect(updates).toEqual([])
    expect(canceledJobs).toEqual([
      {
        db,
        jobId: null,
        sawError: false,
        reachedNaturalFinish: true,
      },
    ])
  })

  test("finalizes lifecycle cleanup with the existing job db and guard teardown", () => {
    const { db } = createDbRecorder()
    const controller = new AbortController()
    const completedJobs: any[] = []
    const deletedSessions: any[] = []
    const deletedContracts: string[] = []

    finalizeClaudeAgentSdkDesktopRunAfterLifecycle({
      chatId: "chat-1",
      subChatId: "sub-1",
      abortController: controller,
      guardedContract: { id: "contract-1" } as any,
      getDb: () => {
        throw new Error("fallback db should not be used")
      },
      desktopJobDb: db,
      desktopJobId: "job-1",
      desktopJobSawError: true,
      desktopJobReachedNaturalFinish: false,
      dependencies: {
        completeClaudeAgentSdkDesktopJobAfterRun: (input) => {
          completedJobs.push(input)
        },
        deleteActiveClaudeSessionIfController: (subChatId, abortController) => {
          deletedSessions.push({ subChatId, abortController })
          return true
        },
        deleteGuardedContract: (contractId) => {
          deletedContracts.push(contractId)
        },
      },
    })

    expect(completedJobs).toEqual([
      {
        db,
        jobId: "job-1",
        chatId: "chat-1",
        subChatId: "sub-1",
        abortSignal: controller.signal,
        reachedNaturalFinish: false,
        sawError: true,
      },
    ])
    expect(deletedSessions).toEqual([
      { subChatId: "sub-1", abortController: controller },
    ])
    expect(deletedContracts).toEqual(["contract-1"])
  })

  test("finalizes lifecycle cleanup without loading a db when no job exists", () => {
    const controller = new AbortController()
    const completedJobs: any[] = []
    const deletedSessions: any[] = []
    let loadedFallbackDb = false

    finalizeClaudeAgentSdkDesktopRunAfterLifecycle({
      chatId: "chat-1",
      subChatId: "sub-1",
      abortController: controller,
      guardedContract: null,
      getDb: () => {
        loadedFallbackDb = true
        return createDbRecorder().db
      },
      desktopJobDb: null,
      desktopJobId: null,
      desktopJobSawError: false,
      desktopJobReachedNaturalFinish: true,
      dependencies: {
        completeClaudeAgentSdkDesktopJobAfterRun: (input) => {
          completedJobs.push(input)
        },
        deleteActiveClaudeSessionIfController: (subChatId, abortController) => {
          deletedSessions.push({ subChatId, abortController })
          return false
        },
      },
    })

    expect(completedJobs).toEqual([])
    expect(loadedFallbackDb).toBe(false)
    expect(deletedSessions).toEqual([
      { subChatId: "sub-1", abortController: controller },
    ])
  })

  test("aborts a desktop run request and clears pending approvals", () => {
    const controller = new AbortController()
    const clearedApprovals: any[] = []

    abortClaudeAgentSdkDesktopRunRequest({
      subChatId: "sub-1",
      abortController: controller,
      dependencies: {
        clearClaudePendingToolApprovals: (message, subChatId) => {
          clearedApprovals.push({ message, subChatId })
        },
      },
    })

    expect(controller.signal.aborted).toBe(true)
    expect(clearedApprovals).toEqual([
      { message: "Session cancelled.", subChatId: "sub-1" },
    ])
  })

  test("cancels the active desktop run with run identity fencing", () => {
    const controller = new AbortController()
    const clearedApprovals: any[] = []
    const deletedSessions: string[] = []

    const result = cancelClaudeAgentSdkActiveDesktopRun({
      subChatId: "sub-1",
      runId: "run-1",
      dependencies: {
        getActiveClaudeSession: () => ({ controller, runId: "run-1" }),
        clearClaudePendingToolApprovals: (message, subChatId) => {
          clearedApprovals.push({ message, subChatId })
        },
        deleteActiveClaudeSession: (subChatId) => {
          deletedSessions.push(subChatId)
          return true
        },
      },
    })

    expect(result).toEqual({ cancelled: true, ignoredStale: false })
    expect(controller.signal.aborted).toBe(true)
    expect(clearedApprovals).toEqual([
      { message: "Session cancelled.", subChatId: "sub-1" },
    ])
    expect(deletedSessions).toEqual(["sub-1"])
  })

  test("ignores stale active desktop run cancellation by run id", () => {
    const controller = new AbortController()
    const clearedApprovals: any[] = []
    const deletedSessions: string[] = []

    const result = cancelClaudeAgentSdkActiveDesktopRun({
      subChatId: "sub-1",
      runId: "newer-run",
      dependencies: {
        getActiveClaudeSession: () => ({ controller, runId: "older-run" }),
        clearClaudePendingToolApprovals: (message, subChatId) => {
          clearedApprovals.push({ message, subChatId })
        },
        deleteActiveClaudeSession: (subChatId) => {
          deletedSessions.push(subChatId)
          return true
        },
      },
    })

    expect(result).toEqual({ cancelled: false, ignoredStale: true })
    expect(controller.signal.aborted).toBe(false)
    expect(clearedApprovals).toEqual([])
    expect(deletedSessions).toEqual([])
  })

  test("reports no cancellation when there is no active desktop run", () => {
    const result = cancelClaudeAgentSdkActiveDesktopRun({
      subChatId: "sub-1",
      dependencies: {
        getActiveClaudeSession: () => undefined,
      },
    })

    expect(result).toEqual({ cancelled: false, ignoredStale: false })
  })
})
