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

describe("plugin doctor report", () => {
  test("summarizes safe-mode and review blockers without trusting plugin code", () => {
    const report = buildPluginDoctorReport({
      now: new Date("2026-06-02T00:00:00Z"),
      reviewStatePath: "/userData/plugin-review-state.json",
      safeMode: { enabled: true, updatedAt: "2026-06-02T00:00:00.000Z" },
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
    expect(JSON.stringify(report)).not.toContain("trusted")
    expect(JSON.stringify(report)).not.toContain("verified")
  })

  test("keeps Codex plugin cache debug output read-only", () => {
    const report = buildPluginDoctorReport({
      now: new Date("2026-06-02T00:00:00Z"),
      reviewStatePath: "/userData/plugin-review-state.json",
      safeMode: { enabled: false },
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
})
