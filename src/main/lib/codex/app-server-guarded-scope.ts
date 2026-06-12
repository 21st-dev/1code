import type { DesktopPermissionPolicy } from "../agent-runtime/permission-policy"
import { getCodexAppServerPermissionMapping } from "../agent-runtime/permission-policy"
import type { ValidatedAgentScopeContract } from "../agent-guard"

export type CodexAppServerGuardedScopeContext = {
  controlLevel: "guarded"
  contract: ValidatedAgentScopeContract
  enforcement: "app-server-approval-gate"
}

export class CodexAppServerGuardedScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CodexAppServerGuardedScopeError"
  }
}

export function resolveCodexAppServerGuardedScope(input: {
  permissionPolicy: DesktopPermissionPolicy
  guardedContract?: ValidatedAgentScopeContract | null
}): CodexAppServerGuardedScopeContext | null {
  const permission = getCodexAppServerPermissionMapping(input.permissionPolicy)
  const hasContract = Boolean(input.guardedContract)

  if (permission.controlLevel !== "guarded") {
    if (hasContract) {
      throw new CodexAppServerGuardedScopeError(
        "Codex app-server scope contract requires guarded permission policy.",
      )
    }
    return null
  }

  if (!input.guardedContract) {
    throw new CodexAppServerGuardedScopeError(
      "Codex app-server guarded run requires a validated scope contract.",
    )
  }

  if (
    !permission.requiresApprovalGate ||
    permission.approvalGateFailure !== "fail-closed"
  ) {
    throw new CodexAppServerGuardedScopeError(
      "Codex app-server guarded run requires fail-closed approval gate enforcement.",
    )
  }

  return {
    controlLevel: "guarded",
    contract: input.guardedContract,
    enforcement: "app-server-approval-gate",
  }
}
