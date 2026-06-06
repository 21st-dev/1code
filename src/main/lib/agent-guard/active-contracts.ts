import { randomUUID } from "node:crypto"
import type {
  AgentScopeExpansion,
  AgentScopePath,
} from "../../../shared/agent-scope-contracts"
import {
  formatScopeValidationError,
  validateAgentScopeContract,
  type ValidatedAgentScopeContract,
  type ValidateAgentScopeContractOptions,
} from "./contract"

const activeGuardedContracts = new Map<string, ValidatedAgentScopeContract>()

export function getActiveGuardedContract(
  contractId: string,
): ValidatedAgentScopeContract | undefined {
  return activeGuardedContracts.get(contractId)
}

export function setActiveGuardedContract(
  contract: ValidatedAgentScopeContract,
): void {
  activeGuardedContracts.set(contract.id, contract)
}

export function deleteActiveGuardedContract(contractId: string): boolean {
  return activeGuardedContracts.delete(contractId)
}

export function clearActiveGuardedContractsForTest(): void {
  activeGuardedContracts.clear()
}

export type ApplyActiveGuardedScopeExpansionResult =
  | { ok: true; contract: ValidatedAgentScopeContract }
  | { ok: false; error: string }

export async function applyActiveGuardedScopeExpansion(input: {
  contractId: string
  toolUseId: string
  approved: boolean
  path?: string
  paths?: string[]
  reason?: string
  validateOptions?: Partial<ValidateAgentScopeContractOptions>
}): Promise<ApplyActiveGuardedScopeExpansionResult> {
  const current = activeGuardedContracts.get(input.contractId)
  if (!current) {
    return { ok: false, error: "Guarded run is no longer active." }
  }

  const requestedPaths = [
    ...(input.paths && input.paths.length > 0 ? input.paths : []),
    ...(input.path ? [input.path] : []),
  ].filter((item, index, all): item is string =>
    Boolean(item && all.indexOf(item) === index),
  )

  if (requestedPaths.length === 0) {
    return { ok: false, error: "No scope path was requested." }
  }

  const now = new Date().toISOString()
  const expansionPaths: AgentScopePath[] = requestedPaths.map((scopePath) => ({
    path: scopePath,
    kind: "file",
    source: "user",
    reason: input.reason || "Approved during guarded run.",
  }))
  const expansion: AgentScopeExpansion = {
    id: randomUUID(),
    requestedAt: now,
    requestedByToolUseId: input.toolUseId,
    paths: expansionPaths,
    reason: input.reason || "Scope expansion requested by runtime tool use.",
    ...(input.approved ? { approvedAt: now } : { rejectedAt: now }),
  }

  try {
    const updated = await validateAgentScopeContract(
      {
        ...current,
        status: input.approved ? "expanded" : current.status,
        editableScope: input.approved
          ? [...current.editableScope, ...expansionPaths]
          : current.editableScope,
        expansions: [...current.expansions, expansion],
      },
      {
        cwd: current.cwd,
        projectPath: current.projectPath,
        chatId: current.chatId,
        subChatId: current.subChatId,
        runId: current.runId,
        ...input.validateOptions,
      },
    )
    activeGuardedContracts.set(input.contractId, updated)
    return { ok: true, contract: updated }
  } catch (error) {
    return {
      ok: false,
      error: formatScopeValidationError(error),
    }
  }
}
