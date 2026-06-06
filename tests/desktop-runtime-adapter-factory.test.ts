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

  test("keeps Claude Agent SDK adapter startup ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeAgentSdkAdapter = readFileSync(
      "src/main/lib/claude/agent-sdk-adapter.ts",
      "utf8",
    )
    const claudeAgentSdkAdapterRunner = readFileSync(
      "src/main/lib/claude/agent-sdk-adapter-runner.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-adapter")
    expect(claudeRouter).toContain("../../claude/agent-sdk-adapter-runner")
    expect(claudeRouter).toContain("createClaudeAgentSdkAdapter({")
    expect(claudeRouter).toContain("runClaudeAgentSdkAdapterWithPolicyRetry")
    expect(claudeRouter).not.toContain("await claudeAdapter.run(desktopRunRequest)")
    expect(claudeRouter).not.toContain("ClaudeAgentSdkLoadError")
    expect(claudeRouter).not.toContain("ClaudeAgentSdkQueryStartError")
    expect(claudeRouter).not.toContain("reason=sdk_load_error")
    expect(claudeRouter).not.toContain("reason=query_error")
    expect(claudeRouter).not.toContain("stream = claudeQuery(queryOptions)")
    expect(claudeAgentSdkAdapter).toContain(
      "metadata: CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA",
    )
    expect(claudeAgentSdkAdapter).toContain(
      "async run(request: DesktopRunRequest)",
    )
    expect(claudeAgentSdkAdapter).toContain("getClaudeAgentSdkQuery")
    expect(claudeAgentSdkAdapter).toContain("sdkQuery(queryOptions)")
    expect(claudeAgentSdkAdapter).toContain("consumeStream({ request, stream })")
    expect(claudeAgentSdkAdapterRunner).toContain(
      "runClaudeAgentSdkAdapterWithPolicyRetry",
    )
    expect(claudeAgentSdkAdapterRunner).toContain("ClaudeAgentSdkLoadError")
    expect(claudeAgentSdkAdapterRunner).toContain("ClaudeAgentSdkQueryStartError")
    expect(claudeAgentSdkAdapterRunner).toContain("adapter.run(request)")
  })

  test("keeps Claude provider runtime helpers out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudeProviderRuntimeConfig = readFileSync(
      "src/main/lib/claude/provider-runtime-config.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("normalizeClaudeProviderRuntimeConfig")
    expect(claudeRouter).not.toContain(
      "function normalizeRuntimeProviderConfig",
    )
    expect(claudeRouter).not.toContain("function redactClaudeEnvValueForLog")
    expect(claudeRouter).not.toContain("redactClaudeProviderEnvValueForLog")
    expect(claudeProviderRuntimeConfig).toContain(
      "normalizeClaudeProviderRuntimeConfig",
    )
    expect(claudeProviderRuntimeConfig).toContain(
      "redactClaudeProviderEnvValueForLog",
    )
  })

  test("keeps Claude Agent SDK runtime diagnostics ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const runtimeDiagnostics = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-diagnostics.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-runtime-diagnostics")
    expect(claudeRouter).toContain("logClaudeAgentSdkAuthDiagnostics")
    expect(claudeRouter).toContain("logClaudeAgentSdkSessionDiagnostics")
    expect(claudeRouter).toContain("logClaudeAgentSdkProviderDiagnostics")
    expect(claudeRouter).not.toContain("AUTH METHOD USED")
    expect(claudeRouter).not.toContain("Expected session path")
    expect(claudeRouter).not.toContain("Using offline mode - Model")
    expect(runtimeDiagnostics).toContain("logClaudeAgentSdkAuthDiagnostics")
    expect(runtimeDiagnostics).toContain("logClaudeAgentSdkSessionDiagnostics")
    expect(runtimeDiagnostics).toContain("logClaudeAgentSdkProviderDiagnostics")
    expect(runtimeDiagnostics).toContain("AUTH METHOD USED")
    expect(runtimeDiagnostics).toContain("Expected session path")
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
    expect(claudeRouter).not.toContain("getClaudeAgentSdkQuery()")
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

  test("keeps Claude Agent SDK stream lifecycle ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const streamLifecycle = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-lifecycle.ts",
      "utf8",
    )
    const streamMessage = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-message.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-stream-lifecycle")
    expect(claudeRouter).toContain("../../claude/agent-sdk-stream-message")
    expect(claudeRouter).toContain("startClaudeAgentSdkStreamIteration")
    expect(claudeRouter).not.toContain(
      "createClaudeAgentSdkStreamIterationState()",
    )
    expect(claudeRouter).toContain("recordClaudeAgentSdkIncomingMessage")
    expect(claudeRouter).not.toContain("recordClaudeAgentSdkStreamMessage")
    expect(claudeRouter).not.toContain("logRawClaudeMessage")
    expect(claudeRouter).toContain("completeClaudeAgentSdkStreamIteration")
    expect(claudeRouter).not.toContain("let firstMessageReceived")
    expect(claudeRouter).not.toContain("streamIterationStart")
    expect(claudeRouter).not.toContain("messageCount++")
    expect(claudeRouter).not.toContain("logClaudeOllamaFirstMessageLatency")
    expect(claudeRouter).not.toContain("logClaudeOllamaMessage")
    expect(claudeRouter).not.toContain("logClaudeOllamaStreamComplete")
    expect(claudeRouter).not.toContain("logClaudeOllamaEmptyStreamDiagnosis")
    expect(claudeRouter).not.toContain("logClaudeOllamaSingleMessageWarning")
    expect(claudeRouter).not.toContain("logClaudeOllamaStreamStart")
    expect(streamLifecycle).toContain("startClaudeAgentSdkStreamIteration")
    expect(streamLifecycle).toContain("createClaudeAgentSdkStreamIterationState")
    expect(streamLifecycle).toContain("recordClaudeAgentSdkStreamMessage")
    expect(streamLifecycle).toContain("completeClaudeAgentSdkStreamIteration")
    expect(streamLifecycle).toContain("logClaudeOllamaStreamStart")
    expect(streamLifecycle).toContain("logClaudeOllamaFirstMessageLatency")
    expect(streamLifecycle).toContain("logClaudeOllamaStreamComplete")
    expect(streamLifecycle).toContain("logClaudeOllamaEmptyStreamDiagnosis")
    expect(streamMessage).toContain("recordClaudeAgentSdkIncomingMessage")
    expect(streamMessage).toContain("recordClaudeAgentSdkStreamMessage")
    expect(streamMessage).toContain("logRawClaudeMessage")
  })

  test("keeps Claude Agent SDK stream stop control out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const streamControl = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-control.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-stream-control")
    expect(claudeRouter).toContain("shouldStopClaudeAgentSdkStreamForAbort")
    expect(claudeRouter).toContain(
      "shouldStopClaudeAgentSdkStreamForClosedObserver",
    )
    expect(claudeRouter).not.toContain("logClaudeOllamaStreamAborted")
    expect(claudeRouter).not.toContain("M:OBSERVER_CLOSED_STREAM")
    expect(streamControl).toContain("logClaudeOllamaStreamAborted")
    expect(streamControl).toContain("M:OBSERVER_CLOSED_STREAM")
  })

  test("keeps Claude guarded audit metadata ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const guardMetadata = readFileSync(
      "src/main/lib/claude/agent-sdk-guard-metadata.ts",
      "utf8",
    )
    const runFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-run-finalization.ts",
      "utf8",
    )
    const streamErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-guard-metadata")
    expect(claudeRouter).not.toContain("finalizeClaudeAgentSdkGuardMetadata({")
    expect(claudeRouter).not.toContain("const finalizeGuardMetadata")
    expect(claudeRouter).not.toContain("buildGuardedRunAudit")
    expect(runFinalization).toContain("finalizeClaudeAgentSdkGuardMetadata({")
    expect(streamErrorFinalization).toContain(
      "finalizeClaudeAgentSdkGuardMetadata({",
    )
    expect(guardMetadata).toContain("finalizeClaudeAgentSdkGuardMetadata")
    expect(guardMetadata).toContain("buildGuardedRunAudit")
    expect(guardMetadata).toContain("captureGuardedGitStatus")
    expect(guardMetadata).toContain('emit({ type: "guard-audit", audit })')
  })

  test("keeps Claude Agent SDK message persistence ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const messagePersistence = readFileSync(
      "src/main/lib/claude/agent-sdk-message-persistence.ts",
      "utf8",
    )
    const runFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-run-finalization.ts",
      "utf8",
    )
    const streamErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain(
      "../../claude/agent-sdk-message-persistence",
    )
    expect(claudeRouter).not.toContain("persistClaudeAgentSdkAssistantResponse")
    expect(claudeRouter).not.toContain("const assistantMessage =")
    expect(claudeRouter).not.toContain("const finalMessages =")
    expect(claudeRouter).not.toContain("messages: JSON.stringify(persistence.messages)")
    expect(claudeRouter).not.toContain("createRollbackStash")
    expect(claudeRouter).not.toContain(
      "historyEnabled && metadata.sdkMessageUuid && runtimeCwd",
    )
    expect(runFinalization).toContain("persistClaudeAgentSdkAssistantResponse")
    expect(streamErrorFinalization).toContain(
      "persistClaudeAgentSdkAssistantResponse",
    )
    expect(messagePersistence).toContain("persistClaudeAgentSdkAssistantResponse")
    expect(messagePersistence).toContain(
      "prepareClaudeAgentSdkAssistantPersistence",
    )
    expect(messagePersistence).toContain("shouldCreateClaudeAgentSdkRollbackStash")
    expect(messagePersistence).toContain('role: "assistant"')
    expect(messagePersistence).toContain("messages: [...messagesToSave")
  })

  test("keeps Claude Agent SDK run finalization ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const runFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-run-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-run-finalization")
    expect(claudeRouter).toContain("completeClaudeAgentSdkRunAfterAdapter")
    expect(claudeRouter).not.toContain("reason=no_response")
    expect(claudeRouter).not.toContain("[SD] M:SAVE")
    expect(claudeRouter).not.toContain("reason=ok")
    expect(claudeRouter).not.toContain("No response received from Claude")
    expect(runFinalization).toContain(
      "completeClaudeAgentSdkRunAfterAdapter",
    )
    expect(runFinalization).toContain("reason=no_response")
    expect(runFinalization).toContain("persistClaudeAgentSdkAssistantResponse")
    expect(runFinalization).toContain("finalizeClaudeAgentSdkGuardMetadata")
    expect(runFinalization).toContain("flushClaudeAgentSdkTextAccumulator")
  })

  test("keeps Claude Agent SDK stream error finalization ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const streamErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).toContain(
      "../../claude/agent-sdk-stream-error-finalization",
    )
    expect(claudeRouter).toContain("finalizeClaudeAgentSdkStreamError")
    expect(claudeRouter).not.toContain("classifyClaudeAgentSdkStreamError")
    expect(claudeRouter).not.toContain("reason=stream_error")
    expect(claudeRouter).not.toContain("M:CATCH_SAVE")
    expect(claudeRouter).not.toContain("Session not found")
    expect(streamErrorFinalization).toContain(
      "finalizeClaudeAgentSdkStreamError",
    )
    expect(streamErrorFinalization).toContain(
      "classifyClaudeAgentSdkStreamError",
    )
    expect(streamErrorFinalization).toContain("reason=stream_error")
    expect(streamErrorFinalization).toContain("M:CATCH_SAVE")
    expect(streamErrorFinalization).toContain("persistClaudeAgentSdkAssistantResponse")
  })

  test("keeps Claude Agent SDK policy retry ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const policyRetry = readFileSync(
      "src/main/lib/claude/agent-sdk-policy-retry.ts",
      "utf8",
    )
    const adapterRunner = readFileSync(
      "src/main/lib/claude/agent-sdk-adapter-runner.ts",
      "utf8",
    )
    const embeddedErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-embedded-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-policy-retry")
    expect(claudeRouter).toContain("createClaudeAgentSdkPolicyRetryState()")
    expect(claudeRouter).not.toContain("recordClaudeAgentSdkPolicyRetry")
    expect(claudeRouter).toContain("runClaudeAgentSdkAdapterWithPolicyRetry")
    expect(claudeRouter).toContain("finalizeClaudeAgentSdkEmbeddedError")
    expect(claudeRouter).not.toContain("waitForClaudeAgentSdkPolicyRetry")
    expect(claudeRouter).not.toContain("let policyRetryNeeded")
    expect(claudeRouter).not.toContain("let policyRetryCount")
    expect(claudeRouter).not.toContain("policyRetryCount++")
    expect(claudeRouter).not.toContain("getClaudePolicyRetryDelayMs")
    expect(claudeRouter).not.toContain("CLAUDE_MAX_POLICY_RETRIES")
    expect(policyRetry).toContain("CLAUDE_MAX_POLICY_RETRIES")
    expect(policyRetry).toContain("getClaudePolicyRetryDelayMs")
    expect(policyRetry).toContain("recordClaudeAgentSdkPolicyRetry")
    expect(policyRetry).toContain("waitForClaudeAgentSdkPolicyRetry")
    expect(adapterRunner).toContain("waitForClaudeAgentSdkPolicyRetry")
    expect(adapterRunner).toContain("resetClaudeAgentSdkPolicyRetryAttempt")
    expect(embeddedErrorFinalization).toContain(
      "recordClaudeAgentSdkPolicyRetry",
    )
  })

  test("keeps Claude renderer stream emission redaction in runtime owner", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const streamEventMapper = readFileSync(
      "src/main/lib/agent-runtime/stream-event-mapper.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("createRuntimeRendererChunkEmitter({")
    expect(claudeRouter).not.toContain("redactRendererDiagnosticChunk")
    expect(claudeRouter).not.toContain("observedChunk?.type === \"error\"")
    expect(claudeRouter).not.toContain("type !== \"finish\"")
    expect(streamEventMapper).toContain("createRuntimeRendererChunkEmitter")
    expect(streamEventMapper).toContain("redactRendererDiagnosticChunk")
    expect(streamEventMapper).toContain("isDesktopRuntimeFailureChunk")
    expect(streamEventMapper).toContain('chunkType !== "finish"')
  })

  test("keeps desktop chat job completion planning out of runtime routes", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const codexRouter = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )
    const desktopAgentJobs = readFileSync(
      "src/main/lib/desktop-agent-jobs.ts",
      "utf8",
    )

    for (const route of [claudeRouter, codexRouter]) {
      expect(route).toContain("resolveDesktopChatJobCompletion({")
      expect(route).not.toContain("desktop_chat_failed")
      expect(route).not.toContain("desktop_chat_canceled")
      expect(route).not.toContain('status === "succeeded" ? 0')
    }
    expect(desktopAgentJobs).toContain("resolveDesktopChatJobCompletion")
    expect(desktopAgentJobs).toContain("desktop_chat_failed")
    expect(desktopAgentJobs).toContain("desktop_chat_canceled")
  })

  test("keeps Claude Agent SDK prompt ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const claudePrompt = readFileSync(
      "src/main/lib/claude/agent-sdk-prompt.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-prompt")
    expect(claudeRouter).toContain("createClaudeAgentSdkPrompt({")
    expect(claudeRouter).not.toContain("async function* createPromptWithImages")
    expect(claudeRouter).not.toContain("media_type: img.mediaType")
    expect(claudePrompt).toContain("createClaudeAgentSdkPrompt")
    expect(claudePrompt).toContain("createClaudeAgentSdkImagePrompt")
    expect(claudePrompt).toContain("media_type: image.mediaType")
  })

  test("keeps Claude Agent SDK project context ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const projectContext = readFileSync(
      "src/main/lib/claude/agent-sdk-project-context.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-project-context")
    expect(claudeRouter).toContain("readClaudeAgentSdkProjectAgentsMd")
    expect(claudeRouter).toContain("createClaudeAgentSdkSystemPromptConfig")
    expect(claudeRouter).not.toContain('path.join(runtimeCwd, "AGENTS.md")')
    expect(claudeRouter).not.toContain("The following are the project's")
    expect(projectContext).toContain("readClaudeAgentSdkProjectAgentsMd")
    expect(projectContext).toContain("createClaudeAgentSdkSystemPromptConfig")
    expect(projectContext).toContain('path.join(cwd, "AGENTS.md")')
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
    const streamErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).toContain(
      "../../claude/agent-sdk-ollama-diagnostics",
    )
    expect(claudeRouter).not.toContain("logClaudeOllamaStreamStart")
    expect(claudeRouter).not.toContain("logClaudeOllamaStreamError")
    expect(claudeRouter).toContain("logClaudeOllamaSdkConfiguration")
    expect(claudeRouter).toContain("probeClaudeOllamaConnectivity")
    expect(claudeRouter).not.toContain("/api/tags")
    expect(claudeRouter).not.toContain("Ollama is responding")
    expect(claudeRouter).not.toContain("SDK Configuration:")
    expect(claudeRouter).not.toContain("Session settings:")
    expect(claudeRouter).not.toContain(
      "[Ollama] ===== STARTING STREAM ITERATION =====",
    )
    expect(claudeRouter).not.toContain("[Ollama] ===== DIAGNOSIS =====")
    expect(ollamaDiagnostics).toContain(
      "logClaudeOllamaEmptyStreamDiagnosis",
    )
    expect(streamErrorFinalization).toContain("logClaudeOllamaStreamError")
    expect(ollamaDiagnostics).toContain(
      "[Ollama] ===== STARTING STREAM ITERATION =====",
    )
    expect(ollamaDiagnostics).toContain("probeClaudeOllamaConnectivity")
    expect(ollamaDiagnostics).toContain("/api/tags")
    expect(ollamaDiagnostics).toContain("logClaudeOllamaSdkConfiguration")
    expect(ollamaDiagnostics).toContain("SDK Configuration:")
  })

  test("keeps Claude Ollama prompt ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const ollamaPrompt = readFileSync(
      "src/main/lib/claude/agent-sdk-ollama-prompt.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-ollama-prompt")
    expect(claudeRouter).toContain("createClaudeOllamaPrompt({")
    expect(claudeRouter).not.toContain("[CONVERSATION HISTORY]")
    expect(claudeRouter).not.toContain("toolSummaries")
    expect(ollamaPrompt).toContain("createClaudeOllamaPrompt")
    expect(ollamaPrompt).toContain("[CONVERSATION HISTORY]")
    expect(ollamaPrompt).toContain("createClaudeOllamaToolSummary")
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
    const fileChangeNotification = readFileSync(
      "src/main/lib/claude/agent-sdk-file-change-notification.ts",
      "utf8",
    )
    const transformedChunks = readFileSync(
      "src/main/lib/claude/agent-sdk-transformed-chunks.ts",
      "utf8",
    )
    const runFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-run-finalization.ts",
      "utf8",
    )
    const streamErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain(
      "../../claude/agent-sdk-chunk-processor",
    )
    expect(claudeRouter).not.toContain(
      "../../claude/agent-sdk-file-change-notification",
    )
    expect(claudeRouter).toContain("../../claude/agent-sdk-transformed-chunks")
    expect(claudeRouter).toContain("processClaudeAgentSdkTransformedChunks")
    expect(claudeRouter).not.toContain("processClaudeAgentSdkUiChunk")
    expect(claudeRouter).not.toContain("notifyClaudeAgentSdkFileChanged")
    expect(claudeRouter).not.toContain("chunkCount++")
    expect(claudeRouter).not.toContain("lastChunkType = chunk.type")
    expect(claudeRouter).not.toContain("flushClaudeAgentSdkTextAccumulator")
    expect(claudeRouter).not.toContain("BrowserWindow.getAllWindows")
    expect(claudeRouter).not.toContain('"file-changed"')
    expect(claudeRouter).not.toContain('case "tool-input-available"')
    expect(claudeRouter).not.toContain('case "tool-output-available"')
    expect(claudeRouter).not.toContain("toolPart.result = chunk.output")
    expect(claudeRouter).not.toContain("currentText.trim()")
    expect(runFinalization).toContain("flushClaudeAgentSdkTextAccumulator")
    expect(streamErrorFinalization).toContain(
      "flushClaudeAgentSdkTextAccumulator",
    )
    expect(chunkProcessor).toContain("processClaudeAgentSdkUiChunk")
    expect(chunkProcessor).toContain("flushClaudeAgentSdkTextAccumulator")
    expect(chunkProcessor).toContain('case "tool-input-available"')
    expect(chunkProcessor).toContain('case "tool-output-available"')
    expect(transformedChunks).toContain("processClaudeAgentSdkUiChunk")
    expect(transformedChunks).toContain("notifyClaudeAgentSdkFileChanged")
    expect(transformedChunks).toContain("chunkCount++")
    expect(transformedChunks).toContain("lastChunkType = chunk.type")
    expect(fileChangeNotification).toContain(
      "notifyClaudeAgentSdkFileChanged",
    )
    expect(fileChangeNotification).toContain("BrowserWindow.getAllWindows")
    expect(fileChangeNotification).toContain('"file-changed"')
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
    const streamErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-error-finalization.ts",
      "utf8",
    )
    const embeddedErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-embedded-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-errors")
    expect(claudeRouter).not.toContain(
      "extractClaudeAgentSdkEmbeddedErrorText",
    )
    expect(claudeRouter).not.toContain("classifyClaudeAgentSdkEmbeddedError")
    expect(claudeRouter).not.toContain("classifyClaudeAgentSdkStreamError")
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
    expect(streamErrorFinalization).toContain(
      "classifyClaudeAgentSdkStreamError",
    )
    expect(embeddedErrorFinalization).toContain(
      "extractClaudeAgentSdkEmbeddedErrorText",
    )
    expect(embeddedErrorFinalization).toContain(
      "classifyClaudeAgentSdkEmbeddedError",
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
    const embeddedErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-embedded-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-error-logging")
    expect(claudeRouter).not.toContain("logClaudeAgentSdkEmbeddedError")
    expect(claudeRouter).not.toContain("logClaudeAgentSdkErrorDetails")
    expect(claudeRouter).not.toContain(
      "[CLAUDE SDK ERROR] ========================================",
    )
    expect(claudeRouter).not.toContain("[SD] SDK Error details:")
    expect(embeddedErrorFinalization).toContain(
      "logClaudeAgentSdkEmbeddedError",
    )
    expect(embeddedErrorFinalization).toContain(
      "logClaudeAgentSdkErrorDetails",
    )
    expect(claudeErrorLogging).toContain("logClaudeAgentSdkEmbeddedError")
    expect(claudeErrorLogging).toContain(
      "[CLAUDE SDK ERROR] ========================================",
    )
    expect(claudeErrorLogging).toContain("[SD] SDK Error details:")
  })
})
