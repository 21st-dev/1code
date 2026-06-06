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
    expect(codexRouter).toContain("../../codex/acp-path")
    expect(codexRouter).toContain("../../codex/desktop-run-request")
    expect(codexRouter).toContain("../../codex/acp-runtime")
    expect(codexRouter).toContain("../../codex/acp-text-stream")
    expect(codexRouter).toContain("../../codex/acp-ui-stream")
    expect(codexRouter).toContain("../../codex/acp-message-persistence")
    expect(codexRouter).toContain("../../codex/chat-history")
    expect(codexRouter).toContain("../../codex/cli-runner")
    expect(codexRouter).toContain("../../codex/errors")
    expect(codexRouter).toContain("../../codex/integration-status")
    expect(codexRouter).toContain("../../codex/login-output")
    expect(codexRouter).toContain("../../codex/login-session")
    expect(codexRouter).toContain("../../codex/model-selection")
    expect(codexRouter).toContain("../../codex/runtime-status")
    expect(codexRouter).toContain("../../codex/usage-metadata")
    expect(codexRouter).toContain("../../codex/prompt")
    expect(codexRouter).toContain("const desktopRunRequest = createCodexDesktopRunRequest")
    expect(codexRouter).toContain("getOrCreateCodexAcpProvider")
    expect(codexRouter).toContain("runRequest: desktopRunRequest")
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
    expect(codexRouter).not.toContain("async function runCodexCli")
    expect(codexRouter).not.toContain("async function runCodexCliChecked")
    expect(codexRouter).not.toContain("function normalizeCodexIntegrationState")
    expect(codexRouter).not.toContain("async function getCodexIntegrationStatus")
    expect(codexRouter).not.toContain("async function getCodexRuntimeStatus")
    expect(codexRouter).not.toContain("existingSessionId:")
    expect(codexRouter).not.toContain("preparePromptWithAppAgents")
    expect(codexRouter).not.toContain("createCodexAcpPermissionHandler")
    expect(codexRouter).not.toContain("streamText")
    expect(codexRouter).not.toContain("buildCodexAcpModelMessageContent")
    expect(codexRouter).not.toContain("toUIMessageStream")
    expect(codexRouter).not.toContain("createDesktopRunContextFromPreflight")
    expect(codexRouter).not.toContain("const desktopRunRequest: DesktopRunRequest")
    expect(codexRouter).not.toContain("pollCodexUsageMetadata")
    expect(codexRouter).not.toContain("usagePromise")
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
})
