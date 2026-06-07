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
import type { ClaudeAgentSdkDesktopRunState } from "./agent-sdk-desktop-run-state"
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
  desktopRunState: Pick<
    ClaudeAgentSdkDesktopRunState,
    "getJobId" | "markInactive" | "reachedNaturalFinish" | "sawError"
  >
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
  desktopRunState: Pick<
    ClaudeAgentSdkDesktopRunState,
    "getDb" | "getJobId" | "reachedNaturalFinish" | "sawError"
  >
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
  input.desktopRunState.markInactive()
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
    jobId: input.desktopRunState.getJobId(),
    sawError: input.desktopRunState.sawError(),
    reachedNaturalFinish: input.desktopRunState.reachedNaturalFinish(),
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
  const desktopJobId = input.desktopRunState.getJobId()

  if (desktopJobId) {
    dependencies.completeClaudeAgentSdkDesktopJobAfterRun({
      db: input.desktopRunState.getDb() ?? input.getDb(),
      jobId: desktopJobId,
      chatId: input.chatId,
      subChatId: input.subChatId,
      abortSignal: input.abortController.signal,
      reachedNaturalFinish: input.desktopRunState.reachedNaturalFinish(),
      sawError: input.desktopRunState.sawError(),
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
