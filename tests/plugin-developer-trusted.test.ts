import { describe, expect, mock, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import type { PluginInfo } from "../src/main/lib/plugins"
import {
  buildDeveloperTrustedAcknowledgement,
  buildDeveloperTrustedReviewDocument,
  buildPluginDeveloperTrustedGate,
  getDeveloperTrustedStatus,
  parseDeveloperTrustedManifest,
} from "../src/shared/plugin-developer-trusted"
import { getDeveloperTrustedPluginTargetMode, getPluginDiagnostics } from "../src/shared/plugin-target-modes"
import { diffPluginManifestReviewDocuments } from "../src/shared/plugin-update-review"

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

const { scanPluginReviewDocument } = await import("../src/main/lib/plugins/review-scan")
const {
  addDeveloperPluginSource,
  setPluginDeveloperModeEnabled,
  setPluginSafeModeEnabled,
  markPluginFingerprintReviewed,
  trustDeveloperPluginFingerprint,
} = await import("../src/main/lib/plugins/update-review-state")
const {
  clearDeveloperPluginLoadStates,
  loadDeveloperTrustedPlugin,
} = await import("../src/main/lib/plugins/developer-loader")
const {
  clearPluginCache,
  discoverAllRuntimePlugins,
} = await import("../src/main/lib/plugins")
const { setElectronUserDataPathProviderForTest } = await import(
  "../src/main/lib/electron-app"
)

async function expectMissingFile(filePath: string) {
  try {
    await access(filePath)
    throw new Error(`expected ${filePath} to be missing`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("expected ")) {
      throw error
    }
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

async function createDeveloperPluginFixture(input: {
  entry?: string
  helper?: string
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "locus-developer-plugin-"))
  await mkdir(join(root, ".locus-plugin"))
  await mkdir(join(root, "dist"))
  await writeFile(
    join(root, "dist", "helper.js"),
    input.helper ?? "export const value = 'first'\n",
  )
  await writeFile(
    join(root, "dist", "index.mjs"),
    input.entry ?? [
      "import { value } from './helper.js'",
      "export default async function activate(api) {",
      "  const fs = await import('node:fs/promises')",
      "  await fs.writeFile(process.env.LOCUS_DEV_PLUGIN_MARKER, `${api.plugin.reviewKey}:${api.plugin.id}:${value}`)",
      "}",
      "",
    ].join("\n"),
  )
  await writeFile(join(root, ".locus-plugin", "developer.json"), JSON.stringify({
    schemaVersion: 1,
    id: "local.example.loader",
    name: "Loader",
    version: "0.1.0",
    entry: "./dist/index.mjs",
    permissions: ["local-code"],
    capabilities: ["activate"],
  }))
  return root
}

async function trustFixturePlugin(root: string) {
  const source = await addDeveloperPluginSource(root)
  clearPluginCache()
  const plugin = (await discoverAllRuntimePlugins()).find((candidate) =>
    candidate.sourceKind === "developer-local" && candidate.path === source.path
  )
  if (!plugin) throw new Error("developer plugin was not discovered")
  const scan = await scanPluginReviewDocument(plugin)
  const updateReview = await markPluginFingerprintReviewed({
    pluginKey: plugin.reviewKey,
    document: scan.reviewDocument,
  })
  await setPluginDeveloperModeEnabled(true)
  await setPluginSafeModeEnabled(false)
  const manifest = scan.developerTrusted.manifest
  const entryPath = scan.developerTrusted.entryRealPath
  const entryContentHash = scan.developerTrusted.entryContentHash
  const bundleContentHash = scan.developerTrusted.bundleContentHash
  if (!manifest || !entryPath || !entryContentHash || !bundleContentHash) {
    throw new Error("developer plugin fixture did not produce trust metadata")
  }
  await trustDeveloperPluginFingerprint({
    pluginReviewKey: plugin.reviewKey,
    pluginFingerprint: updateReview.fingerprint,
    manifestId: manifest.id,
    entryPath,
    entryContentHash,
    bundleContentHash,
    sourcePath: plugin.path,
  })
  return { plugin, scan, updateReview }
}

function pluginInfo(root: string): PluginInfo {
  return {
    runtime: "claude",
    reviewKey: "developer:local.example",
    name: "Local Example",
    version: "0.1.0",
    path: root,
    installRoot: root,
    source: "developer:local.example",
    marketplace: "developer",
    sourceKind: "local-marketplace",
    sourceTrust: "local",
    targetMode: "developer-trusted-code",
    executionStatus: "developer-trusted-code",
    updatePosture: "review-before-enable",
    diagnostics: [],
    sourcePins: [],
  }
}

describe("developer trusted plugin manifest schema", () => {
  test("parses bounded local developer plugin manifests without execution fields", () => {
    const result = parseDeveloperTrustedManifest({
      schemaVersion: 1,
      id: "local.example.reviewer",
      name: "Local Reviewer",
      version: "0.1.0",
      description: "Local developer automation.",
      author: "Ethan",
      entry: "./dist/index.js",
      minLocusVersion: "0.0.0",
      permissions: ["local-code", "filesystem.read"],
      capabilities: ["settings-panel", "command"],
      future: "ignored",
    })

    expect(result.manifest).toEqual({
      schemaVersion: 1,
      id: "local.example.reviewer",
      name: "Local Reviewer",
      version: "0.1.0",
      description: "Local developer automation.",
      author: "Ethan",
      entry: "dist/index.js",
      minLocusVersion: "0.0.0",
      permissions: ["filesystem.read", "local-code"],
      capabilities: ["command", "settings-panel"],
    })
    expect(result.ignoredUnknownFields).toEqual(["manifest.future"])
    expect(result.diagnostics).toContainEqual({
      code: "developer-manifest-unknown-field",
      severity: "warning",
      path: "manifest.future",
      message: "Developer plugin manifest ignored an unknown field.",
    })
  })

  test("rejects remote, absolute, escaping, unsafe, and overlarge manifest declarations", () => {
    expect(parseDeveloperTrustedManifest({
      schemaVersion: 1,
      id: "local.example.remote",
      name: "Remote",
      version: "0.1.0",
      entry: "https://example.com/plugin.js",
    }).diagnostics.map((diagnostic) => diagnostic.code)).toContain("developer-entry-remote")

    expect(parseDeveloperTrustedManifest({
      schemaVersion: 1,
      id: "local.example.absolute",
      name: "Absolute",
      version: "0.1.0",
      entry: "/tmp/plugin.js",
    }).diagnostics.map((diagnostic) => diagnostic.code)).toContain("developer-entry-outside-root")

    expect(parseDeveloperTrustedManifest({
      schemaVersion: 1,
      id: "local.example.escape",
      name: "Escape",
      version: "0.1.0",
      entry: "../outside.js",
    }).diagnostics.map((diagnostic) => diagnostic.code)).toContain("developer-entry-outside-root")

    expect(parseDeveloperTrustedManifest({
      schemaVersion: 1,
      id: "local.example.env",
      name: "Env",
      version: "0.1.0",
      entry: "./dist/index.js",
      env: { TOKEN: "inline" },
    }).diagnostics.map((diagnostic) => diagnostic.code)).toContain("developer-manifest-unsafe-field")

    expect(parseDeveloperTrustedManifest({
      schemaVersion: 1,
      id: "local.example.too-many",
      name: "Too Many",
      version: "0.1.0",
      entry: "./dist/index.js",
      permissions: Array.from({ length: 33 }, (_, index) => `permission.${index}`),
    }).diagnostics.map((diagnostic) => diagnostic.code)).toContain("developer-manifest-limit-exceeded")
  })

  test("builds review documents from manifest metadata and executable fingerprints", () => {
    const parseResult = parseDeveloperTrustedManifest({
      schemaVersion: 1,
      id: "local.example.hash",
      name: "Hash",
      version: "0.1.0",
      entry: "./dist/index.js",
      permissions: ["local-code"],
      capabilities: ["settings-panel"],
    })

    expect(buildDeveloperTrustedReviewDocument({
      parseResult,
      entryContentHash: "sha256:entry",
      entryRealPath: "/tmp/plugin/dist/index.js",
      bundleContentHash: "sha256:bundle",
      bundleFileCount: 2,
      bundleByteCount: 128,
    })).toEqual({
      manifestPresent: true,
      id: "local.example.hash",
      name: "Hash",
      version: "0.1.0",
      entry: "dist/index.js",
      entryContentHash: "sha256:entry",
      entryRealPath: "/tmp/plugin/dist/index.js",
      bundleContentHash: "sha256:bundle",
      bundleFileCount: 2,
      bundleByteCount: 128,
      permissions: ["local-code"],
      capabilities: ["settings-panel"],
      diagnostics: [],
      ignoredUnknownFields: [],
    })
  })
})

describe("developer trusted main-process review scan", () => {
  test("includes canonical entry content hashes in plugin review documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "locus-developer-plugin-"))
    userDataDir = await mkdtemp(join(tmpdir(), "locus-developer-userdata-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
    try {
      await mkdir(join(root, ".locus-plugin"))
      await mkdir(join(root, "dist"))
      await writeFile(join(root, "dist", "index.js"), "export default { name: 'first' }\n")
      await writeFile(join(root, ".locus-plugin", "developer.json"), JSON.stringify({
        schemaVersion: 1,
        id: "local.example.hash",
        name: "Hash",
        version: "0.1.0",
        entry: "./dist/index.js",
        permissions: ["local-code"],
        capabilities: ["settings-panel"],
      }))

      const scan = await scanPluginReviewDocument(pluginInfo(root))

      expect(scan.targetModeSummary).toEqual({
        targetMode: "developer-trusted-code",
        executionStatus: "developer-trusted-code",
        updatePosture: "review-before-enable",
      })
      expect(scan.developerTrusted.manifest?.id).toBe("local.example.hash")
      expect(scan.developerTrusted.entryContentHash).toMatch(/^[a-f0-9]{64}$/)
      expect(scan.developerTrusted.bundleContentHash).toMatch(/^[a-f0-9]{64}$/)
      expect(scan.reviewDocument.developerTrusted.entryContentHash).toBe(
        scan.developerTrusted.entryContentHash,
      )
      expect(scan.reviewDocument.developerTrusted.bundleContentHash).toBe(
        scan.developerTrusted.bundleContentHash,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(userDataDir, { recursive: true, force: true })
      setElectronUserDataPathProviderForTest(null)
      userDataDir = ""
    }
  })

  test("diffs developer trusted entry content changes as review metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "locus-developer-plugin-"))
    try {
      await mkdir(join(root, ".locus-plugin"))
      await mkdir(join(root, "dist"))
      const entryPath = join(root, "dist", "index.js")
      await writeFile(entryPath, "export default { name: 'first' }\n")
      await writeFile(join(root, ".locus-plugin", "developer.json"), JSON.stringify({
        schemaVersion: 1,
        id: "local.example.diff",
        name: "Diff",
        version: "0.1.0",
        entry: "./dist/index.js",
      }))

      const first = await scanPluginReviewDocument(pluginInfo(root))
      await writeFile(entryPath, "export default { name: 'second' }\n")
      const second = await scanPluginReviewDocument(pluginInfo(root))

      expect(first.reviewDocument.developerTrusted.entryContentHash).not.toBe(
        second.reviewDocument.developerTrusted.entryContentHash,
      )
      expect(diffPluginManifestReviewDocuments(
        first.reviewDocument,
        second.reviewDocument,
      )).toContainEqual(expect.objectContaining({
        field: "developerTrusted",
      }))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("diffs developer trusted bundle helper changes as review metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "locus-developer-plugin-"))
    try {
      await mkdir(join(root, ".locus-plugin"))
      await mkdir(join(root, "dist"))
      const helperPath = join(root, "dist", "helper.js")
      await writeFile(join(root, "dist", "index.js"), "import './helper.js'\nexport default {}\n")
      await writeFile(helperPath, "export const value = 'first'\n")
      await writeFile(join(root, ".locus-plugin", "developer.json"), JSON.stringify({
        schemaVersion: 1,
        id: "local.example.bundle-diff",
        name: "Bundle Diff",
        version: "0.1.0",
        entry: "./dist/index.js",
      }))

      const first = await scanPluginReviewDocument(pluginInfo(root))
      await writeFile(helperPath, "export const value = 'second'\n")
      const second = await scanPluginReviewDocument(pluginInfo(root))

      expect(first.reviewDocument.developerTrusted.entryContentHash).toBe(
        second.reviewDocument.developerTrusted.entryContentHash,
      )
      expect(first.reviewDocument.developerTrusted.bundleContentHash).not.toBe(
        second.reviewDocument.developerTrusted.bundleContentHash,
      )
      expect(diffPluginManifestReviewDocuments(
        first.reviewDocument,
        second.reviewDocument,
      )).toContainEqual(expect.objectContaining({
        field: "developerTrusted",
      }))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("blocks developer entry symlinks that escape the plugin root", async () => {
    const root = await mkdtemp(join(tmpdir(), "locus-developer-plugin-"))
    const outside = await mkdtemp(join(tmpdir(), "locus-developer-outside-"))
    try {
      await mkdir(join(root, ".locus-plugin"))
      await mkdir(join(root, "dist"))
      const outsideEntry = join(outside, "index.js")
      await writeFile(outsideEntry, "export default {}\n")
      await symlink(outsideEntry, join(root, "dist", "index.js"))
      await writeFile(join(root, ".locus-plugin", "developer.json"), JSON.stringify({
        schemaVersion: 1,
        id: "local.example.escape",
        name: "Escape",
        version: "0.1.0",
        entry: "./dist/index.js",
      }))

      const scan = await scanPluginReviewDocument(pluginInfo(root))

      expect(scan.developerTrusted.diagnostics).toContainEqual(expect.objectContaining({
        code: "developer-entry-outside-root",
        severity: "blocked",
      }))
      expect(scan.developerTrusted.entryContentHash).toBeUndefined()
      expect(scan.developerTrusted.bundleContentHash).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe("developer trusted plugin loader", () => {
  test("imports only reviewed and trusted local developer entrypoints", async () => {
    const previousMarker = process.env.LOCUS_DEV_PLUGIN_MARKER
    const root = await createDeveloperPluginFixture()
    userDataDir = await mkdtemp(join(tmpdir(), "locus-developer-userdata-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
    const markerPath = join(userDataDir, "marker.txt")
    process.env.LOCUS_DEV_PLUGIN_MARKER = markerPath
    try {
      clearDeveloperPluginLoadStates()
      const { plugin } = await trustFixturePlugin(root)

      const state = await loadDeveloperTrustedPlugin(plugin.reviewKey)

      expect(state.status).toBe("loaded")
      expect(state.entryContentHash).toMatch(/^[a-f0-9]{64}$/)
      expect(state.bundleContentHash).toMatch(/^[a-f0-9]{64}$/)
      expect(await readFile(markerPath, "utf-8")).toBe(
        `${plugin.reviewKey}:local.example.loader:first`,
      )
    } finally {
      restoreEnv("LOCUS_DEV_PLUGIN_MARKER", previousMarker)
      await rm(root, { recursive: true, force: true })
      await rm(userDataDir, { recursive: true, force: true })
      setElectronUserDataPathProviderForTest(null)
      userDataDir = ""
      clearPluginCache()
      clearDeveloperPluginLoadStates()
    }
  })

  test("blocks trusted developer entrypoints while plugin safe mode is enabled", async () => {
    const previousMarker = process.env.LOCUS_DEV_PLUGIN_MARKER
    const root = await createDeveloperPluginFixture()
    userDataDir = await mkdtemp(join(tmpdir(), "locus-developer-userdata-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
    const markerPath = join(userDataDir, "marker.txt")
    process.env.LOCUS_DEV_PLUGIN_MARKER = markerPath
    try {
      clearDeveloperPluginLoadStates()
      const { plugin } = await trustFixturePlugin(root)
      await setPluginSafeModeEnabled(true)

      const state = await loadDeveloperTrustedPlugin(plugin.reviewKey)

      expect(state.status).toBe("blocked")
      expect(state.gate?.reasons).toContain("safe-mode")
      await expectMissingFile(markerPath)
    } finally {
      restoreEnv("LOCUS_DEV_PLUGIN_MARKER", previousMarker)
      await rm(root, { recursive: true, force: true })
      await rm(userDataDir, { recursive: true, force: true })
      setElectronUserDataPathProviderForTest(null)
      userDataDir = ""
      clearPluginCache()
      clearDeveloperPluginLoadStates()
    }
  })

  test("blocks trusted developer entrypoints when forced startup safe mode is set", async () => {
    const previousMarker = process.env.LOCUS_DEV_PLUGIN_MARKER
    const previousForced = process.env.LOCUS_FORCE_PLUGIN_SAFE_MODE
    const root = await createDeveloperPluginFixture()
    userDataDir = await mkdtemp(join(tmpdir(), "locus-developer-userdata-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
    const markerPath = join(userDataDir, "marker.txt")
    process.env.LOCUS_DEV_PLUGIN_MARKER = markerPath
    process.env.LOCUS_FORCE_PLUGIN_SAFE_MODE = "1"
    try {
      clearDeveloperPluginLoadStates()
      const { plugin } = await trustFixturePlugin(root)
      await setPluginSafeModeEnabled(false)

      const state = await loadDeveloperTrustedPlugin(plugin.reviewKey)

      expect(state.status).toBe("blocked")
      expect(state.gate?.reasons).toContain("safe-mode")
      await expectMissingFile(markerPath)
    } finally {
      restoreEnv("LOCUS_DEV_PLUGIN_MARKER", previousMarker)
      restoreEnv("LOCUS_FORCE_PLUGIN_SAFE_MODE", previousForced)
      await rm(root, { recursive: true, force: true })
      await rm(userDataDir, { recursive: true, force: true })
      setElectronUserDataPathProviderForTest(null)
      userDataDir = ""
      clearPluginCache()
      clearDeveloperPluginLoadStates()
    }
  })

  test("blocks stale trust when helper bundle files change after trust", async () => {
    const previousMarker = process.env.LOCUS_DEV_PLUGIN_MARKER
    const root = await createDeveloperPluginFixture()
    userDataDir = await mkdtemp(join(tmpdir(), "locus-developer-userdata-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
    const markerPath = join(userDataDir, "marker.txt")
    process.env.LOCUS_DEV_PLUGIN_MARKER = markerPath
    try {
      clearDeveloperPluginLoadStates()
      const { plugin } = await trustFixturePlugin(root)
      await writeFile(join(root, "dist", "helper.js"), "export const value = 'second'\n")

      const state = await loadDeveloperTrustedPlugin(plugin.reviewKey)

      expect(state.status).toBe("blocked")
      expect(state.gate?.reasons).toContain("review-changed")
      expect(state.gate?.reasons).toContain("trust-stale")
      await expectMissingFile(markerPath)
    } finally {
      restoreEnv("LOCUS_DEV_PLUGIN_MARKER", previousMarker)
      await rm(root, { recursive: true, force: true })
      await rm(userDataDir, { recursive: true, force: true })
      setElectronUserDataPathProviderForTest(null)
      userDataDir = ""
      clearPluginCache()
      clearDeveloperPluginLoadStates()
    }
  })

  test("does not read overlarge developer manifests during source discovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "locus-developer-plugin-"))
    userDataDir = await mkdtemp(join(tmpdir(), "locus-developer-userdata-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
    try {
      await mkdir(join(root, ".locus-plugin"))
      await writeFile(join(root, ".locus-plugin", "developer.json"), " ".repeat(70 * 1024))
      const source = await addDeveloperPluginSource(root)
      clearPluginCache()

      const plugin = (await discoverAllRuntimePlugins()).find((candidate) =>
        candidate.sourceKind === "developer-local" && candidate.path === source.path
      )

      expect(plugin?.name).toBe(basename(source.path))
      expect(plugin?.version).toBe("0.0.0")
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(userDataDir, { recursive: true, force: true })
      setElectronUserDataPathProviderForTest(null)
      userDataDir = ""
      clearPluginCache()
    }
  })
})

describe("developer trusted plugin gates", () => {
  const allowedInput = {
    runtime: "claude" as const,
    targetMode: "developer-trusted-code" as const,
    updateReviewStatus: "reviewed" as const,
    safeModeEnabled: false,
    developerModeEnabled: true,
    isLocalDeveloperSource: true,
    hasValidManifest: true,
    entryContained: true,
    trustStatus: "current" as const,
  }

  test("allows loading only when developer mode, review, trust, and source gates all pass", () => {
    expect(buildPluginDeveloperTrustedGate(allowedInput)).toEqual({
      canTrustCurrentFingerprint: true,
      canLoadTrustedCode: true,
      reasons: [],
    })
  })

  test("blocks loading for safe mode, unreviewed fingerprints, stale trust, and nonlocal sources", () => {
    expect(buildPluginDeveloperTrustedGate({
      ...allowedInput,
      safeModeEnabled: true,
    })).toMatchObject({
      canTrustCurrentFingerprint: false,
      canLoadTrustedCode: false,
      reasons: ["safe-mode"],
    })

    expect(buildPluginDeveloperTrustedGate({
      ...allowedInput,
      updateReviewStatus: "changed",
    }).reasons).toContain("review-changed")

    expect(buildPluginDeveloperTrustedGate({
      ...allowedInput,
      trustStatus: "stale",
    }).reasons).toContain("trust-stale")

    expect(buildPluginDeveloperTrustedGate({
      ...allowedInput,
      isLocalDeveloperSource: false,
    }).reasons).toContain("unsupported-source")
  })

  test("keeps Codex cache and manifest-only packages out of developer trusted code", () => {
    expect(buildPluginDeveloperTrustedGate({
      ...allowedInput,
      runtime: "codex",
    }).reasons).toEqual(["codex-read-only-cache", "unsupported-runtime"])

    expect(buildPluginDeveloperTrustedGate({
      ...allowedInput,
      targetMode: "manifest-only",
    }).reasons).toContain("unsupported-target-mode")
  })

  test("binds trust acknowledgements to plugin, fingerprint, entry hash, and source path", () => {
    const acknowledgement = buildDeveloperTrustedAcknowledgement({
      pluginReviewKey: "developer:local.example",
      pluginFingerprint: "fingerprint-a",
      manifestId: "local.example",
      entryPath: "/tmp/plugin/dist/index.js",
      entryContentHash: "hash-a",
      bundleContentHash: "bundle-a",
      sourcePath: "/tmp/plugin",
      trustedAt: "2026-06-02T00:00:00.000Z",
    })

    expect(getDeveloperTrustedStatus(acknowledgement, {
      pluginReviewKey: "developer:local.example",
      pluginFingerprint: "fingerprint-a",
      manifestId: "local.example",
      entryPath: "/tmp/plugin/dist/index.js",
      entryContentHash: "hash-a",
      bundleContentHash: "bundle-a",
      sourcePath: "/tmp/plugin",
    })).toBe("current")

    expect(getDeveloperTrustedStatus(acknowledgement, {
      pluginReviewKey: "developer:local.example",
      pluginFingerprint: "fingerprint-b",
      manifestId: "local.example",
      entryPath: "/tmp/plugin/dist/index.js",
      entryContentHash: "hash-a",
      bundleContentHash: "bundle-a",
      sourcePath: "/tmp/plugin",
    })).toBe("stale")

    expect(getDeveloperTrustedStatus(acknowledgement, {
      pluginReviewKey: "developer:local.example",
      pluginFingerprint: "fingerprint-a",
      manifestId: "local.example",
      entryPath: "/tmp/plugin/dist/index.js",
      entryContentHash: "hash-b",
      bundleContentHash: "bundle-a",
      sourcePath: "/tmp/plugin",
    })).toBe("stale")

    expect(getDeveloperTrustedStatus(acknowledgement, {
      pluginReviewKey: "developer:local.example",
      pluginFingerprint: "fingerprint-a",
      manifestId: "local.example",
      entryPath: "/tmp/plugin/dist/index.js",
      entryContentHash: "hash-a",
      bundleContentHash: "bundle-b",
      sourcePath: "/tmp/plugin",
    })).toBe("stale")
  })

  test("classifies developer trusted plugins as review-before-enable full local code", () => {
    expect(getDeveloperTrustedPluginTargetMode()).toEqual({
      targetMode: "developer-trusted-code",
      executionStatus: "developer-trusted-code",
      updatePosture: "review-before-enable",
    })

    expect(getPluginDiagnostics({
      runtime: "claude",
      targetMode: "developer-trusted-code",
      reviewStatus: "metadata-only",
    })).toContainEqual({
      code: "developer-trusted-code-full-trust",
      severity: "warning",
    })
  })
})
