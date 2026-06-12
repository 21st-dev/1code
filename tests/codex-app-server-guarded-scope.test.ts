import { describe, expect, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import type { ValidatedAgentScopeContract } from "../src/main/lib/agent-guard"
import {
  CodexAppServerGuardedScopeError,
  resolveCodexAppServerGuardedScope,
} from "../src/main/lib/codex/app-server-guarded-scope"

function contract(): ValidatedAgentScopeContract {
  return {
    id: "contract-1",
    goal: "Edit only docs",
    editableScope: [{ path: "docs", kind: "directory" }],
    readOnlyEvidence: [],
    successChecks: [],
    blockedPaths: [],
    expansions: [],
  } as ValidatedAgentScopeContract
}

describe("Codex app-server guarded scope gate", () => {
  test("accepts app-server guarded policy only with a validated scope contract", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      hasScopeContract: true,
      codexAdapterSource: "codex-app-server",
    })
    const guardedContract = contract()

    expect(
      resolveCodexAppServerGuardedScope({
        permissionPolicy,
        guardedContract,
      }),
    ).toEqual({
      controlLevel: "guarded",
      contract: guardedContract,
      enforcement: "app-server-approval-gate",
    })
  })

  test("fails closed when app-server guarded policy has no scope contract", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      hasScopeContract: true,
      codexAdapterSource: "codex-app-server",
    })

    expect(() =>
      resolveCodexAppServerGuardedScope({ permissionPolicy }),
    ).toThrow(CodexAppServerGuardedScopeError)
    expect(() =>
      resolveCodexAppServerGuardedScope({ permissionPolicy }),
    ).toThrow("requires a validated scope contract")
  })

  test("fails closed when ACP permission mapping is passed to app-server guarded scope", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      hasScopeContract: true,
    })

    expect(() =>
      resolveCodexAppServerGuardedScope({
        permissionPolicy,
        guardedContract: contract(),
      }),
    ).toThrow("Permission policy is not for Codex app-server")
  })

  test("fails closed when a contract is present without guarded app-server policy", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      codexAdapterSource: "codex-app-server",
    })

    expect(() =>
      resolveCodexAppServerGuardedScope({
        permissionPolicy,
        guardedContract: contract(),
      }),
    ).toThrow("scope contract requires guarded permission policy")
  })
})
