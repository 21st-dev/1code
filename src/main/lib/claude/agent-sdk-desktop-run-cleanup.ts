import { eq } from "drizzle-orm"
import {
  deleteActiveGuardedContract,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import {
  deleteActiveClaudeSession,
  deleteActiveClaudeSessionIfController,
  getActiveClaudeSession,
} from "./active-sessions"
import { clearClaudePendingToolApprovals } from "./tool-approvals"
import {
  completeClaudeAgentSdkDesktopJobAfterRun,
  requestCancelClaudeAgentSdkDesktopJob,
} from "./agent-sdk-desktop-job"
import { subChats } from "../db"
import type { AgentJobDatabase } from "../headless/job-store"

export type CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies = {
  deleteActiveClaudeSessionIfController:
    typeof deleteActiveClaudeSessionIfController
  deleteActiveClaudeSession: typeof deleteActiveClaudeSession
  getActiveClaudeSession: typeof getActiveClaudeSession
  clearClaudePendingToolApprovals: typeof clearClaudePendingToolApprovals
  completeClaudeAgentSdkDesktopJobAfterRun:
    typeof completeClaudeAgentSdkDesktopJobAfterRun
  requestCancelClaudeAgentSdkDesktopJob:
    typeof requestCancelClaudeAgentSdkDesktopJob
  deleteGuardedContract: (contractId: string) => void
  log: (...args: any[]) => void
}

export type CleanupClaudeAgentSdkDesktopRunSubscriptionInput = {
  subId: string
  subChatId: string
  sessionId?: string | null
  abortController: AbortController
  guardedContract: ValidatedAgentScopeContract | null
  getDb: () => AgentJobDatabase
  markInactive: () => void
  desktopJobId: string | null
  desktopJobSawError: boolean
  desktopJobReachedNaturalFinish: boolean
  dependencies?: Partial<CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies>
}

export type CleanupClaudeAgentSdkDesktopRunSubscriptionResult = {
  ownsActiveSession: boolean
}

export type FinalizeClaudeAgentSdkDesktopRunAfterLifecycleInput = {
  chatId: string
  subChatId: string
  abortController: AbortController
  guardedContract: ValidatedAgentScopeContract | null
  getDb: () => AgentJobDatabase
  desktopJobDb: AgentJobDatabase | null
  desktopJobId: string | null
  desktopJobSawError: boolean
  desktopJobReachedNaturalFinish: boolean
  dependencies?: Partial<CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies>
}

export type AbortClaudeAgentSdkDesktopRunRequestInput = {
  subChatId: string
  abortController: AbortController
  message?: string
  dependencies?: Partial<CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies>
}

export type CancelClaudeAgentSdkActiveDesktopRunInput = {
  subChatId: string
  runId?: string
  dependencies?: Partial<CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies>
}

export type CancelClaudeAgentSdkActiveDesktopRunResult = {
  cancelled: boolean
  ignoredStale: boolean
}

const defaultDependencies: CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies =
  {
    clearClaudePendingToolApprovals,
    completeClaudeAgentSdkDesktopJobAfterRun,
    deleteActiveClaudeSession,
    deleteActiveClaudeSessionIfController,
    deleteGuardedContract: deleteActiveGuardedContract,
    getActiveClaudeSession,
    log: console.log,
    requestCancelClaudeAgentSdkDesktopJob,
  }

function withDefaultDependencies(
  dependencies:
    | Partial<CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies>
    | undefined,
): CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies {
  return { ...defaultDependencies, ...dependencies }
}

export function cleanupClaudeAgentSdkDesktopRunSubscription(
  input: CleanupClaudeAgentSdkDesktopRunSubscriptionInput,
): CleanupClaudeAgentSdkDesktopRunSubscriptionResult {
  const dependencies = withDefaultDependencies(input.dependencies)

  dependencies.log(
    `[SD] M:CLEANUP sub=${input.subId} sessionId=${input.sessionId || "none"}`,
  )
  input.markInactive()
  input.abortController.abort()

  const ownsActiveSession = dependencies.deleteActiveClaudeSessionIfController(
    input.subChatId,
    input.abortController,
  )

  if (input.guardedContract) {
    dependencies.deleteGuardedContract(input.guardedContract.id)
  }

  if (ownsActiveSession) {
    dependencies.clearClaudePendingToolApprovals(
      "Session ended.",
      input.subChatId,
    )
  }

  const db = input.getDb()
  dependencies.requestCancelClaudeAgentSdkDesktopJob({
    db,
    jobId: input.desktopJobId,
    sawError: input.desktopJobSawError,
    reachedNaturalFinish: input.desktopJobReachedNaturalFinish,
  })

  if (ownsActiveSession) {
    db.update(subChats)
      .set({ streamId: null })
      .where(eq(subChats.id, input.subChatId))
      .run()
  }

  return { ownsActiveSession }
}

export function finalizeClaudeAgentSdkDesktopRunAfterLifecycle(
  input: FinalizeClaudeAgentSdkDesktopRunAfterLifecycleInput,
): void {
  const dependencies = withDefaultDependencies(input.dependencies)

  if (input.desktopJobId) {
    dependencies.completeClaudeAgentSdkDesktopJobAfterRun({
      db: input.desktopJobDb ?? input.getDb(),
      jobId: input.desktopJobId,
      chatId: input.chatId,
      subChatId: input.subChatId,
      abortSignal: input.abortController.signal,
      reachedNaturalFinish: input.desktopJobReachedNaturalFinish,
      sawError: input.desktopJobSawError,
    })
  }

  dependencies.deleteActiveClaudeSessionIfController(
    input.subChatId,
    input.abortController,
  )

  if (input.guardedContract) {
    dependencies.deleteGuardedContract(input.guardedContract.id)
  }
}

export function abortClaudeAgentSdkDesktopRunRequest(
  input: AbortClaudeAgentSdkDesktopRunRequestInput,
): void {
  const dependencies = withDefaultDependencies(input.dependencies)

  input.abortController.abort()
  dependencies.clearClaudePendingToolApprovals(
    input.message ?? "Session cancelled.",
    input.subChatId,
  )
}

export function cancelClaudeAgentSdkActiveDesktopRun(
  input: CancelClaudeAgentSdkActiveDesktopRunInput,
): CancelClaudeAgentSdkActiveDesktopRunResult {
  const dependencies = withDefaultDependencies(input.dependencies)
  const session = dependencies.getActiveClaudeSession(input.subChatId)

  if (session && input.runId && session.runId !== input.runId) {
    return { cancelled: false, ignoredStale: true }
  }

  if (session) {
    abortClaudeAgentSdkDesktopRunRequest({
      subChatId: input.subChatId,
      abortController: session.controller,
      dependencies,
    })
    dependencies.deleteActiveClaudeSession(input.subChatId)
  }

  return { cancelled: Boolean(session), ignoredStale: false }
}
