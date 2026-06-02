import { describe, expect, test } from "bun:test"
import { buildPluginDoctorReport } from "../src/shared/plugin-doctor"
import { buildPluginSafetyGate } from "../src/shared/plugin-safety-gates"

function updateReview(status: "new" | "unchanged" | "changed" | "reviewed") {
  return {
    fingerprint: `fingerprint-${status}`,
    status,
    sourcePins: [],
    changes: [],
    lastReviewedFingerprint: status === "reviewed" ? `fingerprint-${status}` : undefined,
  }
}

function emptyControlledUi() {
  return {
    manifestPresent: false,
    diagnostics: [],
    ignoredUnknownFields: [],
    gate: {
      canRenderControlledUi: false,
      canInvokeControlledAction: false,
      reasons: ["invalid-contribution-manifest" as const],
    },
  }
}

function emptyDeveloperTrusted(pluginReviewKey = "") {
  return {
    isDeveloperSource: false,
    manifestPresent: false,
    diagnostics: [],
    ignoredUnknownFields: [],
    trustStatus: "missing" as const,
    gate: {
      canTrustCurrentFingerprint: false,
      canLoadTrustedCode: false,
      reasons: [],
    },
    loadState: {
      pluginReviewKey,
      status: "not-loaded" as const,
    },
  }
}

describe("plugin doctor report", () => {
  test("summarizes safe-mode and review blockers without trusting plugin code", () => {
    const report = buildPluginDoctorReport({
      now: new Date("2026-06-02T00:00:00Z"),
      reviewStatePath: "/userData/plugin-review-state.json",
      safeMode: { enabled: true, updatedAt: "2026-06-02T00:00:00.000Z" },
      developerMode: { enabled: false },
      sources: [{
        id: "claude:local",
        runtime: "claude",
        status: "available",
        path: "/home/.claude/plugins/marketplaces/local",
        pluginCount: 1,
      }],
      plugins: [{
        runtime: "claude",
        reviewKey: "claude:local:tools",
        name: "Tools",
        source: "local:tools",
        path: "/home/.claude/plugins/marketplaces/local/tools",
        updateReview: updateReview("changed"),
        safetyGate: buildPluginSafetyGate({
          runtime: "claude",
          hasMcpServers: true,
          updateReviewStatus: "changed",
          safeModeEnabled: true,
        }),
        sourcePins: [],
        diagnostics: [],
        componentCounts: {
          commands: 1,
          skills: 1,
          agents: 1,
          mcpServers: 1,
        },
        controlledUi: emptyControlledUi(),
        developerTrusted: emptyDeveloperTrusted("claude:local:tools"),
        mcpServers: ["tools"],
        mcpApprovalIdentifiers: {
          tools: "local:tools:tools#mcp-sha256:abc",
        },
      }],
    })

    expect(report.generatedAt).toBe("2026-06-02T00:00:00.000Z")
    expect(report.summary.blockedPluginCount).toBe(1)
    expect(report.summary.blocked).toBeGreaterThanOrEqual(3)
    expect(report.plugins[0].checks.map((check) => check.code)).toContain("safe-mode")
    expect(report.plugins[0].checks.map((check) => check.code)).toContain("review-changed")
    expect(JSON.stringify(report)).not.toContain("verified")
    expect(JSON.stringify(report)).not.toContain("sourceCode")
    expect(JSON.stringify(report)).not.toContain("require(")
  })

  test("keeps Codex plugin cache debug output read-only", () => {
    const report = buildPluginDoctorReport({
      now: new Date("2026-06-02T00:00:00Z"),
      reviewStatePath: "/userData/plugin-review-state.json",
      safeMode: { enabled: false },
      developerMode: { enabled: false },
      sources: [{
        id: "codex:plugin-cache",
        runtime: "codex",
        status: "empty",
        path: "/home/.codex/plugins/cache",
        pluginCount: 0,
      }],
      plugins: [{
        runtime: "codex",
        reviewKey: "codex:openai-curated:figma",
        name: "Figma",
        source: "openai-curated:figma@45fe2bdd",
        path: "/home/.codex/plugins/cache/openai-curated/figma/45fe2bdd",
        updateReview: updateReview("reviewed"),
        safetyGate: buildPluginSafetyGate({
          runtime: "codex",
          hasMcpServers: true,
          updateReviewStatus: "reviewed",
          safeModeEnabled: false,
        }),
        sourcePins: [{ kind: "cache-version", value: "45fe2bdd" }],
        diagnostics: [],
        componentCounts: {
          commands: 0,
          skills: 1,
          agents: 0,
          mcpServers: 1,
        },
        controlledUi: emptyControlledUi(),
        developerTrusted: emptyDeveloperTrusted("codex:openai-curated:figma"),
        mcpServers: ["figma"],
        mcpApprovalIdentifiers: {},
      }],
    })

    const codexDebug = report.plugins[0]
    expect(codexDebug.safetyGate.status).toBe("read-only")
    expect(codexDebug.checks).toContainEqual(expect.objectContaining({
      code: "codex-read-only",
      status: "info",
    }))
    expect(report.summary.blockedPluginCount).toBe(1)
  })

  test("reports developer trusted gates and bundle hashes without source code", () => {
    const report = buildPluginDoctorReport({
      now: new Date("2026-06-02T00:00:00Z"),
      reviewStatePath: "/userData/plugin-review-state.json",
      safeMode: { enabled: false },
      developerMode: { enabled: true, updatedAt: "2026-06-02T00:00:00.000Z" },
      sources: [{
        id: "claude:developer",
        runtime: "claude",
        status: "available",
        path: "/home/dev/plugin",
        pluginCount: 1,
      }],
      plugins: [{
        runtime: "claude",
        reviewKey: "claude:developer:local-example",
        name: "Local Example",
        source: "developer:local-example",
        path: "/home/dev/plugin",
        updateReview: updateReview("reviewed"),
        safetyGate: buildPluginSafetyGate({
          runtime: "claude",
          hasMcpServers: false,
          updateReviewStatus: "reviewed",
          safeModeEnabled: false,
        }),
        sourcePins: [],
        diagnostics: [],
        componentCounts: {
          commands: 0,
          skills: 0,
          agents: 0,
          mcpServers: 0,
        },
        controlledUi: emptyControlledUi(),
        developerTrusted: {
          isDeveloperSource: true,
          manifestPresent: true,
          manifest: {
            schemaVersion: 1,
            id: "local.example",
            name: "Local Example",
            version: "0.1.0",
            entry: "dist/index.mjs",
            permissions: ["workspace.read"],
            capabilities: ["settings.panel"],
          },
          diagnostics: [],
          ignoredUnknownFields: [],
          entryPath: "dist/index.mjs",
          entryRealPath: "/home/dev/plugin/dist/index.mjs",
          entryContentHash: "entry-hash",
          bundleContentHash: "bundle-hash",
          bundleFileCount: 2,
          bundleByteCount: 400,
          trustStatus: "stale",
          gate: {
            canTrustCurrentFingerprint: true,
            canLoadTrustedCode: false,
            reasons: ["trust-stale"],
          },
          loadState: {
            pluginReviewKey: "claude:developer:local-example",
            status: "blocked",
            bundleContentHash: "bundle-hash",
            errorCode: "trust-stale",
          },
        },
        mcpServers: [],
        mcpApprovalIdentifiers: {},
      }],
    })

    expect(report.checks).toContainEqual(expect.objectContaining({
      code: "developer-mode",
      status: "warning",
    }))
    expect(report.plugins[0].checks).toContainEqual(expect.objectContaining({
      code: "developer-trusted-declared",
      status: "warning",
    }))
    expect(report.plugins[0].checks).toContainEqual(expect.objectContaining({
      code: "developer-trusted-gate",
      status: "blocked",
    }))
    expect(report.plugins[0].checks).toContainEqual(expect.objectContaining({
      code: "developer-trusted-load",
      status: "blocked",
    }))
    const serialized = JSON.stringify(report)
    expect(serialized).toContain("bundle-hash")
    expect(serialized).not.toContain("console.log")
    expect(serialized).not.toContain("new Function")
  })
})
