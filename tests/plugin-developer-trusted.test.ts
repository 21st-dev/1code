import { describe, expect, test } from "bun:test"
import {
  buildDeveloperTrustedAcknowledgement,
  buildDeveloperTrustedReviewDocument,
  buildPluginDeveloperTrustedGate,
  getDeveloperTrustedStatus,
  parseDeveloperTrustedManifest,
} from "../src/shared/plugin-developer-trusted"
import { getDeveloperTrustedPluginTargetMode, getPluginDiagnostics } from "../src/shared/plugin-target-modes"

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
    })).toEqual({
      manifestPresent: true,
      id: "local.example.hash",
      name: "Hash",
      version: "0.1.0",
      entry: "dist/index.js",
      entryContentHash: "sha256:entry",
      entryRealPath: "/tmp/plugin/dist/index.js",
      permissions: ["local-code"],
      capabilities: ["settings-panel"],
      diagnostics: [],
      ignoredUnknownFields: [],
    })
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
      sourcePath: "/tmp/plugin",
      trustedAt: "2026-06-02T00:00:00.000Z",
    })

    expect(getDeveloperTrustedStatus(acknowledgement, {
      pluginReviewKey: "developer:local.example",
      pluginFingerprint: "fingerprint-a",
      manifestId: "local.example",
      entryPath: "/tmp/plugin/dist/index.js",
      entryContentHash: "hash-a",
      sourcePath: "/tmp/plugin",
    })).toBe("current")

    expect(getDeveloperTrustedStatus(acknowledgement, {
      pluginReviewKey: "developer:local.example",
      pluginFingerprint: "fingerprint-b",
      manifestId: "local.example",
      entryPath: "/tmp/plugin/dist/index.js",
      entryContentHash: "hash-a",
      sourcePath: "/tmp/plugin",
    })).toBe("stale")

    expect(getDeveloperTrustedStatus(acknowledgement, {
      pluginReviewKey: "developer:local.example",
      pluginFingerprint: "fingerprint-a",
      manifestId: "local.example",
      entryPath: "/tmp/plugin/dist/index.js",
      entryContentHash: "hash-b",
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
