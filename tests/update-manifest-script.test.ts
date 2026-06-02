import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { spawnSync } from "node:child_process"

describe("release manifest generation", () => {
  test("generates Windows latest.yml from the NSIS installer artifact", () => {
    const releaseDir = mkdtempSync(join(tmpdir(), "locus-update-manifest-"))
    const version = "9.8.7"

    try {
      writeFileSync(join(releaseDir, `Locus-Setup-${version}.exe`), "installer")
      writeFileSync(join(releaseDir, `Locus-${version}-portable.exe`), "portable")

      const result = spawnSync(
        "node",
        [
          "scripts/generate-update-manifest.mjs",
          "--release-dir",
          releaseDir,
          "--version",
          version,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
        },
      )

      expect(result.status).toBe(0)

      const manifest = readFileSync(join(releaseDir, "latest.yml"), "utf-8")
      expect(manifest).toContain(`version: ${version}`)
      expect(manifest).toContain(`url: Locus-Setup-${version}.exe`)
      expect(manifest).toContain(`path: Locus-Setup-${version}.exe`)
      expect(manifest).not.toContain("portable")
    } finally {
      rmSync(releaseDir, { recursive: true, force: true })
    }
  })
})
