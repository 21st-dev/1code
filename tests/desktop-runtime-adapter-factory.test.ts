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

    expect(codexRouter).toContain("../../codex/acp-adapter")
    expect(codexRouter).toContain("createDesktopRunContextFromPreflight")
    expect(codexRouter).toContain("const desktopRunRequest: DesktopRunRequest")
    expect(codexRouter).toContain("getOrCreateCodexAcpProvider")
    expect(codexRouter).toContain("runRequest: desktopRunRequest")
    expect(codexRouter).not.toContain("createACPProvider")
    expect(codexRouter).not.toContain("providerSessions")
    expect(codexRouter).not.toContain("existingSessionId:")
    expect(codexAcpAdapter).toContain("createACPProvider")
    expect(codexAcpAdapter).toContain("providerSessions")
    expect(codexAcpAdapter).toContain("runRequest: DesktopRunRequest")
  })
})
