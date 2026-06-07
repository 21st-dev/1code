import type { AgentJobMode } from "../../../shared/agent-jobs"
import {
  prepareActiveGuardedRunContract,
  type GuardedGitStatusSnapshot,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import type { PrepareActiveGuardedRunContractInput } from "../agent-guard/active-contracts"
import {
  resolveDesktopPermissionPolicy,
  type DesktopPermissionPolicy,
} from "../agent-runtime/permission-policy"
import {
  verifyDesktopRunPreflight,
  type DesktopRunPreflightResult,
} from "../agent-runtime/preflight"
import type { AgentJobDatabase } from "../headless/job-store"
import type { UIMessageChunk } from "./types"

export type PrepareClaudeAgentSdkDesktopRunControlsDependencies = {
  verifyPreflight: typeof verifyDesktopRunPreflight
  prepareGuardedRunContract: typeof prepareActiveGuardedRunContract
  resolvePermissionPolicy: typeof resolveDesktopPermissionPolicy
}

export type PrepareClaudeAgentSdkDesktopRunControlsInput = {
  db: AgentJobDatabase
  chatId: string
  subChatId: string
  cwd: string
  projectPath?: string
  mode: AgentJobMode
  scopeContract?: PrepareActiveGuardedRunContractInput["scopeContract"]
  runId?: string
  fallbackRunId: string
  emitError: (error: unknown, context: string) => void
  emit: (chunk: UIMessageChunk) => unknown
  complete: () => void
  dependencies?: Partial<PrepareClaudeAgentSdkDesktopRunControlsDependencies>
}

export type PreparedClaudeAgentSdkDesktopRunControls = {
  preflight: DesktopRunPreflightResult
  runtimeCwd: string
  guardedContract: ValidatedAgentScopeContract | null
  guardedPreRunStatus: GuardedGitStatusSnapshot | null
  permissionPolicy: DesktopPermissionPolicy
}

export type PrepareClaudeAgentSdkDesktopRunControlsResult =
  | ({ ok: true } & PreparedClaudeAgentSdkDesktopRunControls)
  | {
      ok: false
      reason: "guarded-contract-rejected"
      error: string
    }

const defaultDependencies: PrepareClaudeAgentSdkDesktopRunControlsDependencies =
  {
    prepareGuardedRunContract: prepareActiveGuardedRunContract,
    resolvePermissionPolicy: resolveDesktopPermissionPolicy,
    verifyPreflight: verifyDesktopRunPreflight,
  }

function withDefaultDependencies(
  dependencies:
    | Partial<PrepareClaudeAgentSdkDesktopRunControlsDependencies>
    | undefined,
): PrepareClaudeAgentSdkDesktopRunControlsDependencies {
  return { ...defaultDependencies, ...dependencies }
}

export async function prepareClaudeAgentSdkDesktopRunControls(
  input: PrepareClaudeAgentSdkDesktopRunControlsInput,
): Promise<PrepareClaudeAgentSdkDesktopRunControlsResult> {
  const dependencies = withDefaultDependencies(input.dependencies)
  const preflight = dependencies.verifyPreflight(input.db, {
    chatId: input.chatId,
    subChatId: input.subChatId,
    cwd: input.cwd,
  })
  const runtimeCwd = preflight.cwd

  const activeGuardedRun = await dependencies.prepareGuardedRunContract({
    scopeContract: input.scopeContract,
    cwd: runtimeCwd,
    projectPath: input.projectPath,
    chatId: input.chatId,
    subChatId: input.subChatId,
    runId: input.runId,
    fallbackRunId: input.fallbackRunId,
  })
  if (!activeGuardedRun.ok) {
    input.emitError(
      new Error(activeGuardedRun.error),
      "Guarded run contract rejected",
    )
    input.emit({ type: "finish" })
    input.complete()
    return {
      ok: false,
      reason: "guarded-contract-rejected",
      error: activeGuardedRun.error,
    }
  }

  const permissionPolicy = dependencies.resolvePermissionPolicy({
    runtimeId: "claude-code",
    mode: input.mode,
    hasScopeContract: Boolean(activeGuardedRun.contract),
  })

  return {
    ok: true,
    preflight,
    runtimeCwd,
    guardedContract: activeGuardedRun.contract,
    guardedPreRunStatus: activeGuardedRun.preRunStatus,
    permissionPolicy,
  }
}
