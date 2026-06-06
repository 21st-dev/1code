import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("agent guard runtime pipeline", () => {
  test("Claude transport, router, and stream chunks are wired for hard enforcement", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")
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
    expect(claude).toContain("validateAgentScopeContract(input.scopeContract")
    expect(claude).toContain("decideClaudeToolUse")
    expect(claude).toContain("toClaudePermissionResult(decision)")
    expect(claude).toContain("respondScopeExpansion")
    expect(claude).toContain("activeGuardedContracts")
    expect(claude).toContain("buildGuardedRunAudit")
    expect(input).toContain("AgentGuardedRunCard")
    expect(input).toContain("approveGuardedRunDraft")
    expect(input).toContain("ensureGuardedRunReady")
    expect(chunks).toContain('| { type: "guard-event"; event: AgentGuardEvent }')
    expect(chunks).toContain('| { type: "guard-audit"; audit: GuardedRunAudit }')
  })

  test("Claude desktop stream ownership is fenced by run identity", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")

    expect(claude).toContain("{ controller: AbortController; runId: string }")
    expect(claude).toContain("const activeRunId = input.runId ?? streamId")
    expect(claude).toContain(
      "activeSessions.get(input.subChatId)?.controller === abortController",
    )
    expect(claude).toContain("input.runId && session.runId !== input.runId")
  })

  test("Codex guarded and plan-mode runs install ACP permission enforcement", () => {
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const codexChatInputSchema = readFileSync(
      "src/main/lib/codex/chat-input-schema.ts",
      "utf8",
    )
    const codexPrompt = readFileSync("src/main/lib/codex/prompt.ts", "utf8")
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
    expect(codex).toContain("getCodexRunRequiredCapability")
    expect(codex).toContain("installCodexAcpPermissionHandler")
    expect(codex).toContain("createCodexAcpPermissionHandler")
    expect(codex).toContain("createCodexAskUserQuestionTools")
    expect(codex).toContain(
      "installCodexAskUserQuestionAcpResultNormalizer",
    )
    expect(codex).toContain("respondToolApproval")
    expect(codex).toContain("buildCodexRuntimeCapabilityErrorChunk")
    expect(codex).toContain("prepareCodexAcpPrompt")
    expect(codexPrompt).toContain("buildGuardedRunPromptBlock(guardedContract)")
    expect(codex).toContain('enforcementMode: "hard"')
    expect(codex).not.toContain('enforcementMode: "contract-and-audit"')
    expect(codex).toContain("buildGuardedRunAudit")
    expect(runtimeEventState).toContain('chunk.type === "ask-user-question"')
    expect(runtimeEventState).toContain('chunk.type === "ask-user-question-timeout"')
    expect(runtimeEventState).toContain('chunk.type === "ask-user-question-result"')
    expect(codex).toContain("getCodexErrorDiagnostics(error)")
    expect(codex).not.toContain('console.error("[codex] chat stream error:", error)')
  })

  test("Codex desktop route is wired to normalized runtime status before provider work", () => {
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const acp = readFileSync(
      "src/renderer/features/agents/lib/acp-chat-transport.ts",
      "utf8",
    )

    expect(codex).toContain("buildCodexRuntimeAvailability")
    expect(codex).toContain("buildCodexRuntimeAvailabilityFromComponents")
    expect(codex).toContain("buildCodexRuntimeStatusChunk")
    expect(codex).toContain("buildCodexCapabilityErrorChunk")
    expect(codex).toContain('getRegisteredAgentRuntimeManifest("codex")')
    expect(codex).toContain("const runtimeStatus = await getCodexRuntimeStatus()")
    expect(codex).toContain("const integration = await getCodexIntegrationStatus()")
    expect(codex).toContain('id: "login"')
    expect(codex).toContain('id: "adapter-source"')
    expect(codex).toContain("CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA")
    expect(codex).toContain("adapter: adapterMetadata")
    expect(codex).toContain("runtimeStatus.blockers[0]")
    expect(codex).toContain('id: "provider-profile"')
    expect(codex).toContain('id: "mcp"')
    expect(codex).toContain('id: "local-only"')
    expect(acp).toContain('chunk.type === "runtime-status"')
  })

  test("Codex rollback and fork controls fail closed instead of using Claude session semantics", () => {
    const chats = readFileSync("src/main/lib/trpc/routers/chats.ts", "utf8")
    const activeChat = readFileSync(
      "src/renderer/features/agents/main/active-chat.tsx",
      "utf8",
    )

    expect(chats).toContain("hasCodexBackedMessages(messagesToFork)")
    expect(chats).toContain("hasCodexBackedMessages(messages)")
    expect(chats).toContain("getCodexRollbackUnsupportedMessage()")
    expect(chats).toContain('capabilityId: "rollback"')
    expect(activeChat).toContain(
      'const canRollbackOrFork = isRuntimeCapabilitySupported(provider, "rollback")',
    )
    expect(activeChat).toContain(
      "onRollback={canRollbackOrFork ? handleRollback : undefined}",
    )
    expect(activeChat).toContain(
      "onFork={canRollbackOrFork ? handleForkFromMessage : undefined}",
    )
  })
})
