import { describe, expect, test } from "bun:test"
import {
  cleanupClaudeAgentSdkDesktopRunSubscription,
} from "../src/main/lib/claude/agent-sdk-subscription-cleanup"

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

describe("Claude Agent SDK subscription cleanup", () => {
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
})
