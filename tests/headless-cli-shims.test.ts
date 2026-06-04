import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

const repoRoot = join(__dirname, "..")

describe("headless CLI shims", () => {
  test("macOS shim routes headless commands to Electron headless mode", () => {
    const source = readFileSync(join(repoRoot, "resources/cli/locus"), "utf-8")
    expect(source).toContain("--locus-headless-cli")
    expect(source).toContain('case "$COMMAND" in')
    expect(source).toContain('run|jobs|api|daemon|schedules|schedule|acp)')

    const headlessSection = source.slice(
      source.indexOf('run|jobs|api|daemon|schedules|schedule|acp)'),
      source.indexOf('open|gui)'),
    )
    expect(headlessSection).toContain("exec")
    expect(headlessSection).not.toContain("open -a")
  })

  test("Windows shim routes headless commands synchronously without start", () => {
    const source = readFileSync(join(repoRoot, "resources/cli/locus.cmd"), "utf-8")
    expect(source).toContain("--locus-headless-cli")
    expect(source).toContain('if "%COMMAND%"=="run"')
    expect(source).toContain('if "%COMMAND%"=="jobs"')
    expect(source).toContain('if "%COMMAND%"=="api"')
    expect(source).toContain('if "%COMMAND%"=="daemon"')
    expect(source).toContain('if "%COMMAND%"=="schedules"')
    expect(source).toContain('if "%COMMAND%"=="schedule"')
    expect(source).toContain('if "%COMMAND%"=="acp"')

    const headlessSection = source.slice(
      source.indexOf(":headless"),
      source.indexOf(":gui"),
    )
    expect(headlessSection).toContain('"%LOCUS_EXE%" --locus-headless-cli')
    expect(headlessSection.toLowerCase()).not.toContain("start ")
  })
})
