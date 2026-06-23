import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  checkRegisteredAgentRuntimeCapability,
  getRegisteredAgentRuntimeManifest,
  listRegisteredAgentRuntimeManifests,
  resolveRegisteredAgentRuntimeCapability,
  resolveRegisteredAgentRuntimeManifest,
} from "../src/main/lib/agent-runtime/runtime-registry"

describe("agent runtime registry", () => {
  test("exposes non-secret Claude Code and Codex capability manifests", () => {
    const manifests = listRegisteredAgentRuntimeManifests()

    expect(manifests.map((manifest) => manifest.runtimeId)).toEqual([
      "claude-code",
      "codex",
    ])
    expect(getRegisteredAgentRuntimeManifest("claude").runtimeId).toBe(
      "claude-code",
    )
    expect(getRegisteredAgentRuntimeManifest("codex").runtimeId).toBe("codex")
    expect(JSON.stringify(manifests)).not.toMatch(
      /(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,
    )
    expect(JSON.stringify(manifests)).not.toContain("access_token")
  })

  test("keeps experimental runtimes out of contract registry lists unless their desktop flags are enabled", () => {
    expect(
      listRegisteredAgentRuntimeManifests({
        scope: "contract",
        env: {
          LOCUS_ENABLE_QWEN_CODE_RUNTIME: "1",
          LOCUS_ENABLE_KUN_RUNTIME: "1",
        },
      }).map((manifest) => manifest.runtimeId),
    ).toEqual(["claude-code", "codex"])
    expect(
      listRegisteredAgentRuntimeManifests({
        scope: "desktop",
        env: {},
      }).map((manifest) => manifest.runtimeId),
    ).toEqual(["claude-code", "codex"])
    expect(
      listRegisteredAgentRuntimeManifests({
        scope: "desktop",
        env: { LOCUS_ENABLE_QWEN_CODE_RUNTIME: "1" },
      }).map((manifest) => manifest.runtimeId),
    ).toEqual(["claude-code", "codex", "qwen-code"])
    expect(
      listRegisteredAgentRuntimeManifests({
        scope: "desktop",
        env: { LOCUS_ENABLE_KUN_RUNTIME: "1" },
      }).map((manifest) => manifest.runtimeId),
    ).toEqual(["claude-code", "codex", "kun"])
    expect(
      listRegisteredAgentRuntimeManifests({
        scope: "desktop",
        env: {
          LOCUS_ENABLE_QWEN_CODE_RUNTIME: "1",
          LOCUS_ENABLE_KUN_RUNTIME: "1",
        },
      }).map((manifest) => manifest.runtimeId),
    ).toEqual(["claude-code", "codex", "qwen-code", "kun"])

    expect(
      resolveRegisteredAgentRuntimeManifest("qwen-code", {
        scope: "desktop",
        env: {},
      }),
    ).toMatchObject({
      ok: false,
      diagnostic: {
        type: "unavailable-runtime",
        runtimeId: "qwen-code",
      },
    })
    expect(
      resolveRegisteredAgentRuntimeManifest("qwen-code", {
        scope: "desktop",
        env: { LOCUS_ENABLE_QWEN_CODE_RUNTIME: "1" },
      }),
    ).toMatchObject({
      ok: true,
      runtimeId: "qwen-code",
    })
    expect(
      resolveRegisteredAgentRuntimeManifest("kun", {
        scope: "desktop",
        env: {},
      }),
    ).toMatchObject({
      ok: false,
      diagnostic: {
        type: "unavailable-runtime",
        runtimeId: "kun",
      },
    })
    expect(
      resolveRegisteredAgentRuntimeManifest("kun", {
        scope: "desktop",
        env: { LOCUS_ENABLE_KUN_RUNTIME: "1" },
      }),
    ).toMatchObject({
      ok: true,
      runtimeId: "kun",
    })
    expect(
      getRegisteredAgentRuntimeManifest("kun", {
        scope: "desktop",
        env: { LOCUS_ENABLE_KUN_RUNTIME: "1" },
      }).runtimeId,
    ).toBe("kun")
  })

  test("provides reusable runtime gating for future desktop CLI job and protocol callers", () => {
    expect(
      checkRegisteredAgentRuntimeCapability({
        runtime: "claude-code",
        capabilityId: "rollback",
      }).ok,
    ).toBe(true)

    const codexRollback = checkRegisteredAgentRuntimeCapability({
      runtime: "codex",
      capabilityId: "rollback",
    })
    expect(codexRollback.ok).toBe(false)
    if (!codexRollback.ok) {
      expect(codexRollback.diagnostic.message).toContain("unsupported")
    }
  })

  test("returns normalized unavailable-runtime diagnostics for unknown callers", () => {
    expect(resolveRegisteredAgentRuntimeManifest("future-runtime")).toEqual({
      ok: false,
      runtimeId: "future-runtime",
      diagnostic: {
        type: "unavailable-runtime",
        runtimeId: "future-runtime",
        message: "Agent runtime future-runtime is not registered.",
        hint: "Choose a registered runtime and retry.",
      },
    })

    expect(
      resolveRegisteredAgentRuntimeCapability({
        runtime: "future-runtime",
        capabilityId: "planMode",
      }),
    ).toMatchObject({
      ok: false,
      diagnostic: {
        type: "unavailable-runtime",
      },
    })
  })

  test("is exposed through a runtime-neutral tRPC router", () => {
    const appRouter = readFileSync(
      "src/main/lib/trpc/routers/index.ts",
      "utf8",
    )
    const runtimeRouter = readFileSync(
      "src/main/lib/trpc/routers/agent-runtime.ts",
      "utf8",
    )

    expect(appRouter).toContain("agentRuntime: agentRuntimeRouter")
    expect(runtimeRouter).toContain("listManifests")
    expect(runtimeRouter).toContain("getManifest")
    expect(runtimeRouter).toContain("checkCapability")
    expect(runtimeRouter).toContain("respondScopeExpansion")
    expect(runtimeRouter).toContain("getQwenCliStatus")
    expect(runtimeRouter).toContain("updateQwenExecutablePath")
    expect(runtimeRouter).toContain("resetQwenExecutablePath")
    expect(runtimeRouter).toContain("chat: publicProcedure")
    expect(runtimeRouter).toContain('runtimeId: z.literal("qwen-code")')
    expect(runtimeRouter).toContain("shouldEnableQwenCodeRuntime(process.env)")
    expect(runtimeRouter).toContain("verifyDesktopRunPreflight")
    expect(runtimeRouter).toContain("resolveQwenCliSetupStatus")
    expect(runtimeRouter).toContain("createAndRegisterDesktopChatAgentJob")
    expect(runtimeRouter).toContain("createQwenAcpClientAdapter")
    expect(runtimeRouter).toContain("executable: qwenCli.executablePath")
  })

  test("renderer consumes runtime manifests through a store instead of static capability truth", () => {
    const runtimeManifestStore = readFileSync(
      "src/renderer/features/agents/lib/runtime-manifest-store.ts",
      "utf8",
    )
    const activeChat = readFileSync(
      "src/renderer/features/agents/main/active-chat.tsx",
      "utf8",
    )
    const guardedRunCard = readFileSync(
      "src/renderer/features/agents/ui/agent-guarded-run-card.tsx",
      "utf8",
    )

    expect(runtimeManifestStore).toContain(
      "trpc.agentRuntime.listManifests.useQuery",
    )
    expect(runtimeManifestStore).toContain("runtimeCapabilityManifestsAtom")
    expect(activeChat).toContain("useRuntimeCapabilitySupported")
    expect(activeChat).toContain('"rollback"')
    expect(activeChat).not.toContain(
      "isRuntimeCapabilitySupported } from \"../../../../shared/agent-runtime-capabilities\"",
    )
    expect(guardedRunCard).not.toContain("isRuntimeCapabilitySupported")
  })

  test("Qwen permission approval uses the runtime route and shared question state", () => {
    const runtimeRouter = readFileSync(
      "src/main/lib/trpc/routers/agent-runtime.ts",
      "utf8",
    )
    const activeChat = readFileSync(
      "src/renderer/features/agents/main/active-chat.tsx",
      "utf8",
    )
    const qwenTransport = readFileSync(
      "src/renderer/features/agents/lib/qwen-chat-transport.ts",
      "utf8",
    )

    expect(runtimeRouter).toContain("pendingQwenToolApprovals")
    expect(runtimeRouter).toContain("registerPendingPermission")
    expect(runtimeRouter).toContain("respondToolApproval")
    expect(qwenTransport).toContain("applyRuntimeEventStateChunk")
    expect(activeChat).toContain('provider === "qwen-code"')
    expect(activeChat).toContain(
      "trpcClient.agentRuntime.respondToolApproval.mutate(input)",
    )
  })
})
