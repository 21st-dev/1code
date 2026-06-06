import { describe, expect, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"

describe("desktop runtime permission policy", () => {
  test("maps Claude plan mode to native read-only without bypass", () => {
    const policy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "plan",
    })

    expect(policy.enforcement).toBe("native-plan-read-only")
    expect(policy.planWorkspaceSideEffects).toBe("deny")
    expect(policy.blockedSideEffects).toContain("workspace-file-write")
    expect(policy.runtimeMapping).toMatchObject({
      runtime: "claude-code",
      sdkPermissionMode: "plan",
      allowDangerouslySkipPermissions: false,
      requiresToolPolicy: true,
    })
  })

  test("records Claude guarded agent mode as bypass plus Locus tool policy", () => {
    const policy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
      hasScopeContract: true,
    })

    expect(policy.enforcement).toBe("locus-guarded-tool-policy")
    expect(policy.requiresPreExecutionEnforcement).toBe(true)
    expect(policy.runtimeMapping).toMatchObject({
      runtime: "claude-code",
      sdkPermissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      requiresToolPolicy: true,
    })
    expect(policy.runtimeMapping.bypassReason).toContain("Locus guarded tool policy")
  })

  test("maps Codex plan and guarded runs to ACP temporary permission handler", () => {
    const planPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "plan",
    })
    const guardedPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      hasScopeContract: true,
    })

    expect(planPolicy.enforcement).toBe("codex-acp-plan-handler")
    expect(planPolicy.runtimeMapping).toMatchObject({
      runtime: "codex",
      adapterSource: "acp-temporary-compat",
      acpMode: "read-only",
      requiresPermissionHandler: true,
    })
    expect(guardedPolicy.enforcement).toBe("codex-acp-guarded-handler")
    expect(guardedPolicy.runtimeMapping).toMatchObject({
      runtime: "codex",
      adapterSource: "acp-temporary-compat",
      acpMode: "auto",
      requiresPermissionHandler: true,
    })
  })
})
