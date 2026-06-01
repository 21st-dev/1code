import type { AgentGuardRuntime } from "../../../shared/agent-scope-contracts"

export type GuardedRunCheckpointAvailabilityInput = {
  runtime: AgentGuardRuntime
  sdkMessageUuid?: string | null
  dirtyBeforeRun?: boolean
}

export type GuardedRunCheckpointAvailability =
  | {
      available: true
      mechanism: "existing-rollback-checkpoint"
      reason: null
    }
  | {
      available: false
      mechanism: "unavailable"
      reason: string
    }

export function getGuardedRunCheckpointAvailability({
  runtime,
  sdkMessageUuid,
  dirtyBeforeRun,
}: GuardedRunCheckpointAvailabilityInput): GuardedRunCheckpointAvailability {
  if (runtime !== "claude") {
    return {
      available: false,
      mechanism: "unavailable",
      reason:
        "Codex rollback checkpoints are unavailable until rollback and fork use durable shared session references.",
    }
  }

  if (dirtyBeforeRun) {
    return {
      available: false,
      mechanism: "unavailable",
      reason: "Rollback checkpoint is disabled when the worktree is already dirty before the guarded run.",
    }
  }

  if (!sdkMessageUuid) {
    return {
      available: false,
      mechanism: "unavailable",
      reason: "Claude rollback checkpoint requires a persisted SDK message UUID.",
    }
  }

  return {
    available: true,
    mechanism: "existing-rollback-checkpoint",
    reason: null,
  }
}
