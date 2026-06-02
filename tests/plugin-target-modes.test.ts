import { describe, expect, mock, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  getPluginDiagnostics,
  getManifestOnlyPluginTargetMode,
  getPluginSourceDiagnostics,
  getPluginReviewStatus,
} from "../src/shared/plugin-target-modes"

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return join(tmpdir(), "locus-plugin-target-modes-userdata")
    },
  },
}))

const {
  resolveClaudeMarketplacePluginPath,
  resolvePluginComponentPath,
  resolvePluginComponentPathWithDiagnostics,
} = await import("../src/main/lib/plugins")

describe("plugin target modes", () => {
  test("classifies current packages as manifest-only metadata", () => {
    expect(getManifestOnlyPluginTargetMode()).toEqual({
      targetMode: "manifest-only",
      executionStatus: "not-run-by-locus",
      updatePosture: "advisory-only",
    })
  })

  test("marks MCP-bearing Claude packages for review without changing Codex read-only posture", () => {
    expect(getPluginReviewStatus({ runtime: "claude", hasMcpServers: false })).toBe("metadata-only")
    expect(getPluginReviewStatus({ runtime: "claude", hasMcpServers: true })).toBe("mcp-review-required")
    expect(getPluginReviewStatus({ runtime: "codex", hasMcpServers: false })).toBe("read-only-cache")
    expect(getPluginReviewStatus({ runtime: "codex", hasMcpServers: true })).toBe("read-only-cache")
  })

  test("builds non-executing diagnostics for review and safe-mode planning", () => {
    expect(getPluginDiagnostics({
      runtime: "claude",
      targetMode: "manifest-only",
      reviewStatus: "mcp-review-required",
    })).toEqual([
      { code: "metadata-only-no-execution", severity: "info" },
      { code: "mcp-review-required", severity: "warning" },
      { code: "permission-scope-review-required", severity: "info" },
      { code: "safe-mode-planned", severity: "info" },
    ])

    expect(getPluginDiagnostics({
      runtime: "codex",
      targetMode: "manifest-only",
      reviewStatus: "read-only-cache",
    }).map((diagnostic) => diagnostic.code)).toContain("codex-read-only-cache")
  })

  test("builds source diagnostics for missing and read-only refresh states", () => {
    expect(getPluginSourceDiagnostics({ status: "missing" })).toEqual([
      { code: "source-missing", severity: "warning" },
      { code: "source-read-only-refresh", severity: "info" },
    ])
    expect(getPluginSourceDiagnostics({ status: "empty" })[0]).toEqual({
      code: "source-empty",
      severity: "warning",
    })
  })
})

describe("plugin component path containment", () => {
  test("keeps component paths inside the plugin root", async () => {
    const root = mkdtempSync(join(tmpdir(), "locus-plugin-root-"))
    try {
      mkdirSync(join(root, "commands"))

      await expect(resolvePluginComponentPath(root, "commands", "commands")).resolves.toBe(
        resolve(root, "commands"),
      )
      await expect(resolvePluginComponentPath(root, undefined, "skills")).resolves.toBe(
        join(root, "skills"),
      )
      await expect(resolvePluginComponentPath(root, "../outside", "commands")).resolves.toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("rejects symlinked component paths that escape the plugin root", async () => {
    const root = mkdtempSync(join(tmpdir(), "locus-plugin-root-"))
    const outside = mkdtempSync(join(tmpdir(), "locus-plugin-outside-"))
    try {
      symlinkSync(outside, join(root, "linked-outside"), "dir")

      await expect(resolvePluginComponentPath(root, "linked-outside", "commands")).resolves.toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test("returns a diagnostic when component paths point outside the plugin root", async () => {
    const root = mkdtempSync(join(tmpdir(), "locus-plugin-root-"))
    try {
      await expect(
        resolvePluginComponentPathWithDiagnostics(root, "../outside", "commands"),
      ).resolves.toEqual({
        diagnostics: [{
          code: "component-path-outside-root",
          severity: "warning",
        }],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("keeps Claude marketplace plugin sources inside the marketplace root", async () => {
    const marketplaceRoot = mkdtempSync(join(tmpdir(), "locus-marketplace-root-"))
    const pluginRoot = join(marketplaceRoot, "plugin")
    const outsideRoot = mkdtempSync(join(tmpdir(), "locus-marketplace-outside-"))
    try {
      mkdirSync(pluginRoot)
      symlinkSync(outsideRoot, join(marketplaceRoot, "linked-outside"), "dir")

      await expect(resolveClaudeMarketplacePluginPath(marketplaceRoot, "plugin")).resolves.toBe(
        resolve(marketplaceRoot, "plugin"),
      )
      await expect(resolveClaudeMarketplacePluginPath(marketplaceRoot, "../outside")).resolves.toBeUndefined()
      await expect(resolveClaudeMarketplacePluginPath(marketplaceRoot, outsideRoot)).resolves.toBeUndefined()
      await expect(resolveClaudeMarketplacePluginPath(marketplaceRoot, "linked-outside")).resolves.toBeUndefined()
    } finally {
      rmSync(marketplaceRoot, { recursive: true, force: true })
      rmSync(outsideRoot, { recursive: true, force: true })
    }
  })
})
