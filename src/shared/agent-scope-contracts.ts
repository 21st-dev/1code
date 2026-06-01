export type AgentScopeContractStatus =
  | "draft"
  | "approved"
  | "expanded"
  | "completed"
  | "rejected"

export type AgentScopeContractSource =
  | "manual"
  | "plan"
  | "selection"
  | "git"
  | "github"
  | "resume"

export type AgentScopePathKind = "file" | "directory" | "glob"

export type AgentScopePath = {
  path: string
  kind: AgentScopePathKind
  reason?: string
  source?: string
}

export type AgentSuccessCheck = {
  command: string
  cwd?: string
  reason?: string
  allowShellControl?: false
}

export type AgentScopeExpansion = {
  id: string
  requestedAt: string
  approvedAt?: string
  rejectedAt?: string
  requestedByToolUseId?: string
  paths?: AgentScopePath[]
  successChecks?: AgentSuccessCheck[]
  reason: string
  toolName?: string
}

export type AgentScopeContract = {
  id: string
  version: 1
  status: AgentScopeContractStatus
  createdAt: string
  approvedAt?: string
  source: AgentScopeContractSource
  chatId: string
  subChatId: string
  runId?: string
  cwd: string
  projectPath?: string
  editableScope: AgentScopePath[]
  readOnlyEvidence: AgentScopePath[]
  successChecks: AgentSuccessCheck[]
  blockedPaths?: AgentScopePath[]
  expansions: AgentScopeExpansion[]
}

export type AgentGuardRuntime = "claude" | "codex"

export type AgentGuardEnforcementMode = "hard" | "contract-and-audit"

export type AgentGuardEventType =
  | "allowed"
  | "blocked"
  | "scope-expansion-request"
  | "expansion-approved"
  | "expansion-rejected"

export type AgentGuardEvent = {
  id: string
  runId: string
  contractId: string
  type: AgentGuardEventType
  toolName?: string
  toolUseId?: string
  path?: string
  paths?: string[]
  command?: string
  reason: string
  createdAt: string
}

export type AgentGuardDecision =
  | {
      decision: "allow"
      reason: string
      event: AgentGuardEvent
      updatedInput?: Record<string, unknown>
    }
  | {
      decision: "deny"
      reason: string
      event: AgentGuardEvent
    }
  | {
      decision: "request-expansion"
      reason: string
      event: AgentGuardEvent
      requestedPath?: string
    }

export type GuardedChangedFileScope =
  | "in-scope"
  | "expanded-scope"
  | "out-of-scope"
  | "pre-existing"

export type GuardedChangedFile = {
  path: string
  status?: string
  additions?: number
  deletions?: number
  scope: GuardedChangedFileScope
}

export type GuardedVerificationResult = {
  command: string
  status: "not-run" | "passed" | "failed" | "unknown"
  exitCode?: number
  durationMs?: number
}

export type GuardedRunAuditStatus =
  | "passed"
  | "expanded"
  | "blocked"
  | "drifted"
  | "failed"
  | "stopped"
  | "needs-review"

export type GuardedRunAudit = {
  runId: string
  contractId: string
  runtime: AgentGuardRuntime
  enforcementMode: AgentGuardEnforcementMode
  status: GuardedRunAuditStatus
  changedFiles: GuardedChangedFile[]
  blockedEvents: AgentGuardEvent[]
  expansionEvents: AgentScopeExpansion[]
  verificationCommands: GuardedVerificationResult[]
  dirtyBeforeRun?: boolean
  dirtyBeforeRunFiles?: string[]
  startedAt: string
  finishedAt?: string
}
