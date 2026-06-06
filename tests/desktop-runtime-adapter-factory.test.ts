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
    const claudeDesktopJob = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-job.ts",
      "utf8",
    )

    expect(claudeRouter).toContain(
      "createClaudeAgentSdkDesktopRunStartup({",
    )
    expect(claudeRouter).not.toContain("../../claude/desktop-run-request")
    expect(claudeRouter).not.toContain(
      "createClaudeDesktopRunRequestFromRuntimeStartup({",
    )
    expect(claudeRouter).not.toContain("createClaudeAgentSdkDesktopJob({")
    expect(claudeRouter).not.toContain("createClaudeDesktopProviderBinding")
    expect(claudeRouter).not.toContain("desktopRunRequest.session")
    expect(claudeRouter).not.toContain("authMode: selectedProviderProfileId")
    expect(claudeRouter).not.toContain("createDesktopRunContextFromPreflight")
    expect(claudeRouter).not.toContain(
      "const desktopRunRequest: DesktopRunRequest",
    )
    expect(claudeDesktopRunRequest).toContain(
      "createClaudeDesktopRunRequest",
    )
    expect(claudeDesktopRunRequest).toContain(
      "createClaudeDesktopRunRequestFromRuntimeStartup",
    )
    expect(claudeDesktopJob).toContain("createClaudeAgentSdkDesktopRunStartup")
    expect(claudeDesktopJob).toContain(
      "createClaudeDesktopRunRequestFromRuntimeStartup",
    )
    expect(claudeDesktopJob).toContain("createClaudeAgentSdkDesktopJob")
    expect(claudeDesktopRunRequest).toContain(
      "createClaudeDesktopProviderBinding",
    )
    expect(claudeDesktopRunRequest).toContain(
      "resolveClaudeDesktopRunResumeSessionId",
    )
    expect(claudeDesktopRunRequest).toContain(
      "authMode: input.selectedProviderProfileId",
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
    const claudeAgentSdkRuntimeLifecycle = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-lifecycle.ts",
      "utf8",
    )
    const streamConsumer = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-consumer.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-runtime-lifecycle")
    expect(claudeRouter).not.toContain("../../claude/agent-sdk-adapter-runner")
    expect(claudeRouter).not.toContain("../../claude/agent-sdk-stream-consumer")
    expect(claudeRouter).toContain("../../claude/agent-sdk-runtime-state")
    expect(claudeRouter).not.toContain(
      'from "../../claude/agent-sdk-adapter"',
    )
    expect(claudeRouter).not.toContain("createClaudeAgentSdkAdapter({")
    expect(claudeRouter).toContain("runClaudeAgentSdkDesktopRuntimeLifecycle({")
    expect(claudeRouter).not.toContain(
      "runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery({",
    )
    expect(claudeRouter).not.toContain(
      "runClaudeAgentSdkDesktopAdapterWithRuntimeConsumer({",
    )
    expect(claudeRouter).not.toContain(
      "runClaudeAgentSdkDesktopAdapterWithStreamConsumer({",
    )
    expect(claudeRouter).not.toContain("runClaudeAgentSdkDesktopAdapter({")
    expect(claudeRouter).not.toContain("createClaudeAgentSdkStreamConsumer({")
    expect(claudeRouter).not.toContain("streamConsumer: {")
    expect(claudeRouter).toContain(
      "createClaudeAgentSdkRuntimeStreamState",
    )
    expect(claudeRouter).not.toContain(
      "createClaudeAgentSdkStreamConsumerMutableState",
    )
    expect(claudeRouter).not.toContain(
      "createClaudeAgentSdkStreamConsumerStateAccess",
    )
    expect(claudeRouter).not.toContain(
      "resetClaudeAgentSdkStreamConsumerAttemptState",
    )
    expect(claudeRouter).not.toContain("state: {")
    expect(claudeRouter).not.toContain("getMetadata: () =>")
    expect(claudeRouter).not.toContain("setMessageCount: (value)")
    expect(claudeRouter).not.toContain("runClaudeAgentSdkAdapterWithPolicyRetry")
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
    expect(streamConsumer).toContain("createClaudeAgentSdkStreamConsumer")
    expect(streamConsumer).toContain(
      "createClaudeAgentSdkStreamConsumerMutableState",
    )
    expect(streamConsumer).toContain(
      "createClaudeAgentSdkStreamConsumerStateAccess",
    )
    expect(streamConsumer).toContain(
      "resetClaudeAgentSdkStreamConsumerAttemptState",
    )
    expect(claudeAgentSdkAdapterRunner).not.toContain(
      "createClaudeAgentSdkStreamConsumerMutableState",
    )
    expect(claudeAgentSdkAdapterRunner).toContain(
      "runClaudeAgentSdkAdapterWithPolicyRetry",
    )
    expect(claudeAgentSdkAdapterRunner).toContain(
      "runClaudeAgentSdkDesktopAdapter",
    )
    expect(claudeAgentSdkAdapterRunner).toContain(
      "runClaudeAgentSdkDesktopAdapterWithRuntimeConsumer",
    )
    expect(claudeAgentSdkAdapterRunner).toContain(
      "runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery",
    )
    expect(claudeAgentSdkRuntimeLifecycle).toContain(
      "runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery",
    )
    expect(claudeAgentSdkAdapterRunner).toContain(
      "runClaudeAgentSdkDesktopAdapterWithStreamConsumer",
    )
    expect(claudeAgentSdkAdapterRunner).toContain("streamConsumer: {")
    expect(claudeAgentSdkAdapterRunner).toContain(
      "createClaudeAgentSdkAdapter({",
    )
    expect(claudeAgentSdkAdapterRunner).toContain(
      "createClaudeAgentSdkStreamConsumer({",
    )
    expect(claudeAgentSdkAdapterRunner).toContain(
      "createClaudeAgentSdkStreamConsumerStateAccess",
    )
    expect(claudeAgentSdkAdapterRunner).toContain(
      "resetClaudeAgentSdkStreamConsumerAttemptState",
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
    const claudeEnv = readFileSync("src/main/lib/claude/env.ts", "utf8")
    const claudeProviderStartup = readFileSync(
      "src/main/lib/claude/agent-sdk-provider-startup.ts",
      "utf8",
    )
    const claudeRuntimeStartup = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-startup.ts",
      "utf8",
    )
    const claudeConfigDir = readFileSync(
      "src/main/lib/claude/agent-sdk-config-dir.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-provider-startup")
    expect(claudeRouter).toContain("../../claude/agent-sdk-runtime-startup")
    expect(claudeRouter).toContain("../../claude/agent-sdk-config-dir")
    expect(claudeRouter).toContain(
      "const providerStartup =\n              await prepareClaudeAgentSdkProviderStartupForDesktopRun",
    )
    expect(claudeRouter).not.toContain("resolveClaudeAgentSdkProviderStartup({")
    expect(claudeRouter).not.toContain("recordClaudeAgentSdkConnectionMethod")
    expect(claudeRouter).not.toContain("emitPreflightBlocker(providerStartup.blocker)")
    expect(claudeRouter).not.toContain("getClaudeAgentSdkConnectionMethod")
    expect(claudeRouter).not.toContain("../../analytics")
    expect(claudeRouter).not.toContain("setConnectionMethod(")
    expect(claudeRouter).toContain("prepareClaudeAgentSdkRuntimeStartupContext")
    expect(claudeRouter).not.toContain("prepareClaudeAgentSdkRuntimeStartupEnvironment")
    expect(claudeRouter).not.toContain("resolveClaudeAgentSdkIsolatedConfig({")
    expect(claudeRouter).not.toContain('app.getPath("userData")')
    expect(claudeRouter).not.toContain('from "electron"')
    expect(claudeRouter).not.toContain("prepareClaudeAgentSdkRuntimeEnvironment")
    expect(claudeRouter).not.toContain("finalCustomConfig?.model || input.model")
    expect(claudeRouter).not.toContain("let connectionMethod")
    expect(claudeRouter).not.toContain('connectionMethod = "offline-ollama"')
    expect(claudeRouter).not.toContain('connectionMethod = isDefaultAnthropicUrl')
    expect(claudeRouter).not.toContain("normalizeClaudeProviderRuntimeConfig")
    expect(claudeRouter).not.toContain("checkOfflineFallback")
    expect(claudeRouter).not.toContain("getValidClaudeCodeCredential")
    expect(claudeRouter).not.toContain("getActiveClaudeProviderConfig")
    expect(claudeRouter).not.toContain("parseProviderProfileSource")
    expect(claudeRouter).not.toContain("getProviderProfileRuntimeConfig")
    expect(claudeRouter).not.toContain("getProviderGatewayEndpoint")
    expect(claudeRouter).not.toContain("getLegacyClaudeProviderProfileId")
    expect(claudeRouter).not.toContain("assertOfficialCloudAllowed")
    expect(claudeRouter).not.toContain("createClaudeAgentSdkRuntimeEnv")
    expect(claudeRouter).not.toContain("buildClaudeEnv")
    expect(claudeRouter).not.toContain("buildClaudeProviderEnv")
    expect(claudeRouter).not.toContain("logClaudeEnv")
    expect(claudeRouter).not.toContain("symlinksCreated")
    expect(claudeRouter).not.toContain("removeManagedSymlink")
    expect(claudeRouter).not.toContain("ensureSymlink")
    expect(claudeRouter).not.toContain("const skillsSource")
    expect(claudeRouter).not.toContain(
      "function normalizeRuntimeProviderConfig",
    )
    expect(claudeRouter).not.toContain("function redactClaudeEnvValueForLog")
    expect(claudeRouter).not.toContain("redactClaudeProviderEnvValueForLog")
    expect(claudeRouter).not.toContain("claudeEnv.ANTHROPIC_API_KEY")
    expect(claudeRouter).not.toContain(
      "CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken",
    )
    expect(claudeProviderRuntimeConfig).toContain(
      "normalizeClaudeProviderRuntimeConfig",
    )
    expect(claudeProviderRuntimeConfig).toContain(
      "redactClaudeProviderEnvValueForLog",
    )
    expect(claudeEnv).toContain("prepareClaudeAgentSdkRuntimeEnvironment")
    expect(claudeEnv).toContain("prepareClaudeAgentSdkRuntimeStartupEnvironment")
    expect(claudeEnv).toContain("buildClaudeProviderEnv(customConfig)")
    expect(claudeEnv).toContain("createClaudeAgentSdkRuntimeEnv")
    expect(claudeEnv).toContain("CLAUDE_CODE_OAUTH_TOKEN")
    expect(claudeEnv).toContain("CLAUDE_CONFIG_DIR")
    expect(claudeProviderStartup).toContain(
      "prepareClaudeAgentSdkProviderStartupForDesktopRun",
    )
    expect(claudeProviderStartup).toContain(
      "resolveClaudeAgentSdkProviderStartup",
    )
    expect(claudeProviderStartup).toContain(
      "getClaudeAgentSdkConnectionMethod",
    )
    expect(claudeProviderStartup).toContain(
      "recordClaudeAgentSdkConnectionMethod",
    )
    expect(claudeProviderStartup).toContain("recordAnalyticsConnectionMethod")
    expect(claudeProviderStartup).toContain("parseProviderProfileSource")
    expect(claudeProviderStartup).toContain("getProviderProfileRuntimeConfig")
    expect(claudeProviderStartup).toContain("getProviderGatewayEndpoint")
    expect(claudeProviderStartup).toContain("getValidClaudeCodeCredential")
    expect(claudeProviderStartup).toContain("checkOfflineFallback")
    expect(claudeProviderStartup).toContain("assertOfficialCloudAllowed")
    expect(claudeRuntimeStartup).toContain(
      "prepareClaudeAgentSdkRuntimeStartupContext",
    )
    expect(claudeRuntimeStartup).toContain(
      "prepareClaudeAgentSdkRuntimeStartupEnvironment",
    )
    expect(claudeRuntimeStartup).toContain("resolveClaudeAgentSdkIsolatedConfig")
    expect(claudeRuntimeStartup).toContain('electron.app.getPath("userData")')
    expect(claudeConfigDir).toContain("resolveClaudeAgentSdkIsolatedConfig")
    expect(claudeConfigDir).toContain("ensureClaudeAgentSdkIsolatedConfigDir")
    expect(claudeConfigDir).toContain("clearClaudeAgentSdkIsolatedConfigDirCache")
    expect(claudeConfigDir).toContain("getPluginSafeModeState")
    expect(claudeConfigDir).toContain("removeManagedSymlink")
    expect(claudeConfigDir).toContain("ensureSymlink")
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
    expect(claudeRouter).toContain("logClaudeAgentSdkStartupDiagnostics")
    expect(claudeRouter).not.toContain("logClaudeAgentSdkAuthDiagnostics")
    expect(claudeRouter).not.toContain("logClaudeAgentSdkSessionDiagnostics")
    expect(claudeRouter).not.toContain("logClaudeAgentSdkProviderDiagnostics")
    expect(claudeRouter).not.toContain("AUTH METHOD USED")
    expect(claudeRouter).not.toContain("Expected session path")
    expect(claudeRouter).not.toContain("Using offline mode - Model")
    expect(runtimeDiagnostics).toContain("logClaudeAgentSdkStartupDiagnostics")
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
    const runtimeQuery = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-query.ts",
      "utf8",
    )
    const runtimeLifecycle = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-lifecycle.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-runtime-query")
    expect(claudeRouter).not.toContain(
      "prepareClaudeAgentSdkDesktopRuntimeQuery({",
    )
    expect(claudeRouter).toContain("runtimeQuery: {")
    expect(claudeRouter).not.toContain("../../claude/agent-sdk-query-options")
    expect(claudeRouter).not.toContain(
      "createClaudeAgentSdkDesktopRuntimeQueryOptions({",
    )
    expect(claudeRouter).not.toContain("permissionHandler: {")
    expect(claudeRouter).not.toContain("guardEvents.push(event)")
    expect(claudeRouter).not.toContain("prepareClaudeAgentSdkMcpServers")
    expect(runtimeQuery).toContain("prepareClaudeAgentSdkMcpServers")
    expect(runtimeQuery).toContain(
      "createClaudeAgentSdkDesktopRuntimeQueryOptions",
    )
    expect(runtimeLifecycle).toContain(
      "prepareClaudeAgentSdkDesktopRuntimeQuery",
    )
    expect(claudeQueryOptions).toContain(
      "createClaudeAgentSdkDesktopRuntimeQueryOptions",
    )
    expect(claudeQueryOptions).toContain("permissionHandler: {")
    expect(claudeQueryOptions).toContain("guardEvents.push(event)")
    expect(claudeRouter).not.toContain(
      "const queryOptions = createClaudeAgentSdkQueryOptions({",
    )
    expect(claudeRouter).not.toContain("createClaudeAgentSdkStderrHandler")
    expect(claudeRouter).not.toContain("resolveClaudeAgentSdkResumeOptions")
    expect(claudeRouter).not.toContain("getBundledClaudeBinaryPath")
    expect(claudeRouter).not.toContain("pathToClaudeCodeExecutable")
    expect(claudeRouter).not.toContain(
      "canUseTool: createClaudeAgentSdkToolPermissionHandler({",
    )
    expect(claudeRouter).not.toContain(
      "shouldForkResume && forkResumeAtUuid && !isUsingOllama",
    )
    expect(claudeRouter).not.toContain("cwd: desktopRunRequest.context.cwd")
    expect(claudeRouter).not.toContain("includePartialMessages: true")
    expect(claudeRouter).not.toContain("stderrLines.push(data)")
    expect(claudeRouter).not.toContain("[Ollama stderr]")
    expect(claudeRouter).not.toContain("[claude stderr]")
    expect(claudeRouter).not.toContain(
      "[Ollama] Skipping MCP servers to speed up initialization",
    )
    expect(claudeRouter).not.toContain(
      "let mcpServersFiltered: Record<string, any> | undefined",
    )
    expect(claudeQueryOptions).toContain("cwd: request.context.cwd")
    expect(claudeQueryOptions).toContain(
      "permissionMode: permission.sdkPermissionMode",
    )
    expect(claudeQueryOptions).toContain("includePartialMessages: true")
    expect(claudeQueryOptions).toContain("createAbortControllerFromSignal")
    expect(claudeQueryOptions).toContain(
      "createClaudeAgentSdkRuntimeQueryOptions",
    )
    expect(claudeQueryOptions).toContain(
      "createClaudeAgentSdkToolPermissionHandler",
    )
    expect(claudeQueryOptions).toContain("createClaudeAgentSdkStderrHandler")
    expect(claudeQueryOptions).toContain("getBundledClaudeBinaryPath")
    expect(claudeQueryOptions).toContain("pathToClaudeCodeExecutable")
    expect(claudeQueryOptions).toContain("stderrLines.push(data)")
    expect(claudeQueryOptions).toContain("[Ollama stderr]")
    expect(claudeQueryOptions).toContain("[claude stderr]")
    expect(claudeQueryOptions).toContain("prepareClaudeAgentSdkMcpServers")
    expect(claudeQueryOptions).toContain("resolveClaudeAgentSdkResumeOptions")
    expect(claudeQueryOptions).toContain("shouldForkResume")
    expect(claudeQueryOptions).toContain("forkResumeAtUuid")
    expect(claudeQueryOptions).toContain(
      "[Ollama] Skipping MCP servers to speed up initialization",
    )
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
    const claudePrompt = readFileSync(
      "src/main/lib/claude/agent-sdk-prompt.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/mentions")
    expect(claudeRouter).not.toContain("parseClaudePromptMentions(input.prompt)")
    expect(claudeRouter).not.toContain("function parseMentions")
    expect(claudeRouter).not.toContain(
      "const mentionRegex = /@\\[(file|folder|skill|agent|tool):",
    )
    expect(claudePrompt).toContain("parseClaudePromptMentions(prompt)")
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
    const streamConsumer = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-consumer.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-stream-lifecycle")
    expect(claudeRouter).not.toContain("../../claude/agent-sdk-stream-message")
    expect(claudeRouter).not.toContain("startClaudeAgentSdkStreamIteration")
    expect(claudeRouter).not.toContain(
      "createClaudeAgentSdkStreamIterationState()",
    )
    expect(claudeRouter).not.toContain("recordClaudeAgentSdkIncomingMessage")
    expect(claudeRouter).not.toContain("recordClaudeAgentSdkStreamMessage")
    expect(claudeRouter).not.toContain("logRawClaudeMessage")
    expect(claudeRouter).not.toContain("completeClaudeAgentSdkStreamIteration")
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
    expect(streamConsumer).toContain("startClaudeAgentSdkStreamIteration")
    expect(streamConsumer).toContain("recordClaudeAgentSdkIncomingMessage")
    expect(streamConsumer).toContain("completeClaudeAgentSdkStreamIteration")
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
    const streamConsumer = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-consumer.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-stream-control")
    expect(claudeRouter).not.toContain("shouldStopClaudeAgentSdkStreamForAbort")
    expect(claudeRouter).not.toContain(
      "shouldStopClaudeAgentSdkStreamForClosedObserver",
    )
    expect(claudeRouter).not.toContain("logClaudeOllamaStreamAborted")
    expect(claudeRouter).not.toContain("M:OBSERVER_CLOSED_STREAM")
    expect(streamControl).toContain("logClaudeOllamaStreamAborted")
    expect(streamControl).toContain("M:OBSERVER_CLOSED_STREAM")
    expect(streamConsumer).toContain("shouldStopClaudeAgentSdkStreamForAbort")
    expect(streamConsumer).toContain(
      "shouldStopClaudeAgentSdkStreamForClosedObserver",
    )
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
    const runtimeState = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-state.ts",
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

    expect(claudeRouter).toContain("../../claude/agent-sdk-runtime-state")
    expect(claudeRouter).toContain("createClaudeAgentSdkRuntimeStreamSetup")
    expect(claudeRouter).not.toContain("../../claude/agent-sdk-guard-metadata")
    expect(claudeRouter).not.toContain("createClaudeAgentSdkInitialGuardMetadata")
    expect(claudeRouter).not.toContain("createTransformer")
    expect(claudeRouter).not.toContain("const parts: any[]")
    expect(claudeRouter).not.toContain("const stderrLines: string[]")
    expect(claudeRouter).not.toContain("finalizeClaudeAgentSdkGuardMetadata({")
    expect(claudeRouter).not.toContain("const finalizeGuardMetadata")
    expect(claudeRouter).not.toContain("buildGuardedRunAudit")
    expect(claudeRouter).not.toContain("contractId: guardedContract.id")
    expect(runFinalization).toContain("finalizeClaudeAgentSdkGuardMetadata({")
    expect(streamErrorFinalization).toContain(
      "finalizeClaudeAgentSdkGuardMetadata({",
    )
    expect(guardMetadata).toContain("createClaudeAgentSdkInitialGuardMetadata")
    expect(guardMetadata).toContain("finalizeClaudeAgentSdkGuardMetadata")
    expect(guardMetadata).toContain("buildGuardedRunAudit")
    expect(guardMetadata).toContain("captureGuardedGitStatus")
    expect(guardMetadata).toContain('emit({ type: "guard-audit", audit })')
    expect(runtimeState).toContain("createClaudeAgentSdkRuntimeStreamSetup")
    expect(runtimeState).toContain("createTransformer")
    expect(runtimeState).toContain("createClaudeAgentSdkInitialGuardMetadata")
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
    const runtimeLifecycle = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-lifecycle.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-run-finalization")
    expect(claudeRouter).not.toContain(
      "completeClaudeAgentSdkRunAfterAdapterWithStreamState",
    )
    expect(claudeRouter).toContain(
      "finalizeClaudeAgentSdkUnexpectedErrorWithStreamState",
    )
    expect(claudeRouter).not.toContain(
      "finalizeClaudeAgentSdkUnexpectedError({",
    )
    expect(claudeRouter).not.toContain("metadata: streamState.metadata")
    expect(claudeRouter).not.toContain("currentText: streamState.currentText")
    expect(claudeRouter).not.toContain("messageCount: streamState.messageCount")
    expect(claudeRouter).not.toContain("chunkCount: streamState.chunkCount")
    expect(claudeRouter).not.toContain(
      "pendingFinishChunk: streamState.pendingFinishChunk",
    )
    expect(claudeRouter).not.toContain("reason=no_response")
    expect(claudeRouter).not.toContain("reason=unexpected_error")
    expect(claudeRouter).not.toContain("[SD] M:SAVE")
    expect(claudeRouter).not.toContain("reason=ok")
    expect(claudeRouter).not.toContain("No response received from Claude")
    expect(claudeRouter).not.toContain('emitError(error, "Unexpected error")')
    expect(runFinalization).toContain(
      "completeClaudeAgentSdkRunAfterAdapter",
    )
    expect(runFinalization).toContain(
      "completeClaudeAgentSdkRunAfterAdapterWithStreamState",
    )
    expect(runtimeLifecycle).toContain(
      "completeClaudeAgentSdkRunAfterAdapterWithStreamState",
    )
    expect(runtimeLifecycle).toContain(
      "runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery",
    )
    expect(runFinalization).toContain("state.metadata")
    expect(runFinalization).toContain(
      "finalizeClaudeAgentSdkUnexpectedError",
    )
    expect(runFinalization).toContain(
      "finalizeClaudeAgentSdkUnexpectedErrorWithStreamState",
    )
    expect(runFinalization).toContain("reason=no_response")
    expect(runFinalization).toContain("reason=unexpected_error")
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
    const streamConsumer = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-consumer.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain(
      "../../claude/agent-sdk-stream-error-finalization",
    )
    expect(claudeRouter).not.toContain("finalizeClaudeAgentSdkStreamError")
    expect(claudeRouter).not.toContain("classifyClaudeAgentSdkStreamError")
    expect(claudeRouter).not.toContain("reason=stream_error")
    expect(claudeRouter).not.toContain("M:CATCH_SAVE")
    expect(claudeRouter).not.toContain("Session not found")
    expect(streamErrorFinalization).toContain(
      "finalizeClaudeAgentSdkStreamError",
    )
    expect(streamConsumer).toContain("finalizeClaudeAgentSdkStreamError")
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
    const streamConsumer = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-consumer.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-policy-retry")
    expect(claudeRouter).not.toContain("createClaudeAgentSdkPolicyRetryState()")
    expect(claudeRouter).not.toContain("recordClaudeAgentSdkPolicyRetry")
    expect(claudeRouter).toContain(
      "runClaudeAgentSdkDesktopRuntimeLifecycle",
    )
    expect(claudeRouter).not.toContain(
      "runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery",
    )
    expect(claudeRouter).not.toContain(
      "runClaudeAgentSdkDesktopAdapterWithStreamConsumer",
    )
    expect(claudeRouter).not.toContain(
      "runClaudeAgentSdkDesktopAdapterWithRuntimeConsumer",
    )
    expect(claudeRouter).not.toContain("runClaudeAgentSdkAdapterWithPolicyRetry")
    expect(claudeRouter).not.toContain("handleClaudeAgentSdkEmbeddedErrorMessage")
    expect(claudeRouter).not.toContain("createClaudeAgentSdkEmbeddedErrorContext")
    expect(claudeRouter).not.toContain("usesApiKeyAuth: Boolean(")
    expect(claudeRouter).not.toContain("runtimeQuery.queryOptions")
    expect(claudeRouter).not.toContain("runtimeQuery.mcpServers")
    expect(claudeRouter).not.toContain("mcpServerNames: mcpServersFiltered")
    expect(claudeRouter).not.toContain("mcpServersFiltered")
    expect(claudeRouter).not.toContain("finalizeClaudeAgentSdkEmbeddedError")
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
    expect(adapterRunner).toContain(
      "runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery",
    )
    expect(adapterRunner).toContain("queryOptions: runtimeQuery.queryOptions")
    expect(adapterRunner).toContain("mcpServers: runtimeQuery.mcpServers")
    expect(adapterRunner).toContain("createClaudeAgentSdkPolicyRetryState")
    expect(adapterRunner).toContain("waitForClaudeAgentSdkPolicyRetry")
    expect(adapterRunner).toContain("resetClaudeAgentSdkPolicyRetryAttempt")
    expect(embeddedErrorFinalization).toContain(
      "recordClaudeAgentSdkPolicyRetry",
    )
    expect(embeddedErrorFinalization).toContain(
      "handleClaudeAgentSdkEmbeddedErrorMessage",
    )
    expect(streamConsumer).toContain("handleClaudeAgentSdkEmbeddedErrorMessage")
    expect(embeddedErrorFinalization).toContain(
      "createClaudeAgentSdkEmbeddedErrorContext",
    )
    expect(streamConsumer).toContain("createClaudeAgentSdkEmbeddedErrorContext")
    expect(embeddedErrorFinalization).toContain("usesApiKeyAuth: Boolean(")
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
    const claudeDesktopJob = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-job.ts",
      "utf8",
    )
    const claudeSubscriptionCleanup = readFileSync(
      "src/main/lib/claude/agent-sdk-subscription-cleanup.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("createClaudeAgentSdkDesktopRunStartup")
    expect(claudeRouter).not.toContain("createClaudeAgentSdkDesktopJob({")
    expect(claudeRouter).not.toContain("createAndRegisterDesktopChatAgentJob")
    expect(claudeRouter).not.toContain("createDesktopStreamEventMapper")
    expect(claudeRouter).not.toContain("appendRunEventsToAgentJob")
    expect(codexRouter).toContain("createAndRegisterDesktopChatAgentJob")
    expect(claudeDesktopJob).toContain("appendRunEventsToAgentJob")
    expect(claudeDesktopJob).toContain(
      "createClaudeAgentSdkDesktopRunTraceEmitter",
    )
    expect(claudeRouter).toContain("completeClaudeAgentSdkDesktopJobAfterRun")
    expect(claudeRouter).not.toContain("requestCancelClaudeAgentSdkDesktopJob")
    expect(claudeRouter).not.toContain("completeDesktopChatAgentJobSafely")
    expect(claudeRouter).not.toContain("requestCancelDesktopChatAgentJobSafely")
    expect(claudeDesktopJob).toContain("completeDesktopChatAgentJobSafely")
    expect(claudeDesktopJob).toContain("requestCancelDesktopChatAgentJobSafely")
    expect(claudeSubscriptionCleanup).toContain(
      "requestCancelClaudeAgentSdkDesktopJob",
    )
    expect(codexRouter).toContain("completeDesktopChatAgentJobSafely")
    expect(codexRouter).toContain("requestCancelDesktopChatAgentJobSafely")

    for (const route of [claudeRouter, codexRouter]) {
      expect(route).not.toContain("createAndStartDesktopAgentJob")
      expect(route).not.toContain("registerActiveDesktopAgentJob")
      expect(route).not.toContain("resolveDesktopChatJobCompletion({")
      expect(route).not.toContain("completeDesktopAgentJobSafely")
      expect(route).not.toContain("requestCancelDesktopAgentJob(")
      expect(route).not.toContain("unregisterActiveDesktopAgentJob")
      expect(route).not.toContain("desktop_chat_failed")
      expect(route).not.toContain("desktop_chat_canceled")
      expect(route).not.toContain('status === "succeeded" ? 0')
    }
    expect(desktopAgentJobs).toContain("resolveDesktopChatJobCompletion")
    expect(desktopAgentJobs).toContain("createAndRegisterDesktopChatAgentJob")
    expect(desktopAgentJobs).toContain("createAndStartDesktopAgentJob")
    expect(desktopAgentJobs).toContain("registerActiveDesktopAgentJob")
    expect(desktopAgentJobs).toContain("completeDesktopChatAgentJobSafely")
    expect(desktopAgentJobs).toContain(
      "requestCancelDesktopChatAgentJobSafely",
    )
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
    expect(claudeRouter).toContain(
      "prepareClaudeAgentSdkRuntimePromptForDesktopRun",
    )
    expect(claudeRouter).not.toContain("prepareClaudeAgentSdkRuntimePrompt({")
    expect(claudeRouter).not.toContain(
      "ClaudeAgentSdkLongTextAttachmentPromptError",
    )
    expect(claudeRouter).not.toContain("Long text attachment unavailable")
    expect(claudeRouter).not.toContain("createClaudeAgentSdkPrompt({")
    expect(claudeRouter).not.toContain("preparePromptWithAppAgents")
    expect(claudeRouter).not.toContain("prependLongTextAttachmentPromptBlocks")
    expect(claudeRouter).not.toContain("async function* createPromptWithImages")
    expect(claudeRouter).not.toContain("media_type: img.mediaType")
    expect(claudePrompt).toContain("prepareClaudeAgentSdkRuntimePrompt")
    expect(claudePrompt).toContain(
      "prepareClaudeAgentSdkRuntimePromptForDesktopRun",
    )
    expect(claudePrompt).toContain(
      "ClaudeAgentSdkLongTextAttachmentPromptError",
    )
    expect(claudePrompt).toContain("preparePromptWithAppAgents")
    expect(claudePrompt).toContain("prependLongTextAttachmentPromptBlocks")
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
    const runtimeQuery = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-query.ts",
      "utf8",
    )
    const runtimeLifecycle = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-lifecycle.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-project-context")
    expect(claudeRouter).not.toContain("prepareClaudeAgentSdkPromptContext")
    expect(claudeRouter).not.toContain("../../claude/agent-sdk-runtime-query")
    expect(claudeRouter).not.toContain("readClaudeAgentSdkProjectAgentsMd")
    expect(claudeRouter).not.toContain("createClaudeAgentSdkSystemPromptConfig")
    expect(claudeRouter).not.toContain('path.join(runtimeCwd, "AGENTS.md")')
    expect(claudeRouter).not.toContain("The following are the project's")
    expect(projectContext).toContain("prepareClaudeAgentSdkPromptContext")
    expect(projectContext).toContain("readClaudeAgentSdkProjectAgentsMd")
    expect(projectContext).toContain("createClaudeAgentSdkSystemPromptConfig")
    expect(projectContext).toContain("createClaudeOllamaPrompt")
    expect(projectContext).toContain('path.join(cwd, "AGENTS.md")')
    expect(runtimeQuery).toContain("prepareClaudeAgentSdkPromptContext")
    expect(runtimeLifecycle).toContain(
      "prepareClaudeAgentSdkDesktopRuntimeQuery",
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
    const runtimeStartup = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-startup.ts",
      "utf8",
    )
    const streamErrorFinalization = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-error-finalization.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain(
      "../../claude/agent-sdk-ollama-diagnostics",
    )
    expect(claudeRouter).toContain(
      "prepareClaudeAgentSdkRuntimeStartupDiagnostics",
    )
    expect(claudeRouter).not.toContain(
      "prepareClaudeAgentSdkOllamaStartupDiagnostics",
    )
    expect(claudeRouter).not.toContain("ANTHROPIC_AUTH_TOKEN")
    expect(claudeRouter).not.toContain("logClaudeOllamaStreamStart")
    expect(claudeRouter).not.toContain("logClaudeOllamaStreamError")
    expect(claudeRouter).not.toContain("logClaudeOllamaSdkConfiguration")
    expect(claudeRouter).not.toContain("probeClaudeOllamaConnectivity")
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
    expect(ollamaDiagnostics).toContain(
      "prepareClaudeAgentSdkOllamaStartupDiagnostics",
    )
    expect(runtimeStartup).toContain(
      "prepareClaudeAgentSdkRuntimeStartupDiagnostics",
    )
    expect(runtimeStartup).toContain(
      "prepareClaudeAgentSdkOllamaStartupDiagnostics",
    )
    expect(runtimeStartup).toContain("ANTHROPIC_AUTH_TOKEN")
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
    const projectContext = readFileSync(
      "src/main/lib/claude/agent-sdk-project-context.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-ollama-prompt")
    expect(claudeRouter).not.toContain("createClaudeOllamaPrompt({")
    expect(claudeRouter).not.toContain("[CONVERSATION HISTORY]")
    expect(claudeRouter).not.toContain("toolSummaries")
    expect(projectContext).toContain("createClaudeOllamaPrompt")
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
    expect(claudeRouter).toContain("prepareClaudeChatHistoryForDesktopRun")
    expect(claudeRouter).not.toContain("prepareClaudeUserMessageForHistory")
    expect(claudeRouter).not.toContain("resolveClaudeChatResumeMetadata")
    expect(claudeRouter).not.toContain("consumeClaudeChatForkResumeFlags")
    expect(claudeRouter).not.toContain("JSON.parse(existing?.messages")
    expect(claudeRouter).not.toContain("messages: JSON.stringify(messagesToSave)")
    expect(claudeRouter).not.toContain("buildClaudeUserParts(")
    expect(claudeRouter).not.toContain("isDuplicateClaudeUserMessage")
    expect(claudeRouter).not.toContain(
      "function buildLongTextAttachmentParts",
    )
    expect(claudeRouter).not.toContain(
      "function chatImageAttachmentSignatureFromParts",
    )
    expect(claudeRouter).not.toContain("lastAssistantMsg")
    expect(claudeRouter).not.toContain("delete m.metadata.shouldForkResume")
    expect(claudeRouter).not.toContain(
      "claudeLongTextAttachmentSignatureFromParts",
    )
    expect(claudeRouter).not.toContain("claudeImageAttachmentSignatureFromParts")
    expect(claudeRouter).not.toContain("const imageAttachmentSchema = z.object")
    expect(claudeChatHistory).toContain("resolveClaudeChatResumeMetadata")
    expect(claudeChatHistory).toContain("consumeClaudeChatForkResumeFlags")
    expect(claudeChatHistory).toContain("isDuplicateClaudeUserMessage")
    expect(claudeChatHistory).toContain("prepareClaudeUserMessageForHistory")
    expect(claudeChatHistory).toContain("prepareClaudeChatHistoryForDesktopRun")
    expect(claudeChatHistory).toContain("lastAssistantMessage")
    expect(claudeChatHistory).toContain("delete metadata.shouldForkResume")
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
    const streamProcessor = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-processor.ts",
      "utf8",
    )
    const streamConsumer = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-consumer.ts",
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
    expect(claudeRouter).not.toContain("../../claude/agent-sdk-stream-processor")
    expect(claudeRouter).not.toContain("processClaudeAgentSdkStreamMessage")
    expect(claudeRouter).not.toContain(
      "syncClaudeAgentSdkStreamProcessingState",
    )
    expect(claudeRouter).not.toContain("metadata = streamProcessing.metadata")
    expect(claudeRouter).not.toContain(
      "currentSessionId = streamProcessing.currentSessionId",
    )
    expect(claudeRouter).not.toContain(
      "currentText = streamProcessing.currentText",
    )
    expect(claudeRouter).not.toContain(
      "pendingFinishChunk = streamProcessing.pendingFinishChunk",
    )
    expect(claudeRouter).not.toContain(
      "chunkCount = streamProcessing.chunkCount",
    )
    expect(claudeRouter).not.toContain(
      "lastChunkType = streamProcessing.lastChunkType",
    )
    expect(claudeRouter).not.toContain(
      "processClaudeAgentSdkTransformedChunks",
    )
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
    expect(streamProcessor).toContain("processClaudeAgentSdkStreamMessage")
    expect(streamProcessor).toContain(
      "syncClaudeAgentSdkStreamProcessingState",
    )
    expect(streamProcessor).toContain("processClaudeAgentSdkTransformedChunks")
    expect(streamConsumer).toContain("processClaudeAgentSdkStreamMessage")
    expect(streamConsumer).toContain("syncClaudeAgentSdkStreamProcessingState")
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
    const streamProcessor = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-processor.ts",
      "utf8",
    )
    const streamConsumer = readFileSync(
      "src/main/lib/claude/agent-sdk-stream-consumer.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain(
      "../../claude/agent-sdk-stream-processor",
    )
    expect(claudeRouter).not.toContain("processClaudeAgentSdkStreamMessage")
    expect(claudeRouter).not.toContain("trackClaudeAgentSdkMessageMetadata")
    expect(claudeRouter).not.toContain("metadata.sessionId = msgAny.session_id")
    expect(claudeRouter).not.toContain('msgAny.type === "system"')
    expect(claudeRouter).not.toContain(
      "metadata.sdkMessageUuid = lastAssistantUuid",
    )
    expect(claudeRouter).not.toContain("let lastAssistantUuid")
    expect(messageMetadata).toContain("trackClaudeAgentSdkMessageMetadata")
    expect(messageMetadata).toContain('msgAny.type === "system"')
    expect(messageMetadata).toContain("sdkMessageUuid: lastAssistantUuid")
    expect(streamProcessor).toContain("trackClaudeAgentSdkMessageMetadata")
    expect(streamProcessor).toContain("lastAssistantUuid")
    expect(streamConsumer).toContain("processClaudeAgentSdkStreamMessage")
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
    const claudeQueryOptions = readFileSync(
      "src/main/lib/claude/agent-sdk-query-options.ts",
      "utf8",
    )

    expect(claudeRouter).not.toContain("../../claude/agent-sdk-tool-permission")
    expect(claudeRouter).not.toContain(
      "canUseTool: createClaudeAgentSdkToolPermissionHandler({",
    )
    expect(claudeRouter).not.toContain("PLAN_MODE_BLOCKED_TOOLS")
    expect(claudeRouter).not.toContain("toClaudePermissionResult(decision)")
    expect(claudeQueryOptions).toContain(
      "canUseTool: createClaudeAgentSdkToolPermissionHandler({",
    )
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
    const subscriptionCleanup = readFileSync(
      "src/main/lib/claude/agent-sdk-subscription-cleanup.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/tool-approvals")
    expect(claudeRouter).toContain(
      "cleanupClaudeAgentSdkDesktopRunSubscription",
    )
    expect(claudeRouter).toContain("getClaudePendingToolApprovalStore()")
    expect(claudeRouter).toContain("resolveClaudePendingToolApproval")
    expect(claudeRouter).not.toContain('"Session ended."')
    expect(claudeRouter).not.toContain(".set({ streamId: null })")
    expect(claudeRouter).not.toContain("const pendingToolApprovals")
    expect(claudeRouter).not.toContain("pendingToolApprovals.delete")
    expect(claudeToolApprovals).toContain("const pendingToolApprovals")
    expect(claudeToolApprovals).toContain("resolveClaudePendingToolApproval")
    expect(claudeToolApprovals).toContain("clearClaudePendingToolApprovals")
    expect(subscriptionCleanup).toContain('"Session ended."')
    expect(subscriptionCleanup).toContain(".set({ streamId: null })")
    expect(subscriptionCleanup).toContain(
      "requestCancelClaudeAgentSdkDesktopJob",
    )
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
    expect(claudeRouter).not.toContain('msgAny.type === "error"')
    expect(claudeRouter).not.toContain("msgAny.error")
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
    expect(embeddedErrorFinalization).toContain('msgAny.type !== "error"')
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

  test("keeps Claude runtime error emission ownership out of the router", () => {
    const claudeRouter = readFileSync(
      "src/main/lib/trpc/routers/claude.ts",
      "utf8",
    )
    const runtimeErrors = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-errors.ts",
      "utf8",
    )

    expect(claudeRouter).toContain("../../claude/agent-sdk-runtime-errors")
    expect(claudeRouter).toContain("createClaudeAgentSdkRuntimeErrorHandlers")
    expect(claudeRouter).not.toContain("const errorMessage =")
    expect(claudeRouter).not.toContain("const errorStack =")
    expect(claudeRouter).not.toContain("PATH: process.env.PATH")
    expect(claudeRouter).not.toContain("new DesktopRunPreflightError(blocker)")
    expect(claudeRouter).not.toContain("Desktop run preflight blocked")
    expect(runtimeErrors).toContain("createClaudeAgentSdkRuntimeErrorHandlers")
    expect(runtimeErrors).toContain("new DesktopRunPreflightError(blocker)")
    expect(runtimeErrors).toContain("Desktop run preflight blocked")
    expect(runtimeErrors).toContain("PATH: env.PATH?.slice")
  })
})
