import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  decideAssistantToolPermission,
  getClaudeAssistantSdkDisallowedTools,
  getCodexAppServerPermissionMapping,
  getKunHttpSsePermissionMapping,
  getQwenAcpClientPermissionMapping,
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import { DESKTOP_RUNTIME_CONTROL_LEVELS } from "../src/shared/agent-runtime-control"

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
    expect(policy.runtimeMapping.bypassReason).toContain(
      "Locus guarded tool policy",
    )
  })

  test("maps Codex plan and guarded runs to app-server fail-closed approval gate by default", () => {
    const planPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "plan",
    })
    const guardedPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      hasScopeContract: true,
    })

    expect(planPolicy.enforcement).toBe("codex-app-server-plan-approval-gate")
    expect(planPolicy.controlLevel).toBe("plan")
    expect(getCodexAppServerPermissionMapping(planPolicy)).toMatchObject({
      runtime: "codex",
      adapterSource: "codex-app-server",
      requiresApprovalGate: true,
      permissionHandlerFailure: "fail-closed",
    })
    expect(guardedPolicy.enforcement).toBe(
      "codex-app-server-guarded-approval-gate",
    )
    expect(guardedPolicy.controlLevel).toBe("guarded")
    expect(getCodexAppServerPermissionMapping(guardedPolicy)).toMatchObject({
      runtime: "codex",
      adapterSource: "codex-app-server",
      requiresApprovalGate: true,
      permissionHandlerFailure: "fail-closed",
    })
  })

  test("maps Codex app-server plan and guarded runs to fail-closed approval gate", () => {
    const planPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "plan",
      codexAdapterSource: "codex-app-server",
    })
    const guardedPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      hasScopeContract: true,
      codexAdapterSource: "codex-app-server",
    })

    expect(planPolicy.enforcement).toBe("codex-app-server-plan-approval-gate")
    expect(planPolicy.controlLevel).toBe("plan")
    expect(planPolicy.requiresPreExecutionEnforcement).toBe(true)
    expect(getCodexAppServerPermissionMapping(planPolicy)).toMatchObject({
      runtime: "codex",
      adapterSource: "codex-app-server",
      controlLevel: "plan",
      appServerApprovalPolicy: "on-request",
      requiresApprovalGate: true,
      approvalGateFailure: "fail-closed",
      approvalHook: {
        required: true,
        missing: "fail-closed",
        delayed: "fail-closed",
      },
      permissionHandlerFailure: "fail-closed",
    })
    expect(planPolicy.diagnostics.join(" ")).toContain(
      "must install its approval gate before provider or tool work starts",
    )

    expect(guardedPolicy.enforcement).toBe(
      "codex-app-server-guarded-approval-gate",
    )
    expect(guardedPolicy.controlLevel).toBe("guarded")
    expect(guardedPolicy.requiresPreExecutionEnforcement).toBe(true)
    expect(getCodexAppServerPermissionMapping(guardedPolicy)).toMatchObject({
      runtime: "codex",
      adapterSource: "codex-app-server",
      controlLevel: "guarded",
      appServerApprovalPolicy: "untrusted",
      requiresApprovalGate: true,
      approvalGateFailure: "fail-closed",
      approvalHook: {
        required: true,
        missing: "fail-closed",
        delayed: "fail-closed",
      },
      permissionHandlerFailure: "fail-closed",
    })
    expect(guardedPolicy.diagnostics.join(" ")).toContain(
      "requires Codex app-server approval gate enforcement before side effects",
    )
  })

  test("maps Qwen ACP client policies to fail-closed permission gates", () => {
    const planPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "qwen-code",
      mode: "plan",
    })
    const guardedPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "qwen-code",
      mode: "agent",
      hasScopeContract: true,
    })
    const observedPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "qwen-code",
      mode: "agent",
    })

    expect(planPolicy.enforcement).toBe("qwen-acp-client-plan-permission-gate")
    expect(planPolicy.requiresPreExecutionEnforcement).toBe(true)
    expect(getQwenAcpClientPermissionMapping(planPolicy)).toMatchObject({
      runtime: "qwen-code",
      adapterSource: "qwen-acp-client",
      controlLevel: "plan",
      acpPermissionPolicy: "ask",
      requiresApprovalGate: true,
      permissionHandlerFailure: "fail-closed",
    })

    expect(guardedPolicy.enforcement).toBe(
      "qwen-acp-client-guarded-permission-gate",
    )
    expect(guardedPolicy.requiresPreExecutionEnforcement).toBe(true)
    expect(getQwenAcpClientPermissionMapping(guardedPolicy)).toMatchObject({
      controlLevel: "guarded",
      permissionHandlerFailure: "fail-closed",
    })

    expect(observedPolicy.enforcement).toBe(
      "qwen-acp-client-agent-permission-gate",
    )
    expect(observedPolicy.requiresPreExecutionEnforcement).toBe(true)
    expect(observedPolicy.observedToolPolicy).toMatchObject({
      enabled: true,
      degradation: "fail-closed-when-hook-unavailable",
    })
    expect(getQwenAcpClientPermissionMapping(observedPolicy)).toMatchObject({
      controlLevel: "observe",
      permissionHandlerFailure: "fail-closed",
    })
  })

  test("maps Kun HTTP/SSE policies to hardened fail-closed approval gates", () => {
    const planPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "kun",
      mode: "plan",
    })
    const guardedPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "kun",
      mode: "agent",
      hasScopeContract: true,
    })
    const observedPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "kun",
      mode: "agent",
    })

    expect(planPolicy.enforcement).toBe("kun-http-sse-plan-blocked")
    expect(planPolicy.requiresPreExecutionEnforcement).toBe(true)
    expect(planPolicy.diagnostics.join(" ")).toContain("degraded in v1")
    expect(getKunHttpSsePermissionMapping(planPolicy)).toMatchObject({
      runtime: "kun",
      adapterSource: "kun-http-sse",
      controlLevel: "plan",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      commandExecution: "sandbox-blocked",
      permissionHandlerFailure: "fail-closed",
    })

    expect(guardedPolicy.enforcement).toBe(
      "kun-http-sse-guarded-approval-gate",
    )
    expect(getKunHttpSsePermissionMapping(guardedPolicy)).toMatchObject({
      controlLevel: "guarded",
      requiresApprovalGate: true,
    })

    expect(observedPolicy.enforcement).toBe("kun-http-sse-agent-approval-gate")
    expect(observedPolicy.requiresPreExecutionEnforcement).toBe(true)
    expect(getKunHttpSsePermissionMapping(observedPolicy)).toMatchObject({
      controlLevel: "observe",
      observedToolPolicy: {
        enabled: true,
        degradation: "fail-closed-when-hook-unavailable",
      },
    })
  })

  test("selects assistant control from folderless workspace kind and fails closed by tool category", () => {
    const claudePolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "plan",
      workspaceKind: "folderless",
      hasScopeContract: true,
    })
    const codexPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      workspaceKind: "folderless",
      codexAdapterSource: "codex-app-server",
    })
    const qwenPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "qwen-code",
      mode: "agent",
      workspaceKind: "folderless",
    })
    const kunPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "kun",
      mode: "agent",
      workspaceKind: "folderless",
    })

    expect(claudePolicy).toMatchObject({
      runtimeId: "claude-code",
      mode: "plan",
      controlLevel: "assistant",
      guarded: false,
      planWorkspaceSideEffects: "deny",
      requiresPreExecutionEnforcement: true,
      enforcement: "locus-assistant-tool-policy",
      runtimeMapping: {
        runtime: "claude-code",
        sdkPermissionMode: "plan",
        allowDangerouslySkipPermissions: false,
        requiresToolPolicy: true,
        sdkDisallowedTools: getClaudeAssistantSdkDisallowedTools(),
      },
    })
    expect(claudePolicy.blockedSideEffects).toEqual([
      "workspace-file-read",
      "workspace-file-write",
      "side-effecting-shell",
      "terminal-execution",
      "project-mcp-tool",
      "mcp-configuration",
      "runtime-configuration",
      "provider-configuration",
      "unknown-tool",
    ])

    expect(getCodexAppServerPermissionMapping(codexPolicy)).toMatchObject({
      runtime: "codex",
      adapterSource: "codex-app-server",
      controlLevel: "assistant",
      appServerApprovalPolicy: "untrusted",
      requiresApprovalGate: true,
      approvalHook: {
        required: true,
        missing: "fail-closed",
        delayed: "fail-closed",
      },
      permissionHandlerFailure: "fail-closed",
    })
    expect(qwenPolicy).toMatchObject({
      runtimeId: "qwen-code",
      controlLevel: "assistant",
      enforcement: "qwen-acp-client-assistant-permission-gate",
      requiresPreExecutionEnforcement: true,
    })
    expect(getQwenAcpClientPermissionMapping(qwenPolicy)).toMatchObject({
      runtime: "qwen-code",
      adapterSource: "qwen-acp-client",
      controlLevel: "assistant",
      permissionHandlerFailure: "fail-closed",
    })
    expect(kunPolicy).toMatchObject({
      runtimeId: "kun",
      controlLevel: "assistant",
      enforcement: "kun-http-sse-assistant-approval-gate",
      requiresPreExecutionEnforcement: true,
    })
    expect(getKunHttpSsePermissionMapping(kunPolicy)).toMatchObject({
      runtime: "kun",
      adapterSource: "kun-http-sse",
      controlLevel: "assistant",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      commandExecution: "sandbox-blocked",
      permissionHandlerFailure: "fail-closed",
    })

    expect(decideAssistantToolPermission({ toolName: "WebSearch" })).toEqual({
      decision: "allow",
      category: "web-information",
    })
    expect(decideAssistantToolPermission({ toolName: "web_fetch" })).toEqual({
      decision: "allow",
      category: "web-information",
    })
    expect(decideAssistantToolPermission({ toolName: "Read" })).toMatchObject({
      decision: "deny",
      category: "filesystem",
      message: expect.stringContaining("filesystem tools are unavailable"),
    })
    expect(getClaudeAssistantSdkDisallowedTools()).toEqual(
      expect.arrayContaining([
        "Read",
        "Grep",
        "Glob",
        "LS",
        "Bash",
        "Write",
        "Edit",
        "MultiEdit",
        "NotebookRead",
        "NotebookEdit",
        "Task",
        "TodoRead",
        "TodoWrite",
        "ExitPlanMode",
      ]),
    )
    expect(getClaudeAssistantSdkDisallowedTools()).not.toContain("WebSearch")
    expect(getClaudeAssistantSdkDisallowedTools()).not.toContain("WebFetch")
    for (const toolName of getClaudeAssistantSdkDisallowedTools()) {
      expect(decideAssistantToolPermission({ toolName })).toMatchObject({
        decision: "deny",
      })
    }
    expect(
      decideAssistantToolPermission({ toolName: "unknownFutureTool" }),
    ).toMatchObject({
      decision: "deny",
      category: "unknown",
      message: expect.stringContaining("only web search and web fetch"),
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

    expect(DESKTOP_RUNTIME_CONTROL_LEVELS).toContain("assistant")
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
    expect(codexPolicy.enforcement).toBe(
      "codex-app-server-agent-approval-gate",
    )
    expect(codexPolicy.requiresPreExecutionEnforcement).toBe(true)
    expect(codexPolicy.observedToolPolicy).toMatchObject({
      enabled: true,
      blocksCatastrophicActions: true,
      degradation: "fail-closed-when-hook-unavailable",
    })
    expect(getCodexAppServerPermissionMapping(codexPolicy)).toMatchObject({
      runtime: "codex",
      adapterSource: "codex-app-server",
      requiresApprovalGate: true,
      permissionHandlerFailure: "fail-closed",
    })
  })

  test("maps Codex app-server observed mode to fail-closed approval gate", () => {
    const policy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      codexAdapterSource: "codex-app-server",
    })

    expect(policy.controlLevel).toBe("observe")
    expect(policy.enforcement).toBe("codex-app-server-agent-approval-gate")
    expect(policy.requiresPreExecutionEnforcement).toBe(true)
    expect(policy.observedToolPolicy).toMatchObject({
      enabled: true,
      blocksCatastrophicActions: true,
      degradation: "fail-closed-when-hook-unavailable",
    })
    expect(getCodexAppServerPermissionMapping(policy)).toMatchObject({
      runtime: "codex",
      adapterSource: "codex-app-server",
      controlLevel: "observe",
      appServerApprovalPolicy: "on-request",
      requiresApprovalGate: true,
      approvalHook: {
        required: true,
        missing: "fail-closed",
        delayed: "fail-closed",
      },
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
    const codexAppServerAdapter = readFileSync(
      "src/main/lib/codex/app-server-adapter.ts",
      "utf8",
    )

    expect(claude).toContain("prepareClaudeAgentSdkDesktopRunControls")
    expect(claude).not.toContain("resolveDesktopPermissionPolicy")
    expect(claudeControls).toContain("resolveDesktopPermissionPolicy")
    expect(claudeControls).toContain("workspaceKind: preflight.kind")
    expect(claude).not.toContain("getClaudePermissionMapping")
    expect(claude).not.toContain("permissionHandler: {")
    expect(claude).not.toContain("createClaudeAgentSdkToolPermissionHandler")
    expect(claude).not.toContain("createClaudeAgentSdkPermissionControls")
    expect(claudeRuntimeQuery).toContain("getClaudePermissionMapping")
    expect(claudeQueryOptions).toContain(
      "createClaudeAgentSdkDesktopRuntimeQueryOptions",
    )
    expect(claudeQueryOptions).toContain("permissionHandler: {")
    expect(claudeQueryOptions).toContain(
      "createClaudeAgentSdkPermissionControls",
    )
    expect(claudeQueryOptions).toContain("PreToolUse")
    expect(claudeToolPermission).toContain(
      "permissionPolicy.planWorkspaceSideEffects",
    )
    expect(claude).not.toContain(
      'Only ".md" files can be modified in plan mode.',
    )

    expect(codex).toContain("resolveDesktopPermissionPolicy")
    expect(codex).toContain("workspaceKind: verifiedRunContext.kind")
    expect(codex).toContain('codexAdapterSource: "codex-app-server"')
    expect(codex).toContain("createCodexAppServerAdapter")
    expect(codex).not.toContain(
      ["createCodex", "TemporaryCompatAdapter"].join("Acp"),
    )
    expect(codex).not.toContain(["getCodex", "PermissionMapping"].join(""))
    expect(codexAppServerAdapter).toContain(
      "getCodexAppServerPermissionMapping",
    )
    expect(codexAppServerAdapter).not.toContain("adapterSource?: unknown")
    expect(codexAppServerAdapter).not.toContain("mapping as")
    expect(codex).not.toContain("function getCodexAcpModeId")
  })
})
