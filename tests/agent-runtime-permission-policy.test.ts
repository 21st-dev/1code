import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
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

  test("desktop routes consume the shared permission policy owner", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const claudeToolPermission = readFileSync(
      "src/main/lib/claude/agent-sdk-tool-permission.ts",
      "utf8",
    )
    const codexAcpTemporaryCompatAdapter = readFileSync(
      "src/main/lib/codex/acp-temporary-compat-adapter.ts",
      "utf8",
    )
    const codexAcpRuntime = readFileSync(
      "src/main/lib/codex/acp-runtime.ts",
      "utf8",
    )

    expect(claude).toContain("resolveDesktopPermissionPolicy")
    expect(claude).toContain("getClaudePermissionMapping")
    expect(claude).toContain("createClaudeAgentSdkToolPermissionHandler")
    expect(claudeToolPermission).toContain(
      "permissionPolicy.planWorkspaceSideEffects",
    )
    expect(claude).not.toContain('Only ".md" files can be modified in plan mode.')

    expect(codex).toContain("resolveDesktopPermissionPolicy")
    expect(codexAcpTemporaryCompatAdapter).toContain("getCodexPermissionMapping")
    expect(codexAcpTemporaryCompatAdapter).toContain(
      "permission: getCodexPermissionMapping(request.permissionPolicy)",
    )
    expect(codexAcpRuntime).toContain("permission.acpMode")
    expect(codexAcpRuntime).toContain("permission.requiresPermissionHandler")
    expect(codex).not.toContain("function getCodexAcpModeId")
  })
})
