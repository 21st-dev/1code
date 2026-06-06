import { eq } from "drizzle-orm"
import {
  deleteActiveGuardedContract,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import {
  deleteActiveClaudeSessionIfController,
} from "./active-sessions"
import { clearClaudePendingToolApprovals } from "./tool-approvals"
import { requestCancelClaudeAgentSdkDesktopJob } from "./agent-sdk-desktop-job"
import { subChats } from "../db"
import type { AgentJobDatabase } from "../headless/job-store"

export type CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies = {
  deleteActiveClaudeSessionIfController:
    typeof deleteActiveClaudeSessionIfController
  clearClaudePendingToolApprovals: typeof clearClaudePendingToolApprovals
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

const defaultDependencies: CleanupClaudeAgentSdkDesktopRunSubscriptionDependencies =
  {
    clearClaudePendingToolApprovals,
    deleteActiveClaudeSessionIfController,
    deleteGuardedContract: deleteActiveGuardedContract,
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
