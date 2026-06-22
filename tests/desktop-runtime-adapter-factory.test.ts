import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  DesktopRuntimeAdapterFactory,
  type DesktopRuntimeAdapter,
  type DesktopRuntimeAdapterSource,
  emitDesktopRuntimeAdapterStarted,
} from "../src/main/lib/agent-runtime/desktop-runner"
import {
  CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA,
  CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA,
} from "../src/main/lib/agent-runtime/desktop-adapter-metadata"

function fakeAdapter(
  runtimeId: "claude-code" | "codex",
  source: DesktopRuntimeAdapterSource,
): DesktopRuntimeAdapter {
  return {
    metadata: {
      runtimeId,
      source,
      label: `${runtimeId} ${source}`,
      temporaryFallback: false,
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
    expect(CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA).toMatchObject({
      runtimeId: "codex",
      source: "codex-app-server",
      temporaryFallback: false,
      fallbackReason: null,
      defaultDisableCondition: null,
      removalCondition: null,
    })
  })

  test("emits desktop adapter source as a normalized runtime trace event", () => {
    const emittedEvents: any[] = []
    emitDesktopRuntimeAdapterStarted(
      {
        identity: { runId: "run-1", jobId: "job-1" },
        context: {
          runtimeId: "codex",
          mode: "plan",
          projectId: "project-1",
          chatId: "chat-1",
          subChatId: "sub-1",
          cwd: "/repo",
        },
        trace: { emit: (event: any) => emittedEvents.push(event) },
      } as any,
      CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA,
    )

    expect(emittedEvents).toHaveLength(1)
    expect(emittedEvents[0]).toMatchObject({
      runId: "run-1",
      jobId: "job-1",
      runtimeId: "codex",
      sequence: 0,
      type: "status",
      payload: {
        status: "desktop_runtime_adapter_started",
        adapterSource: "codex-app-server",
        adapterLabel: "Codex app-server adapter",
        attempt: 1,
        temporaryFallback: false,
        fallbackReason: null,
        defaultDisableCondition: null,
        removalCondition: null,
      },
      redaction: {
        status: "not-required",
        appliedRules: [],
      },
    })
  })

  test("rejects adapter source trace when metadata does not match the request runtime", () => {
    expect(() =>
      emitDesktopRuntimeAdapterStarted(
        {
          identity: { runId: "run-1", jobId: "job-1" },
          context: {
            runtimeId: "codex",
            mode: "plan",
            projectId: "project-1",
            chatId: "chat-1",
            subChatId: "sub-1",
            cwd: "/repo",
          },
          trace: { emit: () => {} },
        } as any,
        CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA,
      ),
    ).toThrow(
      "Desktop runtime adapter metadata mismatch: claude-agent-sdk cannot run codex",
    )
  })

  test("registers and resolves adapters by runtime and source", () => {
    const claude = fakeAdapter("claude-code", "claude-agent-sdk")
    const codex = fakeAdapter("codex", "codex-app-server")
    const factory = new DesktopRuntimeAdapterFactory([claude, codex])

    expect(factory.get({ runtimeId: "claude-code" })).toBe(claude)
    expect(factory.get({ runtimeId: "codex" })).toBe(codex)
    expect(
      factory.get({ runtimeId: "codex", source: "codex-app-server" }),
    ).toBe(codex)
    expect(factory.listMetadata()).toEqual([claude.metadata, codex.metadata])
  })

  test("rejects duplicate and unsupported adapter lookups", () => {
    const claude = fakeAdapter("claude-code", "claude-agent-sdk")

    expect(() => new DesktopRuntimeAdapterFactory([claude, claude])).toThrow(
      "Duplicate desktop runtime adapter",
    )

    const factory = new DesktopRuntimeAdapterFactory([claude])
    expect(() => factory.get({ runtimeId: "codex" })).toThrow(
      "Desktop runtime adapter not registered",
    )
    expect(() => factory.get({ runtimeId: "unknown" as any })).toThrow(
      "Unsupported desktop runtime adapter",
    )
  })

  test("keeps Codex desktop chat on the app-server adapter boundary", () => {
    const codexRouter = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )
    const codexAdapterTypes = readFileSync(
      "src/main/lib/codex/adapter-types.ts",
      "utf8",
    )
    const codexAppServerAdapter = readFileSync(
      "src/main/lib/codex/app-server-adapter.ts",
      "utf8",
    )
    const codexRuntimeStatus = readFileSync(
      "src/main/lib/codex/runtime-status.ts",
      "utf8",
    )
    const codexAnsiCleanup = readFileSync(
      "src/main/lib/codex/ansi-cleanup.ts",
      "utf8",
    )

    const removedTemporaryFactory = [
      "createCodex",
      "TemporaryCompatAdapter",
    ].join("Acp")
    const removedTemporaryMetadata = [
      "CODEX",
      "TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA",
    ].join("_ACP_")
    const removedSpawnProbe = ["probeCodex", "Spawn"].join("Acp")

    expect(codexRouter).toContain("../../codex/app-server-adapter")
    expect(codexRouter).toContain("../../codex/desktop-run-request")
    expect(codexRouter).toContain("../../codex/chat-history")
    expect(codexRouter).toContain("../../codex/cli-runner")
    expect(codexRouter).toContain("../../codex/runtime-status")
    expect(codexRouter).toContain("createCodexAppServerAdapter")
    expect(codexRouter).toContain('codexAdapterSource: "codex-app-server"')
    expect(codexRouter).toContain("createCodexAppServerFinishGate")
    expect(codexRouter).toContain("codexAdapter.run(desktopRunRequest)")
    expect(codexRouter).not.toContain(removedTemporaryFactory)
    expect(codexRouter).not.toContain("getOrCreateCodexAcpProvider")
    expect(codexRouter).not.toContain("resolveCodexAcpBinaryPath")
    expect(codexRouter).not.toContain("pendingFinishChunk")

    expect(codexAdapterTypes).toContain("DesktopRuntimeAdapter")
    expect(codexAdapterTypes).toContain("CodexDesktopAdapterSource")
    expect(codexAdapterTypes).toContain('"codex-app-server"')
    expect(codexAppServerAdapter).toContain("enabled = false")
    expect(codexAppServerAdapter).toContain(
      "CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA",
    )
    expect(codexAppServerAdapter).toContain(
      "CodexAppServerPermissionPolicyError",
    )
    expect(codexRuntimeStatus).toContain("buildCodexRuntimeAvailability")
    expect(codexRuntimeStatus).toContain("getRegisteredAgentRuntimeManifest")
    expect(codexRuntimeStatus).not.toContain(removedTemporaryMetadata)
    expect(codexRuntimeStatus).not.toContain("Default-disable condition:")
    expect(codexRuntimeStatus).not.toContain("Removal condition:")
    expect(codexAnsiCleanup).toContain("stripCodexAnsi")
    expect(codexAnsiCleanup).not.toContain(removedSpawnProbe)
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
    const desktopRunRequest = readFileSync(
      "src/main/lib/agent-runtime/desktop-run-request.ts",
      "utf8",
    )
    const desktopRunRuntime = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-runtime.ts",
      "utf8",
    )
    const desktopRuntimeLifecycle = readFileSync(
      "src/main/lib/claude/agent-sdk-runtime-lifecycle.ts",
      "utf8",
    )
    const claudeDesktopJob = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-job.ts",
      "utf8",
    )
    const claudeDesktopRunStartup = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-startup.ts",
      "utf8",
    )

    expect(claudeRouter).toContain(
      "prepareClaudeAgentSdkDesktopRunStartup({",
    )
    expect(claudeRouter).not.toContain(
      "createClaudeAgentSdkDesktopRunStartup({",
    )
    expect(claudeDesktopRunStartup).toContain(
      "createClaudeAgentSdkDesktopRunStartup",
    )
    expect(claudeDesktopJob).toContain("createDesktopRunRequest({")
    expect(claudeDesktopRunRequest).toContain("createDesktopRunContextFromPreflight")
    expect(claudeDesktopRunRequest).toContain("DesktopRunPreflightResult")
    expect(desktopRunRequest).toContain("cwd: preflight.cwd")
    expect(desktopRunRequest).toContain("workspaceKind: preflight.kind")
    expect(desktopRunRuntime).toContain(
      "runClaudeAgentSdkDesktopRuntimeWithMcpReadiness",
    )
    expect(desktopRuntimeLifecycle).toContain("request.context")
    expect(claudeDesktopJob).toContain("createAndRegisterDesktopChatAgentJob")
    expect(desktopRunRequest).toContain("DesktopRunRequest")
    expect(desktopRunRequest).toContain("DesktopRunPreflightResult")
    expect(claudeRouter).not.toContain("const request: DesktopRunRequest")
    expect(claudeRouter).not.toContain("createDesktopRunContextFromPreflight")
    expect(claudeRouter).not.toContain("createClaudeDesktopRunRequest")
  })
})
