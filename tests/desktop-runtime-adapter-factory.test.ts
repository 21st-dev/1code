import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  DesktopRuntimeAdapterFactory,
  type DesktopRuntimeAdapter,
} from "../src/main/lib/agent-runtime/desktop-runner"
import {
  CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA,
  CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA,
} from "../src/main/lib/agent-runtime/desktop-adapter-metadata"

function fakeAdapter(
  runtimeId: "claude-code" | "codex",
  source: "claude-agent-sdk" | "codex-acp-temporary-compat",
): DesktopRuntimeAdapter {
  return {
    metadata: {
      runtimeId,
      source,
      label: `${runtimeId} ${source}`,
      temporaryFallback: source === "codex-acp-temporary-compat",
    },
    async run() {
      return { status: "succeeded", sessionId: "session-1" }
    },
  }
}

describe("desktop runtime adapter factory", () => {
  test("declares current desktop adapter sources honestly", () => {
    expect(CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA).toMatchObject({
      runtimeId: "claude-code",
      source: "claude-agent-sdk",
      temporaryFallback: false,
    })
    expect(CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA).toMatchObject({
      runtimeId: "codex",
      source: "codex-acp-temporary-compat",
      temporaryFallback: true,
    })
    expect(
      CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA.fallbackReason,
    ).toContain("app-server")
  })

  test("registers and resolves adapters by runtime and source", () => {
    const claude = fakeAdapter("claude-code", "claude-agent-sdk")
    const codex = fakeAdapter("codex", "codex-acp-temporary-compat")
    const factory = new DesktopRuntimeAdapterFactory([claude, codex])

    expect(factory.get({ runtimeId: "claude-code" })).toBe(claude)
    expect(
      factory.get({ runtimeId: "codex", source: "codex-acp-temporary-compat" }),
    ).toBe(codex)
    expect(factory.listMetadata()).toEqual([
      claude.metadata,
      codex.metadata,
    ])
  })

  test("rejects duplicate and unsupported adapter lookups", () => {
    const claude = fakeAdapter("claude-code", "claude-agent-sdk")

    expect(
      () => new DesktopRuntimeAdapterFactory([claude, claude]),
    ).toThrow("Duplicate desktop runtime adapter")

    const factory = new DesktopRuntimeAdapterFactory([claude])
    expect(() => factory.get({ runtimeId: "codex" })).toThrow(
      "Desktop runtime adapter not registered",
    )
    expect(() => factory.get({ runtimeId: "unknown" as any })).toThrow(
      "Unsupported desktop runtime adapter",
    )
  })

  test("keeps temporary Codex ACP provider ownership out of the router", () => {
    const codexRouter = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )
    const codexAcpAdapter = readFileSync(
      "src/main/lib/codex/acp-adapter.ts",
      "utf8",
    )
    const codexAcpTemporaryCompatAdapter = readFileSync(
      "src/main/lib/codex/acp-temporary-compat-adapter.ts",
      "utf8",
    )
    const codexAcpPath = readFileSync(
      "src/main/lib/codex/acp-path.ts",
      "utf8",
    )
    const codexAcpSpawnProbe = readFileSync(
      "src/main/lib/codex/acp-spawn-probe.ts",
      "utf8",
    )
    const codexLoginOutput = readFileSync(
      "src/main/lib/codex/login-output.ts",
      "utf8",
    )
    const codexLoginSession = readFileSync(
      "src/main/lib/codex/login-session.ts",
      "utf8",
    )
    const codexCliRunner = readFileSync(
      "src/main/lib/codex/cli-runner.ts",
      "utf8",
    )
    const codexIntegrationStatus = readFileSync(
      "src/main/lib/codex/integration-status.ts",
      "utf8",
    )
    const codexIntegrationState = readFileSync(
      "src/main/lib/codex/integration-state.ts",
      "utf8",
    )
    const codexRuntimeStatus = readFileSync(
      "src/main/lib/codex/runtime-status.ts",
      "utf8",
    )
    const codexAcpRuntime = readFileSync(
      "src/main/lib/codex/acp-runtime.ts",
      "utf8",
    )
    const codexAcpTextStream = readFileSync(
      "src/main/lib/codex/acp-text-stream.ts",
      "utf8",
    )
    const codexAcpUiStream = readFileSync(
      "src/main/lib/codex/acp-ui-stream.ts",
      "utf8",
    )
    const codexAcpMessagePersistence = readFileSync(
      "src/main/lib/codex/acp-message-persistence.ts",
      "utf8",
    )
    const codexErrors = readFileSync(
      "src/main/lib/codex/errors.ts",
      "utf8",
    )
    const codexUsageMetadata = readFileSync(
      "src/main/lib/codex/usage-metadata.ts",
      "utf8",
    )
    const codexPrompt = readFileSync("src/main/lib/codex/prompt.ts", "utf8")
    const codexModelSelection = readFileSync(
      "src/main/lib/codex/model-selection.ts",
      "utf8",
    )
    const codexChatHistory = readFileSync(
      "src/main/lib/codex/chat-history.ts",
      "utf8",
    )
    const codexDesktopRunRequest = readFileSync(
      "src/main/lib/codex/desktop-run-request.ts",
      "utf8",
    )

    expect(codexRouter).toContain("../../codex/acp-adapter")
    expect(codexRouter).toContain("../../codex/acp-temporary-compat-adapter")
    expect(codexRouter).toContain("../../codex/desktop-run-request")
    expect(codexRouter).toContain("../../codex/chat-history")
    expect(codexRouter).toContain("../../codex/cli-runner")
    expect(codexRouter).toContain("../../codex/errors")
    expect(codexRouter).toContain("../../codex/integration-status")
    expect(codexRouter).toContain("../../codex/login-output")
    expect(codexRouter).toContain("../../codex/login-session")
    expect(codexRouter).toContain("../../codex/model-selection")
    expect(codexRouter).toContain("../../codex/runtime-status")
    expect(codexRouter).toContain("const desktopRunRequest = createCodexDesktopRunRequest")
    expect(codexRouter).toContain("createCodexAcpTemporaryCompatAdapter")
    expect(codexRouter).toContain("await codexAdapter.run(desktopRunRequest)")
    expect(codexRouter).not.toContain("readLatestTokenCountInfo")
    expect(codexRouter).not.toContain("findSessionFileById")
    expect(codexRouter).not.toContain("createACPProvider")
    expect(codexRouter).not.toContain("providerSessions")
    expect(codexRouter).not.toContain("function getCodexPackageName")
    expect(codexRouter).not.toContain("function toUnpackedAsarPath")
    expect(codexRouter).not.toContain("function previewProcessOutput")
    expect(codexRouter).not.toContain("function stripAnsi")
    expect(codexRouter).not.toContain("async function probeCodexAcpSpawn")
    expect(codexRouter).not.toContain("function extractFirstNonLocalhostUrl")
    expect(codexRouter).not.toContain("function redactUrlForDisplay")
    expect(codexRouter).not.toContain("function appendLoginOutput")
    expect(codexRouter).not.toContain("type CodexLoginSessionState")
    expect(codexRouter).not.toContain("const loginSessions = new Map")
    expect(codexRouter).not.toContain("function toLoginSessionResponse")
    expect(codexRouter).not.toContain("function getActiveLoginSession")
    expect(codexRouter).not.toContain("getOrCreateCodexAcpProvider")
    expect(codexRouter).not.toContain("resolveCodexAcpBinaryPath")
    expect(codexRouter).not.toContain("getClaudeShellEnvironment")
    expect(codexRouter).not.toContain("async function runCodexCli")
    expect(codexRouter).not.toContain("async function runCodexCliChecked")
    expect(codexRouter).not.toContain("function normalizeCodexIntegrationState")
    expect(codexRouter).not.toContain("async function getCodexIntegrationStatus")
    expect(codexRouter).not.toContain("async function getCodexRuntimeStatus")
    expect(codexRouter).not.toContain("existingSessionId:")
    expect(codexRouter).not.toContain("preparePromptWithAppAgents")
    expect(codexRouter).not.toContain("prepareCodexAcpPrompt")
    expect(codexRouter).not.toContain("createCodexAcpPermissionHandler")
    expect(codexRouter).not.toContain("createCodexAcpRuntimeModel")
    expect(codexRouter).not.toContain("streamText")
    expect(codexRouter).not.toContain("buildCodexAcpModelMessageContent")
    expect(codexRouter).not.toContain("toUIMessageStream")
    expect(codexRouter).not.toContain("emitCodexAcpUiStream")
    expect(codexRouter).not.toContain("createDesktopRunContextFromPreflight")
    expect(codexRouter).not.toContain("const desktopRunRequest: DesktopRunRequest")
    expect(codexRouter).not.toContain("pollCodexUsageMetadata")
    expect(codexRouter).not.toContain("usagePromise")
    expect(codexRouter).not.toContain("createCodexUsageMetadataResolver")
    expect(codexRouter).not.toContain("function parseStoredMessages")
    expect(codexRouter).not.toContain("function buildUserParts")
    expect(codexRouter).not.toContain("function extractCodexModelId")
    expect(codexRouter).not.toContain("function preprocessCodexModelName")
    expect(codexRouter).not.toContain("function getCodexErrorDiagnostics")
    expect(codexRouter).not.toContain("function isCodexAuthError")
    expect(codexRouter).not.toContain("const AUTH_HINTS")
    expect(codexRouter).not.toContain("pendingFinishChunk")
    expect(codexRouter).not.toContain("cleanCodexAssistantMessageForPersistence")
    expect(codexAcpAdapter).toContain("createACPProvider")
    expect(codexAcpAdapter).toContain("providerSessions")
    expect(codexAcpAdapter).toContain("runRequest: DesktopRunRequest")
    expect(codexAcpTemporaryCompatAdapter).toContain(
      "metadata: CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA",
    )
    expect(codexAcpTemporaryCompatAdapter).toContain(
      "async run(request: DesktopRunRequest)",
    )
    expect(codexAcpTemporaryCompatAdapter).toContain("getOrCreateCodexAcpProvider")
    expect(codexAcpTemporaryCompatAdapter).toContain("createCodexAcpRuntimeModel")
    expect(codexAcpTemporaryCompatAdapter).toContain("createCodexAcpUiMessageStream")
    expect(codexAcpTemporaryCompatAdapter).toContain("emitCodexAcpUiStream")
    expect(codexAcpTemporaryCompatAdapter).toContain("persistCodexAcpResponseMessage")
    expect(codexAcpTemporaryCompatAdapter).toContain("prepareCodexAcpPrompt")
    expect(codexAcpTemporaryCompatAdapter).toContain("getCodexPermissionMapping")
    expect(codexAcpPath).toContain("resolveCodexAcpBinaryPath")
    expect(codexAcpPath).toContain("getCodexAcpPackageName")
    expect(codexAcpSpawnProbe).toContain("probeCodexAcpSpawn")
    expect(codexAcpSpawnProbe).toContain("stripCodexAnsi")
    expect(codexLoginOutput).toContain("redactCodexLoginOutput")
    expect(codexLoginOutput).toContain("appendCodexLoginOutput")
    expect(codexLoginSession).toContain("createCodexLoginSession")
    expect(codexLoginSession).toContain("cancelCodexLoginSession")
    expect(codexLoginSession).toContain("getActiveCodexLoginSession")
    expect(codexCliRunner).toContain("runCodexCli")
    expect(codexCliRunner).toContain("runCodexCliChecked")
    expect(codexIntegrationState).toContain("normalizeCodexIntegrationState")
    expect(codexIntegrationState).toContain("isCodexIntegrationConnected")
    expect(codexIntegrationStatus).toContain("./integration-state")
    expect(codexIntegrationStatus).toContain("getCodexIntegrationStatus")
    expect(codexRuntimeStatus).toContain("buildCodexRuntimeAvailability")
    expect(codexRuntimeStatus).toContain("./acp-spawn-probe")
    expect(codexRuntimeStatus).toContain("getRegisteredAgentRuntimeManifest")
    expect(codexRuntimeStatus).toContain(
      "CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA",
    )
    expect(codexAcpRuntime).toContain("createCodexAcpRuntimeModel")
    expect(codexAcpRuntime).toContain("installCodexAcpPermissionHandler")
    expect(codexAcpTextStream).toContain("createCodexAcpUiMessageStream")
    expect(codexAcpTextStream).toContain("streamText")
    expect(codexAcpTextStream).toContain("toUIMessageStream")
    expect(codexAcpUiStream).toContain("emitCodexAcpUiStream")
    expect(codexAcpMessagePersistence).toContain("persistCodexAcpResponseMessage")
    expect(codexAcpMessagePersistence).toContain("buildGuardedRunAudit")
    expect(codexErrors).toContain("extractCodexError")
    expect(codexErrors).toContain("getCodexErrorDiagnostics")
    expect(codexErrors).toContain("isCodexAuthError")
    expect(codexUsageMetadata).toContain("createCodexUsageMetadataResolver")
    expect(codexUsageMetadata).toContain("pollCodexUsageMetadata")
    expect(codexUsageMetadata).toContain("readLatestTokenCountInfo")
    expect(codexPrompt).toContain("prepareCodexAcpPrompt")
    expect(codexPrompt).toContain("preparePromptWithAppAgents")
    expect(codexModelSelection).toContain("resolveCodexSelectedModelId")
    expect(codexModelSelection).toContain("DEFAULT_CODEX_MODEL")
    expect(codexChatHistory).toContain("parseCodexStoredMessages")
    expect(codexChatHistory).toContain("buildCodexUserParts")
    expect(codexDesktopRunRequest).toContain("createCodexDesktopRunRequest")
    expect(codexDesktopRunRequest).toContain("createDesktopRunContextFromPreflight")
  })

  test("keeps Claude desktop run request ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeDesktopRunRequest = readFileSync(
      "src/main/lib/claude/desktop-run-request.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/desktop-run-request")
    expect(claudeRouter).toContain(
      "const desktopRunRequest = createClaudeDesktopRunRequest({",
    )
    expect(claudeRouter).not.toContain("createDesktopRunContextFromPreflight")
    expect(claudeRouter).not.toContain(
      "const desktopRunRequest: DesktopRunRequest",
    )
    expect(claudeDesktopRunRequest).toContain(
      "createClaudeDesktopRunRequest",
    )
    expect(claudeDesktopRunRequest).toContain(
      "createDesktopRunContextFromPreflight",
    )
    expect(claudeDesktopRunRequest).toContain('status: "skipped"')
  })

  test("keeps Claude Agent SDK query option ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeQueryOptions = readFileSync(
      "src/main/lib/claude/agent-sdk-query-options.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-query-options")
    expect(claudeRouter).toContain(
      "const queryOptions = createClaudeAgentSdkQueryOptions({",
    )
    expect(claudeRouter).not.toContain("cwd: desktopRunRequest.context.cwd")
    expect(claudeRouter).not.toContain("includePartialMessages: true")
    expect(claudeQueryOptions).toContain("cwd: request.context.cwd")
    expect(claudeQueryOptions).toContain(
      "permissionMode: permission.sdkPermissionMode",
    )
    expect(claudeQueryOptions).toContain("includePartialMessages: true")
    expect(claudeQueryOptions).toContain("createAbortControllerFromSignal")
  })

  test("keeps Claude prompt mention parsing ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeMentions = readFileSync(
      "src/main/lib/claude/mentions.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/mentions")
    expect(claudeRouter).toContain("parseClaudePromptMentions(input.prompt)")
    expect(claudeRouter).not.toContain("function parseMentions")
    expect(claudeRouter).not.toContain(
      "const mentionRegex = /@\\[(file|folder|skill|agent|tool):",
    )
    expect(claudeMentions).toContain("parseClaudePromptMentions")
    expect(claudeMentions).toContain(
      "const mentionRegex = /@\\[(file|folder|skill|agent|tool):",
    )
  })

  test("keeps Claude Agent SDK query loader ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeQueryLoader = readFileSync(
      "src/main/lib/claude/agent-sdk-query-loader.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-query-loader")
    expect(claudeRouter).toContain("getClaudeAgentSdkQuery()")
    expect(claudeRouter).toContain("clearClaudeAgentSdkQueryCache()")
    expect(claudeRouter).not.toContain("let cachedClaudeQuery")
    expect(claudeRouter).not.toContain(
      'await import("@anthropic-ai/claude-agent-sdk")',
    )
    expect(claudeQueryLoader).toContain("let cachedClaudeQuery")
    expect(claudeQueryLoader).toContain(
      'await import("@anthropic-ai/claude-agent-sdk")',
    )
  })

  test("keeps Claude Ollama stream diagnostics ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const ollamaDiagnostics = readFileSync(
      "src/main/lib/claude/agent-sdk-ollama-diagnostics.ts",
      "utf8",
    )

    expect(claudeRouter).toContain(
      "../../claude/agent-sdk-ollama-diagnostics",
    )
    expect(claudeRouter).toContain("logClaudeOllamaStreamStart")
    expect(claudeRouter).toContain("logClaudeOllamaStreamError")
    expect(claudeRouter).not.toContain(
      "[Ollama] ===== STARTING STREAM ITERATION =====",
    )
    expect(claudeRouter).not.toContain("[Ollama] ===== DIAGNOSIS =====")
    expect(ollamaDiagnostics).toContain(
      "logClaudeOllamaEmptyStreamDiagnosis",
    )
    expect(ollamaDiagnostics).toContain(
      "[Ollama] ===== STARTING STREAM ITERATION =====",
    )
  })

  test("keeps Claude chat history attachment ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeChatHistory = readFileSync(
      "src/main/lib/claude/chat-history.ts",
      "utf8",
    )
    const claudeChatInputSchema = readFileSync(
      "src/main/lib/claude/chat-input-schema.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/chat-history")
    expect(claudeRouter).toContain("../../claude/chat-input-schema")
    expect(claudeRouter).toContain("buildClaudeUserParts(")
    expect(claudeRouter).not.toContain(
      "function buildLongTextAttachmentParts",
    )
    expect(claudeRouter).not.toContain(
      "function chatImageAttachmentSignatureFromParts",
    )
    expect(claudeRouter).not.toContain("const imageAttachmentSchema = z.object")
    expect(claudeChatHistory).toContain("buildClaudeUserParts")
    expect(claudeChatHistory).toContain("buildClaudeChatImageAttachmentParts")
    expect(claudeChatHistory).toContain(
      "claudeLongTextAttachmentSignatureFromParts",
    )
    expect(claudeChatInputSchema).toContain("imageAttachmentSchema")
    expect(claudeChatInputSchema).toContain("longTextAttachmentSchema")
  })

  test("keeps Claude Agent SDK chunk processing ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const chunkProcessor = readFileSync(
      "src/main/lib/claude/agent-sdk-chunk-processor.ts",
      "utf8",
    )

    expect(claudeRouter).toContain(
      "../../claude/agent-sdk-chunk-processor",
    )
    expect(claudeRouter).toContain("processClaudeAgentSdkUiChunk")
    expect(claudeRouter).toContain("flushClaudeAgentSdkTextAccumulator")
    expect(claudeRouter).not.toContain('case "tool-input-available"')
    expect(claudeRouter).not.toContain('case "tool-output-available"')
    expect(claudeRouter).not.toContain("toolPart.result = chunk.output")
    expect(claudeRouter).not.toContain("currentText.trim()")
    expect(chunkProcessor).toContain("processClaudeAgentSdkUiChunk")
    expect(chunkProcessor).toContain("flushClaudeAgentSdkTextAccumulator")
    expect(chunkProcessor).toContain('case "tool-input-available"')
    expect(chunkProcessor).toContain('case "tool-output-available"')
  })

  test("keeps Claude Agent SDK message metadata ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const messageMetadata = readFileSync(
      "src/main/lib/claude/agent-sdk-message-metadata.ts",
      "utf8",
    )

    expect(claudeRouter).toContain(
      "../../claude/agent-sdk-message-metadata",
    )
    expect(claudeRouter).toContain("trackClaudeAgentSdkMessageMetadata")
    expect(claudeRouter).not.toContain("metadata.sessionId = msgAny.session_id")
    expect(claudeRouter).not.toContain('msgAny.type === "system"')
    expect(claudeRouter).not.toContain(
      "metadata.sdkMessageUuid = lastAssistantUuid",
    )
    expect(messageMetadata).toContain("trackClaudeAgentSdkMessageMetadata")
    expect(messageMetadata).toContain('msgAny.type === "system"')
    expect(messageMetadata).toContain("sdkMessageUuid: lastAssistantUuid")
  })

  test("keeps Claude Agent SDK tool permission ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeToolPermission = readFileSync(
      "src/main/lib/claude/agent-sdk-tool-permission.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-tool-permission")
    expect(claudeRouter).toContain(
      "canUseTool: createClaudeAgentSdkToolPermissionHandler({",
    )
    expect(claudeRouter).not.toContain("PLAN_MODE_BLOCKED_TOOLS")
    expect(claudeRouter).not.toContain("toClaudePermissionResult(decision)")
    expect(claudeToolPermission).toContain("PLAN_MODE_BLOCKED_TOOLS")
    expect(claudeToolPermission).toContain("fixOllamaToolInputAliases")
    expect(claudeToolPermission).toContain("toClaudePermissionResult(decision)")
    expect(claudeToolPermission).toContain('type: "ask-user-question"')
  })

  test("keeps Claude tool approval state ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeToolApprovals = readFileSync(
      "src/main/lib/claude/tool-approvals.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/tool-approvals")
    expect(claudeRouter).toContain("getClaudePendingToolApprovalStore()")
    expect(claudeRouter).toContain("resolveClaudePendingToolApproval")
    expect(claudeRouter).not.toContain("const pendingToolApprovals")
    expect(claudeRouter).not.toContain("pendingToolApprovals.delete")
    expect(claudeToolApprovals).toContain("const pendingToolApprovals")
    expect(claudeToolApprovals).toContain("resolveClaudePendingToolApproval")
    expect(claudeToolApprovals).toContain("clearClaudePendingToolApprovals")
  })

  test("keeps Claude Agent SDK error classification ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeErrors = readFileSync(
      "src/main/lib/claude/agent-sdk-errors.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-errors")
    expect(claudeRouter).toContain(
      "extractClaudeAgentSdkEmbeddedErrorText",
    )
    expect(claudeRouter).toContain("classifyClaudeAgentSdkEmbeddedError")
    expect(claudeRouter).toContain("classifyClaudeAgentSdkStreamError")
    expect(claudeRouter).not.toContain(
      "const messageText = msgAny.message?.content?.[0]?.text",
    )
    expect(claudeRouter).not.toContain(
      'rawErrorCode === "authentication_failed"',
    )
    expect(claudeRouter).not.toContain('err.message?.includes("ENOENT")')
    expect(claudeRouter).not.toContain(
      "No conversation found with session ID",
    )
    expect(claudeErrors).toContain("extractClaudeAgentSdkEmbeddedErrorText")
    expect(claudeErrors).toContain("classifyClaudeAgentSdkEmbeddedError")
    expect(claudeErrors).toContain("classifyClaudeAgentSdkStreamError")
    expect(claudeErrors).toContain("USAGE_POLICY_VIOLATION")
    expect(claudeErrors).toContain("No conversation found with session ID")
  })

  test("keeps Claude Agent SDK error logging ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeErrorLogging = readFileSync(
      "src/main/lib/claude/agent-sdk-error-logging.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-error-logging")
    expect(claudeRouter).toContain("logClaudeAgentSdkEmbeddedError")
    expect(claudeRouter).toContain("logClaudeAgentSdkErrorDetails")
    expect(claudeRouter).not.toContain(
      "[CLAUDE SDK ERROR] ========================================",
    )
    expect(claudeRouter).not.toContain("[SD] SDK Error details:")
    expect(claudeErrorLogging).toContain("logClaudeAgentSdkEmbeddedError")
    expect(claudeErrorLogging).toContain(
      "[CLAUDE SDK ERROR] ========================================",
    )
    expect(claudeErrorLogging).toContain("[SD] SDK Error details:")
  })
})
