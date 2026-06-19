import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildPluginManifestReviewDocument,
  diffPluginManifestReviewDocuments,
  type PluginManifestReviewDocument,
  stableJsonStringify,
} from "../src/shared/plugin-update-review"

let userDataDir = ""

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return userDataDir
    },
  },
}))

const reviewState = await import("../src/main/lib/plugins/update-review-state")
const runtimeNativeActivation = await import(
  "../src/main/lib/plugins/runtime-native-activation"
)

function reviewDocument(overrides: Partial<PluginManifestReviewDocument> = {}) {
  return buildPluginManifestReviewDocument({
    runtime: overrides.runtime ?? "codex",
    source: overrides.source ?? "openai-curated:figma@45fe2bdd",
    marketplace: overrides.marketplace ?? "openai-curated",
    name: overrides.name ?? "Figma",
    version: overrides.version ?? "2.0.7",
    targetMode: overrides.targetMode ?? "manifest-only",
    executionStatus: overrides.executionStatus ?? "not-run-by-locus",
    updatePosture: overrides.updatePosture ?? "advisory-only",
    category: overrides.category ?? "Design",
    homepage: overrides.homepage ?? "https://www.figma.com",
    tags: overrides.tags ?? ["design", "figma"],
    componentPaths: overrides.componentPaths ?? {
      skills: "/plugin/skills",
      mcpServers: "/plugin/.mcp.json",
    },
    components: overrides.components ?? {
      commands: 0,
      skills: 7,
      agents: 0,
      mcpServers: ["figma"],
    },
    sourcePins: overrides.sourcePins ?? [
      {
        kind: "lock-source-ref",
        value: "500e8738438ed1204eaf23e61280d872f47534fd",
        repo: "figma/mcp-server-guide",
        path: "skills/figma-use",
      },
    ],
    developerTrusted: overrides.developerTrusted,
  })
}

describe("plugin update review documents", () => {
  test("serializes deterministically and hashes sorted review metadata", () => {
    const first = reviewDocument({
      tags: ["figma", "design"],
      sourcePins: [
        { kind: "lock-source-ref", value: "b" },
        { kind: "cache-version", value: "45fe2bdd" },
      ],
    })
    const second = reviewDocument({
      tags: ["design", "figma"],
      sourcePins: [
        { kind: "cache-version", value: "45fe2bdd" },
        { kind: "lock-source-ref", value: "b" },
      ],
    })

    expect(stableJsonStringify(first)).toBe(stableJsonStringify(second))
    expect(reviewState.hashPluginManifestReviewDocument(first)).toBe(
      reviewState.hashPluginManifestReviewDocument(second),
    )
  })

  test("diffs bounded manifest review fields without source code", () => {
    const previous = reviewDocument()
    const current = reviewDocument({
      version: "2.0.8",
      components: {
        commands: 0,
        skills: 7,
        agents: 0,
        hooks: 1,
        mcpServers: ["figma", "figma-write"],
      },
      sourcePins: [{ kind: "cache-version", value: "next-pin" }],
    })

    expect(diffPluginManifestReviewDocuments(previous, current)).toEqual([
      { field: "version", previous: "2.0.7", current: "2.0.8" },
      { field: "hooks", previous: "0", current: "1" },
      { field: "mcpServers", previous: "figma", current: "figma, figma-write" },
      {
        field: "sourcePins",
        previous:
          '{"kind":"lock-source-ref","path":"skills/figma-use","repo":"figma/mcp-server-guide","value":"500e8738438ed1204eaf23e61280d872f47534fd"}',
        current: '{"kind":"cache-version","value":"next-pin"}',
      },
    ])
  })

  test("serializes and diffs developer trusted executable metadata", () => {
    const previous = reviewDocument({
      targetMode: "developer-trusted-code",
      executionStatus: "developer-trusted-code",
      updatePosture: "review-before-enable",
      developerTrusted: {
        manifestPresent: true,
        id: "local.example.dev",
        name: "Dev",
        version: "0.1.0",
        entry: "dist/index.js",
        entryRealPath: "/tmp/plugin/dist/index.js",
        entryContentHash: "hash-a",
        permissions: ["local-code"],
        capabilities: ["settings-panel"],
        diagnostics: [],
        ignoredUnknownFields: [],
      },
    })
    const current = reviewDocument({
      targetMode: "developer-trusted-code",
      executionStatus: "developer-trusted-code",
      updatePosture: "review-before-enable",
      developerTrusted: {
        manifestPresent: true,
        id: "local.example.dev",
        name: "Dev",
        version: "0.1.0",
        entry: "dist/index.js",
        entryRealPath: "/tmp/plugin/dist/index.js",
        entryContentHash: "hash-b",
        permissions: ["local-code"],
        capabilities: ["settings-panel"],
        diagnostics: [],
        ignoredUnknownFields: [],
      },
    })

    expect(stableJsonStringify(previous)).toContain("entryContentHash")
    expect(diffPluginManifestReviewDocuments(previous, current)).toContainEqual(
      expect.objectContaining({
        field: "developerTrusted",
      }),
    )
  })

  test("builds MCP approval identifiers from redacted current config metadata", () => {
    const config = {
      command: "node",
      args: ["server.js", "--api-key", "sk-secret-value", "--env=TOKEN=secret"],
      cwd: "/workspace/plugin",
      env: {
        OPENAI_API_KEY: "raw-env-secret",
      },
      headers: {
        Authorization: "Bearer raw-header-secret",
      },
      url: "https://example.test/mcp?token=raw-url-secret",
    }
    const document = reviewState.buildPluginMcpApprovalDocument({
      pluginSource: "market:plugin",
      serverName: "context",
      config,
    })
    const serialized = stableJsonStringify(document)

    expect(serialized).not.toContain("sk-secret-value")
    expect(serialized).not.toContain("raw-env-secret")
    expect(serialized).not.toContain("raw-header-secret")
    expect(serialized).not.toContain("raw-url-secret")
    expect(document.env).toEqual([
      {
        key: "OPENAI_API_KEY",
        hasValue: true,
        valueSource: "inline",
      },
    ])
    expect(document.headers).toEqual([
      {
        key: "Authorization",
        hasValue: true,
        valueSource: "inline",
      },
    ])

    const identifier = reviewState.buildCurrentPluginMcpApprovalIdentifier({
      pluginSource: "market:plugin",
      serverName: "context",
      config,
    })
    const changedIdentifier =
      reviewState.buildCurrentPluginMcpApprovalIdentifier({
        pluginSource: "market:plugin",
        serverName: "context",
        config: {
          ...config,
          command: "python",
        },
      })

    expect(identifier.startsWith("market:plugin:context#mcp-sha256:")).toBe(
      true,
    )
    expect(identifier).not.toBe("market:plugin:context")
    expect(changedIdentifier).not.toBe(identifier)
  })
})

describe("plugin update review state", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-plugin-review-"))
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
    userDataDir = ""
  })

  test("records new, unchanged, reviewed, and changed states locally", async () => {
    const statePath = join(userDataDir, "plugin-review-state.json")
    const pluginKey = "codex:openai-curated:figma"
    const firstDocument = reviewDocument()

    const firstScan = await reviewState.recordPluginReviewScans(
      [{ pluginKey, document: firstDocument }],
      statePath,
      new Date("2026-06-02T00:00:00Z"),
    )
    expect(firstScan.metadataByPluginKey[pluginKey]).toMatchObject({
      status: "new",
      changes: [],
    })

    const secondScan = await reviewState.recordPluginReviewScans(
      [{ pluginKey, document: firstDocument }],
      statePath,
      new Date("2026-06-02T00:01:00Z"),
    )
    expect(secondScan.metadataByPluginKey[pluginKey].status).toBe("unchanged")

    const reviewed = await reviewState.markPluginFingerprintReviewed(
      { pluginKey, document: firstDocument },
      statePath,
      new Date("2026-06-02T00:02:00Z"),
    )
    expect(reviewed.status).toBe("reviewed")
    expect(reviewed.lastReviewedAt).toBe("2026-06-02T00:02:00.000Z")

    const changedDocument = reviewDocument({ version: "2.0.8" })
    const changedScan = await reviewState.recordPluginReviewScans(
      [{ pluginKey, document: changedDocument }],
      statePath,
      new Date("2026-06-02T00:03:00Z"),
    )
    expect(changedScan.metadataByPluginKey[pluginKey]).toMatchObject({
      status: "changed",
      lastReviewedAt: "2026-06-02T00:02:00.000Z",
      changes: [{ field: "version", previous: "2.0.7", current: "2.0.8" }],
    })
  })

  test("records runtime-native activation identity review state separately", async () => {
    const statePath = join(userDataDir, "plugin-review-state.json")
    const pluginKey = "claude:anthropic:context-tools"
    const document = reviewDocument({
      runtime: "claude",
      source: "anthropic:context-tools@0.1.0",
      marketplace: "anthropic",
      version: "0.1.0",
    })
    const reviewFingerprint =
      reviewState.hashPluginManifestReviewDocument(document)
    const identity =
      runtimeNativeActivation.buildRuntimeNativeActivationIdentity({
        reviewDocument: document,
        reviewFingerprint,
        packageHash: "sha256:package-a",
      })

    const firstScan = await reviewState.recordPluginReviewScans(
      [{ pluginKey, document, runtimeNativeActivationIdentity: identity }],
      statePath,
      new Date("2026-06-02T00:00:00Z"),
    )
    expect(
      firstScan.metadataByPluginKey[pluginKey].runtimeNativeActivation,
    ).toMatchObject({
      identityFingerprint: identity.identityFingerprint,
      identityStatus: "complete",
      reviewStatus: "identity-unreviewed",
      missingFields: [],
    })

    const reviewed = await reviewState.markPluginFingerprintReviewed(
      { pluginKey, document, runtimeNativeActivationIdentity: identity },
      statePath,
      new Date("2026-06-02T00:01:00Z"),
    )
    expect(reviewed.runtimeNativeActivation).toMatchObject({
      identityFingerprint: identity.identityFingerprint,
      identityStatus: "complete",
      reviewStatus: "reviewed",
      lastReviewedIdentityFingerprint: identity.identityFingerprint,
    })

    const driftedIdentity =
      runtimeNativeActivation.buildRuntimeNativeActivationIdentity({
        reviewDocument: document,
        reviewFingerprint,
        packageHash: "sha256:package-b",
      })
    const driftedScan = await reviewState.recordPluginReviewScans(
      [
        {
          pluginKey,
          document,
          runtimeNativeActivationIdentity: driftedIdentity,
        },
      ],
      statePath,
      new Date("2026-06-02T00:02:00Z"),
    )
    expect(driftedScan.metadataByPluginKey[pluginKey]).toMatchObject({
      status: "reviewed",
      runtimeNativeActivation: {
        identityFingerprint: driftedIdentity.identityFingerprint,
        identityStatus: "complete",
        reviewStatus: "identity-drifted",
        lastReviewedIdentityFingerprint: identity.identityFingerprint,
      },
    })
  })

  test("keeps identity-incomplete activation state blocked after manifest review", async () => {
    const statePath = join(userDataDir, "plugin-review-state.json")
    const pluginKey = "claude:local:missing-pins"
    const document = reviewDocument({
      runtime: "claude",
      source: "local:missing-pins",
      sourcePins: [],
    })
    const identity =
      runtimeNativeActivation.buildRuntimeNativeActivationIdentity({
        reviewDocument: document,
        reviewFingerprint:
          reviewState.hashPluginManifestReviewDocument(document),
      })

    const reviewed = await reviewState.markPluginFingerprintReviewed(
      { pluginKey, document, runtimeNativeActivationIdentity: identity },
      statePath,
      new Date("2026-06-02T00:01:00Z"),
    )

    expect(reviewed.status).toBe("reviewed")
    expect(reviewed.runtimeNativeActivation).toMatchObject({
      identityFingerprint: identity.identityFingerprint,
      identityStatus: "identity-incomplete",
      reviewStatus: "identity-incomplete",
      lastReviewedIdentityFingerprint: identity.identityFingerprint,
      missingFields: ["drift-detection-field"],
    })
  })

  test("stores runtime-native enablement separately from manifest review", async () => {
    const statePath = join(userDataDir, "plugin-review-state.json")
    const pluginKey = "codex:openai-curated:figma"
    const document = reviewDocument()

    await expect(
      reviewState.setRuntimeNativePluginEnabled(
        { pluginReviewKey: pluginKey, enabled: true },
        statePath,
        new Date("2026-06-02T00:03:00Z"),
      ),
    ).resolves.toEqual({
      enabled: true,
      updatedAt: "2026-06-02T00:03:00.000Z",
    })

    const scan = await reviewState.recordPluginReviewScans(
      [{ pluginKey, document }],
      statePath,
      new Date("2026-06-02T00:04:00Z"),
    )

    expect(scan.metadataByPluginKey[pluginKey].status).toBe("new")
    await expect(
      reviewState.getRuntimeNativePluginEnablementState(statePath),
    ).resolves.toEqual({
      [pluginKey]: {
        enabled: true,
        updatedAt: "2026-06-02T00:03:00.000Z",
      },
    })
  })

  test("resolves scoped runtime-native plugin selections with specific-scope precedence", async () => {
    const statePath = join(userDataDir, "plugin-review-state.json")
    await reviewState.setRuntimeNativePluginEnabled(
      { pluginReviewKey: "codex:openai-curated:figma", enabled: true },
      statePath,
      new Date("2026-06-02T00:03:00Z"),
    )
    await reviewState.setRuntimeNativePluginEnabled(
      { pluginReviewKey: "codex:openai-curated:github", enabled: true },
      statePath,
      new Date("2026-06-02T00:04:00Z"),
    )
    await reviewState.setRuntimeNativePluginEnabled(
      { pluginReviewKey: "codex:openai-curated:blocked", enabled: false },
      statePath,
      new Date("2026-06-02T00:05:00Z"),
    )

    await reviewState.setRuntimeNativePluginScopedSelection(
      {
        scope: { kind: "project", id: "project-1" },
        mode: "custom",
        enabledPluginReviewKeys: ["codex:openai-curated:github"],
      },
      statePath,
      new Date("2026-06-02T00:06:00Z"),
    )
    await reviewState.setRuntimeNativePluginScopedSelection(
      {
        scope: { kind: "chat", id: "chat-1" },
        mode: "inherit",
      },
      statePath,
      new Date("2026-06-02T00:07:00Z"),
    )
    await reviewState.setRuntimeNativePluginScopedSelection(
      {
        scope: { kind: "subChat", id: "sub-1" },
        mode: "custom",
        enabledPluginReviewKeys: [
          "codex:openai-curated:figma",
          "codex:openai-curated:blocked",
        ],
      },
      statePath,
      new Date("2026-06-02T00:08:00Z"),
    )

    await expect(
      reviewState.getEffectiveRuntimeNativePluginEnablementState(
        { projectId: "project-1", chatId: "chat-1", subChatId: "sub-1" },
        statePath,
      ),
    ).resolves.toMatchObject({
      scope: "subChat",
      scopeId: "sub-1",
      mode: "custom",
      enablement: {
        "codex:openai-curated:figma": {
          enabled: true,
          updatedAt: "2026-06-02T00:08:00.000Z",
        },
      },
    })

    await expect(
      reviewState.getEffectiveRuntimeNativePluginEnablementState(
        { projectId: "project-1", chatId: "chat-1", subChatId: "sub-2" },
        statePath,
      ),
    ).resolves.toMatchObject({
      scope: "project",
      scopeId: "project-1",
      mode: "custom",
      enablement: {
        "codex:openai-curated:github": {
          enabled: true,
          updatedAt: "2026-06-02T00:06:00.000Z",
        },
      },
    })
  })

  test("persists plugin safe mode without deleting review records", async () => {
    const statePath = join(userDataDir, "plugin-review-state.json")
    const pluginKey = "codex:openai-curated:figma"
    const document = reviewDocument()

    await reviewState.markPluginFingerprintReviewed(
      { pluginKey, document },
      statePath,
      new Date("2026-06-02T00:02:00Z"),
    )

    await expect(
      reviewState.setPluginSafeModeEnabled(
        true,
        statePath,
        new Date("2026-06-02T00:03:00Z"),
      ),
    ).resolves.toEqual({
      enabled: true,
      updatedAt: "2026-06-02T00:03:00.000Z",
    })

    await expect(
      reviewState.getPluginSafeModeState(statePath),
    ).resolves.toEqual({
      enabled: true,
      updatedAt: "2026-06-02T00:03:00.000Z",
    })

    const scan = await reviewState.recordPluginReviewScans(
      [{ pluginKey, document }],
      statePath,
      new Date("2026-06-02T00:04:00Z"),
    )

    expect(scan.safeMode.enabled).toBe(true)
    expect(scan.metadataByPluginKey[pluginKey].status).toBe("reviewed")
  })

  test("persists developer mode, local sources, and fingerprint-bound trust", async () => {
    const statePath = join(userDataDir, "plugin-review-state.json")
    const sourcePath = await mkdtemp(join(tmpdir(), "locus-developer-source-"))
    try {
      const canonicalSourcePath = await realpath(sourcePath)
      const developerMode = await reviewState.setPluginDeveloperModeEnabled(
        true,
        statePath,
        new Date("2026-06-02T00:04:00Z"),
      )
      expect(developerMode).toEqual({
        enabled: true,
        updatedAt: "2026-06-02T00:04:00.000Z",
      })
      expect(await reviewState.getPluginDeveloperModeState(statePath)).toEqual(
        developerMode,
      )

      const source = await reviewState.addDeveloperPluginSource(
        sourcePath,
        statePath,
        new Date("2026-06-02T00:05:00Z"),
      )
      expect(source.path).toBe(canonicalSourcePath)
      expect(source.id).toMatch(/^[a-f0-9]{16}$/)
      expect(await reviewState.getDeveloperPluginSources(statePath)).toEqual([
        source,
      ])

      const replacedSource = await reviewState.addDeveloperPluginSource(
        sourcePath,
        statePath,
        new Date("2026-06-02T00:06:00Z"),
      )
      expect(replacedSource.id).toBe(source.id)
      expect(
        await reviewState.getDeveloperPluginSources(statePath),
      ).toHaveLength(1)

      const trustInput = {
        pluginReviewKey: `developer:${source.id}`,
        pluginFingerprint: "fingerprint-a",
        manifestId: "local.example.dev",
        entryPath: join(source.path, "dist", "index.js"),
        entryContentHash: "entry-hash-a",
        bundleContentHash: "bundle-hash-a",
        sourcePath: source.path,
      }
      const acknowledgement = await reviewState.trustDeveloperPluginFingerprint(
        trustInput,
        statePath,
        new Date("2026-06-02T00:07:00Z"),
      )
      expect(acknowledgement).toMatchObject({
        ...trustInput,
        trustedAt: "2026-06-02T00:07:00.000Z",
      })
      expect(
        await reviewState.getDeveloperPluginTrustStatus(trustInput, statePath),
      ).toMatchObject({ status: "current", acknowledgement })
      expect(
        await reviewState.getDeveloperPluginTrustStatus(
          {
            ...trustInput,
            entryContentHash: "entry-hash-b",
          },
          statePath,
        ),
      ).toMatchObject({ status: "stale" })
      expect(
        await reviewState.getDeveloperPluginTrustStatus(
          {
            ...trustInput,
            bundleContentHash: "bundle-hash-b",
          },
          statePath,
        ),
      ).toMatchObject({ status: "stale" })

      expect(
        await reviewState.revokeDeveloperPluginTrust(
          trustInput.pluginReviewKey,
          statePath,
        ),
      ).toEqual({ revoked: true })
      expect(
        await reviewState.getDeveloperPluginTrustStatus(trustInput, statePath),
      ).toEqual({ status: "missing", acknowledgement: undefined })

      expect(
        await reviewState.removeDeveloperPluginSource(source.id, statePath),
      ).toEqual({ removed: true })
      expect(await reviewState.getDeveloperPluginSources(statePath)).toEqual([])
    } finally {
      await rm(sourcePath, { recursive: true, force: true })
    }
  })

  test("extracts cache versions and lock source refs as advisory pins", async () => {
    const pluginRoot = await mkdtemp(join(tmpdir(), "locus-plugin-lock-"))
    try {
      await writeFile(
        join(pluginRoot, "plugin.lock.json"),
        JSON.stringify({
          skills: [
            {
              id: "figma-use",
              source: {
                type: "github",
                repo: "figma/mcp-server-guide",
                path: "skills/figma-use",
                ref: "500e8738438ed1204eaf23e61280d872f47534fd",
              },
            },
          ],
        }),
        "utf-8",
      )

      await expect(
        reviewState.extractCodexSourcePins(pluginRoot, "45fe2bdd"),
      ).resolves.toEqual([
        {
          kind: "cache-version",
          label: "Codex cache version",
          value: "45fe2bdd",
        },
        {
          kind: "lock-source-ref",
          label: "Lock source ref",
          path: "skills/figma-use",
          repo: "figma/mcp-server-guide",
          value: "500e8738438ed1204eaf23e61280d872f47534fd",
        },
      ])
    } finally {
      await rm(pluginRoot, { recursive: true, force: true })
    }
  })
})
