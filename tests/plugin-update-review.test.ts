import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildPluginManifestReviewDocument,
  diffPluginManifestReviewDocuments,
  stableJsonStringify,
  type PluginManifestReviewDocument,
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
    sourcePins: overrides.sourcePins ?? [{
      kind: "lock-source-ref",
      value: "500e8738438ed1204eaf23e61280d872f47534fd",
      repo: "figma/mcp-server-guide",
      path: "skills/figma-use",
    }],
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
        mcpServers: ["figma", "figma-write"],
      },
      sourcePins: [{ kind: "cache-version", value: "next-pin" }],
    })

    expect(diffPluginManifestReviewDocuments(previous, current)).toEqual([
      { field: "version", previous: "2.0.7", current: "2.0.8" },
      { field: "mcpServers", previous: "figma", current: "figma, figma-write" },
      {
        field: "sourcePins",
        previous: "{\"kind\":\"lock-source-ref\",\"path\":\"skills/figma-use\",\"repo\":\"figma/mcp-server-guide\",\"value\":\"500e8738438ed1204eaf23e61280d872f47534fd\"}",
        current: "{\"kind\":\"cache-version\",\"value\":\"next-pin\"}",
      },
    ])
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

  test("extracts cache versions and lock source refs as advisory pins", async () => {
    const pluginRoot = await mkdtemp(join(tmpdir(), "locus-plugin-lock-"))
    try {
      await writeFile(
        join(pluginRoot, "plugin.lock.json"),
        JSON.stringify({
          skills: [{
            id: "figma-use",
            source: {
              type: "github",
              repo: "figma/mcp-server-guide",
              path: "skills/figma-use",
              ref: "500e8738438ed1204eaf23e61280d872f47534fd",
            },
          }],
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
