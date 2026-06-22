import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"

// The chats router is split across `chats*.ts` modules; read them together so
// source guards verify the implementation regardless of internal file layout.
function readChatsRouterSource(): string {
  const dir = "src/main/lib/trpc/routers"
  return readdirSync(dir)
    .filter((file) => /^chats.*\.ts$/.test(file))
    .map((file) => readFileSync(`${dir}/${file}`, "utf8"))
    .join("\n")
}

describe("agent guard runtime pipeline", () => {
  test("Claude transport, router, and stream chunks are wired for hard enforcement", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")
    const agentRuntimeRouter = readFileSync(
      "src/main/lib/trpc/routers/agent-runtime.ts",
      "utf8",
    )
    const claudeControls = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-controls.ts",
      "utf8",
    )
    const ipc = readFileSync(
      "src/renderer/features/agents/lib/ipc-chat-transport.ts",
      "utf8",
    )
    const runtimeEventState = readFileSync(
      "src/renderer/features/agents/lib/runtime-event-state.ts",
      "utf8",
    )
    const atoms = readFileSync(
      "src/renderer/features/agents/atoms/index.ts",
      "utf8",
    )
    const chunks = readFileSync("src/main/lib/claude/types.ts", "utf8")
    const claudeToolPermission = readFileSync(
      "src/main/lib/claude/agent-sdk-tool-permission.ts",
      "utf8",
    )
    const claudeQueryOptions = readFileSync(
      "src/main/lib/claude/agent-sdk-query-options.ts",
      "utf8",
    )
    const claudeGuardMetadata = readFileSync(
      "src/main/lib/claude/agent-sdk-guard-metadata.ts",
      "utf8",
    )
    const claudeRunFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-run-finalization.ts",
      "utf8",
    )
    const activeContracts = readFileSync(
      "src/main/lib/agent-guard/active-contracts.ts",
      "utf8",
    )
    const input = readFileSync(
      "src/renderer/features/agents/main/chat-input-area.tsx",
      "utf8",
    )

    expect(atoms).toContain("approvedGuardedRunContractsAtom")
    expect(atoms).toContain("pendingScopeExpansionRequestsAtom")
    expect(ipc).toContain("runId: crypto.randomUUID()")
    expect(ipc).toContain("scopeContract")
    expect(ipc).toContain("applyRuntimeEventStateChunk")
    expect(runtimeEventState).toContain('chunk.type === "guard-event"')
    expect(runtimeEventState).toContain('chunk.type === "guard-audit"')
    expect(claude).toContain(
      "scopeContract: agentScopeContractInputSchema.optional()",
    )
    expect(claude).toContain("prepareClaudeAgentSdkDesktopRunControls")
    expect(claude).not.toContain("prepareActiveGuardedRunContract")
    expect(claudeControls).toContain("prepareActiveGuardedRunContract")
    expect(claude).not.toContain("validateAgentScopeContract(input.scopeContract")
    expect(claude).not.toContain("setActiveGuardedContract(guardedContract)")
    expect(claude).not.toContain("captureGuardedGitStatus(runtimeCwd)")
    expect(activeContracts).toContain("validateAgentScopeContract(scopeContract")
    expect(activeContracts).toContain("setActiveGuardedContract(contract)")
    expect(activeContracts).toContain("captureGuardedGitStatus")
    expect(claude).not.toContain("permissionHandler: {")
    expect(claudeQueryOptions).toContain("permissionHandler: {")
    expect(claude).not.toContain("createClaudeAgentSdkToolPermissionHandler")
    expect(claude).not.toContain("createClaudeAgentSdkPermissionControls")
    expect(claudeQueryOptions).toContain(
      "createClaudeAgentSdkPermissionControls",
    )
    expect(claudeQueryOptions).toContain("PreToolUse")
    expect(claudeToolPermission).toContain("decideClaudeToolUse")
    expect(claudeToolPermission).toContain("toClaudePermissionResult(decision)")
    expect(agentRuntimeRouter).toContain("respondScopeExpansion")
    expect(agentRuntimeRouter).toContain("respondDesktopScopeExpansion")
    expect(claude).toContain("respondScopeExpansion")
    expect(claude).toContain("respondDesktopScopeExpansion")
    expect(claude).not.toContain("applyActiveGuardedScopeExpansion")
    expect(claude).not.toContain("const activeGuardedContracts")
    expect(claudeRunFinalization).toContain(
      "finalizeClaudeAgentSdkGuardMetadata",
    )
    expect(claude).not.toContain("buildGuardedRunAudit")
    expect(claudeGuardMetadata).toContain("buildGuardedRunAudit")
    expect(input).toContain("AgentGuardedRunCard")
    expect(input).toContain("approveGuardedRunDraft")
    expect(input).toContain("ensureGuardedRunReady")
    expect(input).toContain("trpc.agentRuntime.respondScopeExpansion.useMutation()")
    expect(input).not.toContain("trpc.claude.respondScopeExpansion")
    expect(chunks).toContain('| { type: "guard-event"; event: AgentGuardEvent }')
    expect(chunks).toContain('| { type: "guard-audit"; audit: GuardedRunAudit }')
  })

  test("Claude desktop stream ownership is fenced by run identity", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")
    const activeSessions = readFileSync(
      "src/main/lib/claude/active-sessions.ts",
      "utf8",
    )
    const runEnvelope = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-envelope.ts",
      "utf8",
    )
    const runSupervision = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-supervision.ts",
      "utf8",
    )
    const subscriptionCleanup = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-cleanup.ts",
      "utf8",
    )

    expect(activeSessions).toContain(
      "controller: AbortController",
    )
    expect(activeSessions).toContain("runId: string")
    expect(activeSessions).toContain("startActiveClaudeSessionForDesktopRun")
    expect(activeSessions).toContain(
      "const runId = input.requestedRunId ?? streamId",
    )
    expect(claude).not.toContain("startActiveClaudeSessionForDesktopRun")
    expect(claude).toContain("createClaudeAgentSdkDesktopRunEnvelope")
    expect(runEnvelope).toContain("startActiveClaudeSessionForDesktopRun")
    expect(claude).toContain("cancelClaudeAgentSdkActiveDesktopRun")
    expect(claude).toContain("cleanupClaudeAgentSdkDesktopRunSubscription")
    expect(claude).toContain("superviseClaudeAgentSdkDesktopRun")
    expect(claude).not.toContain("finalizeClaudeAgentSdkDesktopRunAfterLifecycle")
    expect(runSupervision).toContain(
      "finalizeClaudeAgentSdkDesktopRunAfterLifecycle",
    )
    expect(claude).not.toContain("const activeRunId = input.runId ?? streamId")
    expect(claude).not.toContain("setActiveClaudeSession(input.subChatId")
    expect(claude).not.toContain("getActiveClaudeSession")
    expect(claude).not.toContain("deleteActiveClaudeSession(input.subChatId")
    expect(claude).not.toContain(
      "deleteActiveClaudeSessionIfController(",
    )
    expect(subscriptionCleanup).toContain(
      "deleteActiveClaudeSessionIfController(",
    )
    expect(claude).not.toContain(
      "input.runId && session.runId !== input.runId",
    )
    expect(subscriptionCleanup).toContain(
      "input.runId && session.runId !== input.runId",
    )
    expect(claude).not.toContain("activeSessions.get")
    expect(claude).not.toContain("const activeSessions")
  })

  test("Codex guarded and plan-mode runs install app-server approval enforcement", () => {
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const codexAppServerAdapter = readFileSync(
      "src/main/lib/codex/app-server-adapter.ts",
      "utf8",
    )
    const codexChatInputSchema = readFileSync(
      "src/main/lib/codex/chat-input-schema.ts",
      "utf8",
    )
    const codexAppServerApproval = readFileSync(
      "src/main/lib/codex/app-server-approval.ts",
      "utf8",
    )
    const codexAppServerControlledEdit = readFileSync(
      "src/main/lib/codex/app-server-controlled-edit.ts",
      "utf8",
    )
    const codexErrors = readFileSync(
      "src/main/lib/codex/errors.ts",
      "utf8",
    )
    const acp = readFileSync(
      "src/renderer/features/agents/lib/acp-chat-transport.ts",
      "utf8",
    )
    const runtimeEventState = readFileSync(
      "src/renderer/features/agents/lib/runtime-event-state.ts",
      "utf8",
    )

    expect(acp).toContain("approvedGuardedRunContractsAtom")
    expect(acp).toContain("scopeContract")
    expect(acp).toContain("applyRuntimeEventStateChunk")
    expect(runtimeEventState).toContain('chunk.type === "guard-event"')
    expect(acp).toContain('chunk.type === "capability-error"')
    expect(codex).toContain("codexChatInputSchema")
    expect(codexChatInputSchema).toContain(
      "scopeContract: agentScopeContractInputSchema.optional()",
    )
    expect(codex).toContain('codexAdapterSource: "codex-app-server"')
    expect(codexAppServerAdapter).toContain(
      "getCodexAppServerPermissionMapping",
    )
    expect(codexAppServerAdapter).toContain(
      "createCodexAppServerApprovalBridge",
    )
    expect(codex).toContain("respondToolApproval")
    expect(codexAppServerAdapter).toContain("guardedContract")
    expect(codexAppServerApproval).toContain(
      "decideCodexAcpToolPermission",
    )
    expect(codexAppServerControlledEdit).toContain(
      "codexControlledEditDeveloperInstructions",
    )
    expect(codex).not.toContain('enforcementMode: "contract-and-audit"')
    expect(runtimeEventState).toContain('chunk.type === "ask-user-question"')
    expect(runtimeEventState).toContain('chunk.type === "ask-user-question-timeout"')
    expect(runtimeEventState).toContain('chunk.type === "ask-user-question-result"')
    expect(codex).toContain("getCodexErrorDiagnostics(error)")
    expect(codexErrors).toContain("getCodexErrorDiagnostics")
    expect(codexErrors).toContain("isCodexAuthError")
    expect(codex).not.toContain('console.error("[codex] chat stream error:", error)')
  })

  test("Codex desktop route is wired to normalized runtime status before provider work", () => {
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const codexRuntimeStatus = readFileSync(
      "src/main/lib/codex/runtime-status.ts",
      "utf8",
    )
    const acp = readFileSync(
      "src/renderer/features/agents/lib/acp-chat-transport.ts",
      "utf8",
    )

    expect(codexRuntimeStatus).toContain("buildCodexRuntimeAvailability")
    expect(codexRuntimeStatus).toContain(
      "buildCodexRuntimeAvailabilityFromComponents",
    )
    expect(codex).toContain("buildCodexRuntimeStatusChunk")
    expect(codex).toContain("buildCodexCapabilityErrorChunk")
    expect(codexRuntimeStatus).toContain(
      'getRegisteredAgentRuntimeManifest("codex")',
    )
    expect(codex).toContain("const runtimeStatus = await getCodexRuntimeStatus()")
    expect(codexRuntimeStatus).toContain(
      "const integration = await getCodexIntegrationStatus()",
    )
    expect(codexRuntimeStatus).toContain('id: "login"')
    expect(codexRuntimeStatus).toContain('id: "adapter-source"')
    expect(codexRuntimeStatus).toContain(
      "CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA",
    )
    expect(codexRuntimeStatus).not.toContain("TEMPORARY_COMPAT")
    expect(codexRuntimeStatus).toContain("adapter: adapterMetadata")
    expect(codex).toContain("runtimeStatus.blockers[0]")
    expect(codexRuntimeStatus).toContain('id: "provider-profile"')
    expect(codexRuntimeStatus).toContain('id: "mcp"')
    expect(codexRuntimeStatus).toContain('id: "local-only"')
    expect(acp).toContain('chunk.type === "runtime-status"')
  })

  test("Codex rollback and fork controls fail closed instead of using Claude session semantics", () => {
    const chats = readChatsRouterSource()
    const activeChat = readFileSync(
      "src/renderer/features/agents/main/active-chat.tsx",
      "utf8",
    )

    expect(chats).toContain("hasCodexBackedMessages(messagesToFork)")
    expect(chats).toContain("hasCodexBackedMessages(messages)")
    expect(chats).toContain("getCodexRollbackUnsupportedMessage()")
    expect(chats).toContain('capabilityId: "rollback"')
    expect(activeChat).toContain(
      "const canRollbackOrFork = useRuntimeCapabilitySupported(provider,",
    )
    expect(activeChat).toContain('"rollback"')
    expect(activeChat).toContain(
      "onRollback={canRollbackOrFork ? handleRollback : undefined}",
    )
    expect(activeChat).toContain(
      "onFork={canRollbackOrFork ? handleForkFromMessage : undefined}",
    )
  })
})
