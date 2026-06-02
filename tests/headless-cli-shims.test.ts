import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

const repoRoot = join(__dirname, "..")

describe("headless CLI shims", () => {
  test("macOS shim routes run/jobs to Electron headless mode", () => {
    const source = readFileSync(join(repoRoot, "resources/cli/locus"), "utf-8")
    expect(source).toContain("--locus-headless-cli")
    expect(source).toContain('case "$COMMAND" in')
    expect(source).toContain('run|jobs)')

    const headlessSection = source.slice(
      source.indexOf('run|jobs)'),
      source.indexOf('open|gui)'),
    )
    expect(headlessSection).toContain("exec")
    expect(headlessSection).not.toContain("open -a")
  })

  test("Windows shim routes run/jobs synchronously without start", () => {
    const source = readFileSync(join(repoRoot, "resources/cli/locus.cmd"), "utf-8")
    expect(source).toContain("--locus-headless-cli")
    expect(source).toContain('if "%COMMAND%"=="run"')
    expect(source).toContain('if "%COMMAND%"=="jobs"')

    const headlessSection = source.slice(
      source.indexOf(":headless"),
      source.indexOf(":gui"),
    )
    expect(headlessSection).toContain('"%LOCUS_EXE%" --locus-headless-cli')
    expect(headlessSection.toLowerCase()).not.toContain("start ")
  })
})
