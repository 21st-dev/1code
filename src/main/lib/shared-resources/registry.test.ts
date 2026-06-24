import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { buildSharedResourceSnapshot } from "./registry"

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "onecode-shared-registry-"))
}

function writeFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, "utf-8")
}

describe("buildSharedResourceSnapshot", () => {
  test("loads in non-Electron automation scripts and includes Codex-native resources", async () => {
    const root = makeTempRoot()
    try {
      const codexRoot = path.join(root, ".codex")
      const pluginRoot = path.join(
        codexRoot,
        "plugins",
        "cache",
        "openai-bundled",
        "record-and-replay",
        "1.0.829",
      )

      writeFile(
        path.join(codexRoot, "skills", "parity-audit", "SKILL.md"),
        `---\nname: parity-audit\ndescription: Compare local UI against Codex Desktop.\n---\n\n# Parity Audit\n`,
      )
      writeFile(
        path.join(pluginRoot, ".codex-plugin", "plugin.json"),
        JSON.stringify(
          {
            name: "record-and-replay",
            version: "1.0.829",
            description: "Record what I'm doing on my Mac",
            skills: "./skills/",
            interface: {
              displayName: "Record & Replay",
              shortDescription: "Record workflows",
            },
          },
          null,
          2,
        ),
      )
      writeFile(
        path.join(pluginRoot, "skills", "record-and-replay", "SKILL.md"),
        `---\nname: record-and-replay\ndescription: Convert recordings into reusable skills.\n---\n\n# Record\n`,
      )

      const snapshot = await buildSharedResourceSnapshot({
        codexRoot,
        codexPluginCacheRoot: path.join(codexRoot, "plugins", "cache"),
      })

      expect(snapshot.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "skill:codex:user:parity-audit",
            kind: "skill",
            name: "parity-audit",
            engine: "codex",
            provenance: expect.objectContaining({
              discoveredBy: "Codex skill directory",
            }),
          }),
          expect.objectContaining({
            id: "plugin:codex:openai-bundled:record-and-replay",
            kind: "plugin",
            name: "Record & Replay",
            engine: "codex",
            provenance: expect.objectContaining({
              discoveredBy: "Codex plugin manifest",
            }),
          }),
          expect.objectContaining({
            id: "skill:codex:plugin:codex:openai-bundled:record-and-replay:record-and-replay",
            kind: "skill",
            name: "record-and-replay",
            engine: "codex",
            provenance: expect.objectContaining({
              discoveredBy: "Codex plugin cache skill",
            }),
          }),
        ]),
      )

      const codexProjection = snapshot.projections.find(
        (projection) => projection.engineId === "codex",
      )
      expect(codexProjection?.mappings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            resourceId: "skill:codex:user:parity-audit",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "plugin:codex:openai-bundled:record-and-replay",
            action: "native",
          }),
        ]),
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
