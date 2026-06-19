import { beforeEach, describe, expect, mock, test } from "bun:test"
import { buildPluginManifestReviewDocument } from "../src/shared/plugin-update-review"

interface MockCodexPlugin {
  runtime: "codex"
  reviewKey: string
  name: string
  version: string
  path: string
  installRoot: string
  source: string
  marketplace: string
  sourceKind: "cache"
  sourceTrust: "official"
  diagnostics: []
  sourcePins: Array<{ kind: "cache-version"; value: string }>
  targetMode: "manifest-only"
  executionStatus: "not-run-by-locus"
  updatePosture: "review-before-enable"
}

interface MockClaudePlugin {
  runtime: "claude"
  reviewKey: string
  name: string
  version: string
  path: string
  installRoot: string
  source: string
  marketplace: string
  sourceKind: "local-marketplace"
  sourceTrust: "official"
  diagnostics: []
  sourcePins: Array<{ kind: "store-package-sha256"; value: string }>
  targetMode: "manifest-only"
  executionStatus: "not-run-by-locus"
  updatePosture: "review-before-enable"
}

interface MockPluginReviewScanInput {
  pluginKey: string
  runtimeNativeActivationIdentity: {
    identityFingerprint: string
    status: "complete" | "identity-incomplete"
    missingFields: string[]
  }
}

type MockPlugin = MockCodexPlugin | MockClaudePlugin

type MockScopedSelections = {
  projects: Record<
    string,
    {
      mode: "inherit" | "custom"
      enabledPluginReviewKeys: string[]
      updatedAt: string
    }
  >
  chats: Record<
    string,
    {
      mode: "inherit" | "custom"
      enabledPluginReviewKeys: string[]
      updatedAt: string
    }
  >
  subChats: Record<
    string,
    {
      mode: "inherit" | "custom"
      enabledPluginReviewKeys: string[]
      updatedAt: string
    }
  >
}

let plugins: MockCodexPlugin[] = []
let claudePlugins: MockClaudePlugin[] = []
let enablement: Record<string, { enabled: boolean; updatedAt: string }> = {}
let scopedSelections: MockScopedSelections = {
  projects: {},
  chats: {},
  subChats: {},
}
let reviewStatuses: Record<
  string,
  "new" | "unchanged" | "changed" | "reviewed"
> = {}
let safeModeEnabled = false

mock.module("../src/main/lib/plugins", () => ({
  discoverCodexInstalledPlugins: async () => plugins,
  discoverInstalledPlugins: async () => claudePlugins,
  discoverPluginMcpServers: async () => [],
}))

mock.module("../src/main/lib/plugins/review-scan", () => ({
  scanPluginReviewDocument: async (plugin: MockPlugin) => {
    if (plugin.source.includes("broken")) {
      throw new Error("broken plugin metadata")
    }
    const hasMcpServers = plugin.source.includes("cloudflare")
    const reviewDocument = buildPluginManifestReviewDocument({
      runtime: plugin.runtime,
      source: plugin.source,
      marketplace: plugin.marketplace,
      name: plugin.name,
      version: plugin.version,
      targetMode: "manifest-only",
      executionStatus: "not-run-by-locus",
      updatePosture: "review-before-enable",
      componentPaths: hasMcpServers
        ? {
            skills: `${plugin.path}/skills`,
            mcpServers: `${plugin.path}/.mcp.json`,
          }
        : { skills: `${plugin.path}/skills` },
      components: hasMcpServers
        ? { skills: 1, mcpServers: ["cloudflare"] }
        : { skills: 1 },
      sourcePins: plugin.sourcePins,
    })
    return {
      components: {
        commands: [],
        skills: ["SKILL.md"],
        agents: [],
        mcpServers: hasMcpServers ? ["cloudflare"] : [],
      },
      targetModeSummary: {
        targetMode: "manifest-only",
        executionStatus: "not-run-by-locus",
        updatePosture: "review-before-enable",
      },
      controlledUi: {},
      developerTrusted: {},
      reviewDocument,
    }
  },
}))

mock.module("../src/main/lib/plugins/update-review-state", () => ({
  getEffectiveRuntimeNativePluginEnablementState: async (
    context?: { subChatId?: string | null },
  ) => {
    if (context?.subChatId === "sub-scoped") {
      return {
        scope: "subChat",
        scopeId: "sub-scoped",
        mode: "custom",
        enablement: Object.fromEntries(
          Object.entries(enablement).filter(([pluginKey]) =>
            pluginKey.endsWith(":figma"),
          ),
        ),
      }
    }
    return {
      scope: "global",
      mode: "global",
      enablement,
    }
  },
  getRuntimeNativePluginScopedSelectionsState: async () => scopedSelections,
  resolveRuntimeNativePluginEffectiveEnablement: (input: {
    globalEnablement: Record<string, { enabled: boolean; updatedAt: string }>
    scopedSelections?: MockScopedSelections
    context?: {
      projectId?: string | null
      chatId?: string | null
      subChatId?: string | null
    }
  }) => {
    const subChatId = input.context?.subChatId
    const record =
      subChatId && input.scopedSelections?.subChats[subChatId]?.mode === "custom"
        ? input.scopedSelections.subChats[subChatId]
        : null
    if (!record || !subChatId) {
      return {
        scope: "global",
        mode: "global",
        enablement: input.globalEnablement,
      }
    }

    return {
      scope: "subChat",
      scopeId: subChatId,
      mode: "custom",
      enablement: Object.fromEntries(
        record.enabledPluginReviewKeys.flatMap((pluginReviewKey) => {
          const globalRecord = input.globalEnablement[pluginReviewKey]
          return globalRecord?.enabled === true
            ? [[pluginReviewKey, { enabled: true, updatedAt: record.updatedAt }]]
            : []
        }),
      ),
    }
  },
  hashPluginManifestReviewDocument: (document: { source: string }) =>
    `manifest:${document.source}`,
  recordPluginReviewScans: async (inputs: MockPluginReviewScanInput[]) => ({
    safeMode: { enabled: safeModeEnabled },
    state: { schemaVersion: 1, plugins: {} },
    metadataByPluginKey: Object.fromEntries(
      inputs.map((input) => {
        const identity = input.runtimeNativeActivationIdentity
        const status = reviewStatuses[input.pluginKey] ?? "new"
        return [
          input.pluginKey,
          {
            fingerprint: `fingerprint:${input.pluginKey}`,
            status,
            lastReviewedFingerprint:
              status === "reviewed"
                ? `fingerprint:${input.pluginKey}`
                : undefined,
            runtimeNativeActivation: {
              identityFingerprint: identity.identityFingerprint,
              identityStatus: identity.status,
              reviewStatus:
                status === "reviewed" ? "reviewed" : "identity-unreviewed",
              lastReviewedIdentityFingerprint:
                status === "reviewed"
                  ? identity.identityFingerprint
                  : undefined,
              missingFields: identity.missingFields,
            },
            sourcePins: [],
            changes: [],
          },
        ]
      }),
    ),
  }),
}))

const allowlist = await import(
  "../src/main/lib/codex/app-server-plugin-allowlist"
)
const runtimeGates = await import("../src/main/lib/plugins/runtime-gates")

function codexPlugin(name: string, version = "7118aaa3") {
  return {
    runtime: "codex",
    reviewKey: `codex:openai-curated:${name}`,
    name,
    version,
    path: `/plugins/openai-curated/${name}/${version}`,
    installRoot: "/plugins",
    source: `openai-curated:${name}@${version}`,
    marketplace: "openai-curated",
    sourceKind: "cache",
    sourceTrust: "official",
    diagnostics: [],
    sourcePins: [{ kind: "cache-version", value: version }],
    targetMode: "manifest-only",
    executionStatus: "not-run-by-locus",
    updatePosture: "review-before-enable",
  }
}

function claudePlugin(name: string): MockClaudePlugin {
  return {
    runtime: "claude",
    reviewKey: `claude:market:${name}`,
    name,
    version: "1.0.0",
    path: `/plugins/${name}`,
    installRoot: "/plugins",
    source: `market:${name}`,
    marketplace: "market",
    sourceKind: "local-marketplace",
    sourceTrust: "official",
    diagnostics: [],
    sourcePins: [{ kind: "store-package-sha256", value: `sha256-${name}` }],
    targetMode: "manifest-only",
    executionStatus: "not-run-by-locus",
    updatePosture: "review-before-enable",
  }
}

describe("Codex app-server plugin allowlist resolver", () => {
  beforeEach(() => {
    plugins = []
    claudePlugins = []
    enablement = {}
    scopedSelections = {
      projects: {},
      chats: {},
      subChats: {},
    }
    reviewStatuses = {}
    safeModeEnabled = false
  })

  test("enables reviewed Codex plugins through isolated app-server home control", async () => {
    plugins = [
      codexPlugin("figma"),
      codexPlugin("github"),
      codexPlugin("cloudflare"),
    ]
    enablement = {
      "codex:openai-curated:figma": {
        enabled: true,
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
      "codex:openai-curated:cloudflare": {
        enabled: true,
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    }
    reviewStatuses = {
      "codex:openai-curated:figma": "reviewed",
      "codex:openai-curated:github": "reviewed",
      "codex:openai-curated:cloudflare": "reviewed",
    }

    const result = await allowlist.resolveCodexAppServerPluginConfigOverrides()

    expect(result.config).toEqual({
      "plugins.cloudflare@openai-curated.enabled": false,
      "plugins.figma@openai-curated.enabled": true,
      "plugins.github@openai-curated.enabled": false,
    })
    expect(
      result.entries.find((entry) => entry.pluginId === "figma@openai-curated")
        ?.nativeActivationPolicy.reasons,
    ).toEqual([])
    expect(
      result.entries.find((entry) => entry.pluginId === "figma@openai-curated"),
    ).toMatchObject({
      pluginPath: "/plugins/openai-curated/figma/7118aaa3",
      cacheCoordinates: {
        marketplace: "openai-curated",
        name: "figma",
        version: "7118aaa3",
      },
    })
    expect(
      result.entries.find(
        (entry) => entry.pluginId === "cloudflare@openai-curated",
      )?.nativeActivationPolicy.reasons,
    ).toEqual(["mcp-approval-required"])
    expect(
      result.entries.find((entry) => entry.pluginId === "github@openai-curated")
        ?.nativeActivationPolicy.reasons,
    ).toEqual(["plugin-disabled"])
  })

  test("safe mode overrides otherwise eligible Codex native plugins", async () => {
    plugins = [codexPlugin("figma")]
    enablement = {
      "codex:openai-curated:figma": {
        enabled: true,
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    }
    reviewStatuses = {
      "codex:openai-curated:figma": "reviewed",
    }
    safeModeEnabled = true

    const result = await allowlist.resolveCodexAppServerPluginConfigOverrides()

    expect(result.config).toEqual({
      "plugins.figma@openai-curated.enabled": false,
    })
    expect(result.entries[0].nativeActivationPolicy.reasons).toEqual([
      "global-safe-mode",
    ])
  })

  test("fails closed for a Codex plugin scan failure without blocking other plugins", async () => {
    plugins = [codexPlugin("figma"), codexPlugin("broken")]
    enablement = {
      "codex:openai-curated:figma": {
        enabled: true,
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
      "codex:openai-curated:broken": {
        enabled: true,
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    }
    reviewStatuses = {
      "codex:openai-curated:figma": "reviewed",
    }

    const result = await allowlist.resolveCodexAppServerPluginConfigOverrides()

    expect(result.config).toEqual({
      "plugins.broken@openai-curated.enabled": false,
      "plugins.figma@openai-curated.enabled": true,
    })
    expect(
      result.entries.find((entry) => entry.pluginId === "broken@openai-curated")
        ?.nativeActivationPolicy,
    ).toMatchObject({
      status: "blocked",
      canActivateNative: false,
      reasons: ["native-load-failed"],
    })
  })

  test("applies scoped Codex plugin selection before app-server staging", async () => {
    plugins = [codexPlugin("figma"), codexPlugin("github")]
    enablement = {
      "codex:openai-curated:figma": {
        enabled: true,
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
      "codex:openai-curated:github": {
        enabled: true,
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    }
    reviewStatuses = {
      "codex:openai-curated:figma": "reviewed",
      "codex:openai-curated:github": "reviewed",
    }

    const result = await allowlist.resolveCodexAppServerPluginConfigOverrides({
      subChatId: "sub-scoped",
    })

    expect(result.config).toEqual({
      "plugins.figma@openai-curated.enabled": true,
      "plugins.github@openai-curated.enabled": false,
    })
    expect(
      result.entries.find((entry) => entry.pluginId === "github@openai-curated")
        ?.nativeActivationPolicy.reasons,
    ).toEqual(["plugin-disabled"])
  })
})

describe("Claude native plugin runtime gates", () => {
  beforeEach(() => {
    plugins = []
    claudePlugins = []
    enablement = {}
    scopedSelections = {
      projects: {},
      chats: {},
      subChats: {},
    }
    reviewStatuses = {}
    safeModeEnabled = false
  })

  test("applies scoped plugin selection before Claude native staging", async () => {
    claudePlugins = [claudePlugin("figma"), claudePlugin("github")]
    scopedSelections.subChats["sub-scoped"] = {
      mode: "custom",
      enabledPluginReviewKeys: ["claude:market:figma"],
      updatedAt: "2026-06-19T00:00:00.000Z",
    }
    reviewStatuses = {
      "claude:market:figma": "reviewed",
      "claude:market:github": "reviewed",
    }

    const result =
      await runtimeGates.discoverAllowedClaudeNativePluginRuntimeComponents({
        enabledPluginSources: ["market:figma", "market:github"],
        approvedPluginMcpServerIdentifiers: [],
        scopeContext: {
          subChatId: "sub-scoped",
        },
      })

    expect(result.map((entry) => entry.pluginSource)).toEqual(["market:figma"])
  })
})
