import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  getManifestOnlyPluginTargetMode,
  getPluginReviewStatus,
} from "../src/shared/plugin-target-modes"
import { resolvePluginComponentPath } from "../src/main/lib/plugins"

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
})
