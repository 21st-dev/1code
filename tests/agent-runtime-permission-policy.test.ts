import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import {
  DESKTOP_RUNTIME_CONTROL_LEVELS,
} from "../src/shared/agent-runtime-control"

describe("desktop runtime permission policy", () => {
  test("maps Claude plan mode to native read-only without bypass", () => {
    const policy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "plan",
    })

    expect(policy.enforcement).toBe("native-plan-read-only")
    expect(policy.controlLevel).toBe("plan")
    expect(policy.planWorkspaceSideEffects).toBe("deny")
    expect(policy.blockedSideEffects).toContain("workspace-file-write")
    expect(policy.observedToolPolicy.enabled).toBe(false)
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
    expect(policy.controlLevel).toBe("guarded")
    expect(policy.requiresPreExecutionEnforcement).toBe(true)
    expect(policy.observedToolPolicy.enabled).toBe(false)
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
    expect(planPolicy.controlLevel).toBe("plan")
    expect(planPolicy.runtimeMapping).toMatchObject({
      runtime: "codex",
      adapterSource: "acp-temporary-compat",
      acpMode: "read-only",
      requiresPermissionHandler: true,
      permissionHandlerFailure: "fail-closed",
    })
    expect(guardedPolicy.enforcement).toBe("codex-acp-guarded-handler")
    expect(guardedPolicy.controlLevel).toBe("guarded")
    expect(guardedPolicy.runtimeMapping).toMatchObject({
      runtime: "codex",
      adapterSource: "acp-temporary-compat",
      acpMode: "auto",
      requiresPermissionHandler: true,
      permissionHandlerFailure: "fail-closed",
    })
  })

  test("maps normal Agent mode to observed control by default", () => {
    const claudePolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    })
    const codexPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
    })

    expect(DESKTOP_RUNTIME_CONTROL_LEVELS).toContain("observe")
    expect(DESKTOP_RUNTIME_CONTROL_LEVELS).toContain("guarded")
    expect(DESKTOP_RUNTIME_CONTROL_LEVELS).toContain("strict")

    expect(claudePolicy.controlLevel).toBe("observe")
    expect(claudePolicy.enforcement).toBe("locus-agent-observed")
    expect(claudePolicy.requiresPreExecutionEnforcement).toBe(false)
    expect(claudePolicy.observedToolPolicy).toMatchObject({
      enabled: true,
      blocksCatastrophicActions: true,
      degradation: "not-applicable",
    })
    expect(claudePolicy.observedToolPolicy.catastrophicActions).toEqual([
      "high-risk-shell",
      "sensitive-path-write",
      "network-egress",
    ])
    expect(claudePolicy.runtimeMapping).toMatchObject({
      runtime: "claude-code",
      requiresToolPolicy: true,
      allowDangerouslySkipPermissions: true,
    })

    expect(codexPolicy.controlLevel).toBe("observe")
    expect(codexPolicy.enforcement).toBe("codex-acp-agent-observed")
    expect(codexPolicy.observedToolPolicy).toMatchObject({
      enabled: true,
      blocksCatastrophicActions: true,
      degradation: "stream-only-when-hook-unavailable",
    })
    expect(codexPolicy.runtimeMapping).toMatchObject({
      runtime: "codex",
      requiresPermissionHandler: true,
      permissionHandlerFailure: "degrade-to-stream-only",
    })
  })

  test("desktop routes consume the shared permission policy owner", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")
    const claudeControls = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-controls.ts",
      "utf8",
    )
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const claudeToolPermission = readFileSync(
      "src/main/lib/claude/agent-sdk-tool-permission.ts",
      "utf8",
    )
    const claudeQueryOptions = readFileSync(
      "src/main/lib/claude/agent-sdk-query-options.ts",
      "utf8",
    )
    const claudeRuntimeQuery = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-query.ts",
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

    expect(claude).toContain("prepareClaudeAgentSdkDesktopRunControls")
    expect(claude).not.toContain("resolveDesktopPermissionPolicy")
    expect(claudeControls).toContain("resolveDesktopPermissionPolicy")
    expect(claude).not.toContain("getClaudePermissionMapping")
    expect(claude).not.toContain("permissionHandler: {")
    expect(claude).not.toContain("createClaudeAgentSdkToolPermissionHandler")
    expect(claudeRuntimeQuery).toContain("getClaudePermissionMapping")
    expect(claudeQueryOptions).toContain(
      "createClaudeAgentSdkDesktopRuntimeQueryOptions",
    )
    expect(claudeQueryOptions).toContain("permissionHandler: {")
    expect(claudeQueryOptions).toContain(
      "createClaudeAgentSdkToolPermissionHandler",
    )
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
    expect(codexAcpRuntime).toContain("permission.permissionHandlerFailure")
    expect(codex).not.toContain("function getCodexAcpModeId")
  })
})
