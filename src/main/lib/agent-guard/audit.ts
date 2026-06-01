import simpleGit from "simple-git"
import type {
  AgentGuardEnforcementMode,
  AgentGuardEvent,
  AgentGuardRuntime,
  GuardedChangedFile,
  GuardedRunAudit,
} from "../../../shared/agent-scope-contracts"
import type { ValidatedAgentScopeContract } from "./contract"
import { isPathInEditableScope, relativeChangedFilePath } from "./decision"

export type GuardedGitStatusSnapshot = {
  dirty: boolean
  files: string[]
  capturedAt: string
  available: boolean
  error?: string
}

export type BuildGuardedRunAuditInput = {
  contract: ValidatedAgentScopeContract
  runtime: AgentGuardRuntime
  enforcementMode: AgentGuardEnforcementMode
  preRunStatus: GuardedGitStatusSnapshot
  postRunStatus: GuardedGitStatusSnapshot
  guardEvents?: AgentGuardEvent[]
  startedAt: string
  finishedAt?: string
  failed?: boolean
  stopped?: boolean
}

export async function captureGuardedGitStatus(
  cwd: string,
): Promise<GuardedGitStatusSnapshot> {
  try {
    const git = simpleGit(cwd)
    const status = await git.status()
    const files = status.files
      .map((file) => relativeChangedFilePath(file.path))
      .sort((a, b) => a.localeCompare(b))

    return {
      dirty: files.length > 0,
      files,
      capturedAt: new Date().toISOString(),
      available: true,
    }
  } catch (error) {
    return {
      dirty: false,
      files: [],
      capturedAt: new Date().toISOString(),
      available: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function classifyGuardedChangedFiles(
  contract: ValidatedAgentScopeContract,
  preRunStatus: GuardedGitStatusSnapshot,
  postRunStatus: GuardedGitStatusSnapshot,
): GuardedChangedFile[] {
  const preExisting = new Set(preRunStatus.files)
  const files = new Set([...preRunStatus.files, ...postRunStatus.files])

  return [...files]
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => {
      if (preExisting.has(filePath)) {
        return {
          path: filePath,
          scope: "pre-existing" as const,
        }
      }

      return {
        path: filePath,
        scope: isPathInEditableScope(contract, filePath)
          ? ("in-scope" as const)
          : ("out-of-scope" as const),
      }
    })
}

export function buildGuardedRunAudit({
  contract,
  runtime,
  enforcementMode,
  preRunStatus,
  postRunStatus,
  guardEvents = [],
  startedAt,
  finishedAt = new Date().toISOString(),
  failed,
  stopped,
}: BuildGuardedRunAuditInput): GuardedRunAudit {
  const changedFiles = classifyGuardedChangedFiles(
    contract,
    preRunStatus,
    postRunStatus,
  )
  const blockedEvents = guardEvents.filter((event) => event.type === "blocked")
  const expansionEvents = contract.expansions
  const hasOutOfScope = changedFiles.some((file) => file.scope === "out-of-scope")
  const hasInScope = changedFiles.some(
    (file) => file.scope === "in-scope" || file.scope === "expanded-scope",
  )

  const status = stopped
    ? "stopped"
    : failed
      ? "failed"
      : hasOutOfScope
        ? "drifted"
        : blockedEvents.length > 0
          ? "blocked"
          : expansionEvents.some((event) => event.approvedAt)
            ? "expanded"
            : hasInScope || changedFiles.length === 0
              ? "passed"
              : "needs-review"

  return {
    runId: contract.runId ?? contract.id,
    contractId: contract.id,
    runtime,
    enforcementMode,
    status,
    changedFiles,
    blockedEvents,
    expansionEvents,
    verificationCommands: contract.successChecks.map((check) => ({
      command: check.command,
      status: "not-run",
    })),
    dirtyBeforeRun: preRunStatus.dirty,
    dirtyBeforeRunFiles: preRunStatus.files,
    startedAt,
    finishedAt,
  }
}

export function buildGuardedRunPromptBlock(
  contract: ValidatedAgentScopeContract,
): string {
  const formatPaths = (paths: { path: string }[]) =>
    paths.length > 0
      ? paths.map((item) => `- ${item.path}`).join("\n")
      : "- (none)"
  const formatChecks = () =>
    contract.successChecks.length > 0
      ? contract.successChecks.map((item) => `- ${item.command}`).join("\n")
      : "- (none)"

  return `<locus_guarded_run id="${contract.id}" version="1">
editable_scope:
${formatPaths(contract.editableScope)}
read_only_evidence:
${formatPaths(contract.readOnlyEvidence)}
success_checks:
${formatChecks()}
policy:
- Do not modify files outside editable_scope.
- Request scope expansion before touching additional files.
- Treat success_checks as the intended verification commands.
- This runtime is using contract-and-audit mode unless the app reports hard enforcement.
</locus_guarded_run>`
}
