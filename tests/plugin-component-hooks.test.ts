import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInfo } from "../src/main/lib/plugins"
import { scanPluginReviewDocument } from "../src/main/lib/plugins/review-scan"

const roots: string[] = []

async function createPluginRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "locus-plugin-hooks-"))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

function pluginInfo(root: string): PluginInfo {
  return {
    runtime: "codex",
    reviewKey: "codex:openai-curated:figma",
    name: "Figma",
    version: "7118aaa3",
    path: root,
    installRoot: root,
    source: "openai-curated:figma@7118aaa3",
    marketplace: "openai-curated",
    sourceKind: "cache",
    sourceTrust: "official",
    targetMode: "manifest-only",
    executionStatus: "not-run-by-locus",
    updatePosture: "review-before-enable",
    diagnostics: [],
    sourcePins: [{ kind: "cache-version", value: "7118aaa3" }],
  }
}

describe("plugin hook component scan", () => {
  test("records hooks.json declarations in component metadata and review identity", async () => {
    const root = await createPluginRoot()
    await writeFile(
      join(root, "hooks.json"),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "Write|Edit",
              hooks: [{ type: "command", command: "./scripts/check.sh" }],
            },
          ],
        },
      }),
      "utf-8",
    )

    const scan = await scanPluginReviewDocument(pluginInfo(root))

    expect(scan.components.hooks).toEqual([
      {
        name: "PostToolUse:Write|Edit:command",
        description: "Write|Edit",
      },
    ])
    expect(scan.reviewDocument.componentPaths.hooks).toBeUndefined()
    expect(scan.reviewDocument.components.hooks).toBe(1)
    expect(JSON.stringify(scan.reviewDocument)).not.toContain(
      "./scripts/check.sh",
    )
  })

  test("falls back to a hooks directory when hooks.json is absent", async () => {
    const root = await createPluginRoot()
    await mkdir(join(root, "hooks"))
    await writeFile(join(root, "hooks", "post-tool-use.md"), "# hook\n")

    const scan = await scanPluginReviewDocument(pluginInfo(root))

    expect(scan.components.hooks).toEqual([{ name: "post-tool-use" }])
    expect(scan.reviewDocument.components.hooks).toBe(1)
  })
})
