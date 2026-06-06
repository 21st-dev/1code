import {
  buildGuardedRunAudit,
  captureGuardedGitStatus,
  type GuardedGitStatusSnapshot,
} from "../agent-guard/audit"
import type {
  AgentGuardEvent,
  AgentScopeContract,
  AgentScopePath,
  AgentSuccessCheck,
  GuardedRunAudit,
} from "../../../shared/agent-scope-contracts"

export type ClaudeAgentSdkGuardedContract = AgentScopeContract & {
  editableScope: AgentScopePath[]
  readOnlyEvidence: AgentScopePath[]
  successChecks: AgentSuccessCheck[]
  blockedPaths: AgentScopePath[]
}

export type FinalizeClaudeAgentSdkGuardMetadataOptions = {
  failed?: boolean
  stopped?: boolean
}

export type FinalizeClaudeAgentSdkGuardMetadataInput = {
  currentMetadata: any
  guardedContract: ClaudeAgentSdkGuardedContract | null
  guardedPreRunStatus: GuardedGitStatusSnapshot | null
  runtimeCwd: string
  guardEvents: AgentGuardEvent[]
  startedAt: string
  options?: FinalizeClaudeAgentSdkGuardMetadataOptions
  emit: (chunk: { type: "guard-audit"; audit: GuardedRunAudit }) => void
  captureGitStatus?: typeof captureGuardedGitStatus
  getContract?: (
    contractId: string,
  ) => ClaudeAgentSdkGuardedContract | null | undefined
  deleteContract?: (contractId: string) => unknown
}

export async function finalizeClaudeAgentSdkGuardMetadata({
  currentMetadata,
  guardedContract,
  guardedPreRunStatus,
  runtimeCwd,
  guardEvents,
  startedAt,
  options = {},
  emit,
  captureGitStatus = captureGuardedGitStatus,
  getContract,
  deleteContract,
}: FinalizeClaudeAgentSdkGuardMetadataInput): Promise<any> {
  if (!guardedContract || !guardedPreRunStatus) {
    return currentMetadata
  }

  if (!getContract || !deleteContract) {
    throw new Error("Guarded contract lifecycle dependencies are required")
  }

  const finalContract = getContract(guardedContract.id) ?? guardedContract
  const postRunStatus = await captureGitStatus(runtimeCwd)
  const audit = buildGuardedRunAudit({
    contract: finalContract,
    runtime: "claude",
    enforcementMode: "hard",
    preRunStatus: guardedPreRunStatus,
    postRunStatus,
    guardEvents,
    startedAt,
    failed: options.failed,
    stopped: options.stopped,
  })
  deleteContract(guardedContract.id)
  emit({ type: "guard-audit", audit })

  return {
    ...currentMetadata,
    guardedRun: {
      ...(currentMetadata?.guardedRun ?? {}),
      audit,
    },
  }
}
