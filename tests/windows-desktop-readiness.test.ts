import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"

describe("Windows desktop readiness source guards", () => {
  test("terminal env applies platform PATH expansion after secret allowlisting", () => {
    const source = readFileSync("src/main/lib/terminal/env.ts", "utf-8")

    expect(source).toContain("const safeBaseEnv = buildSafeEnv(rawBaseEnv)")
    expect(source).toContain("const baseEnv = platform.buildEnvironment(safeBaseEnv)")
    expect(source).not.toContain("const baseEnv = buildSafeEnv(rawBaseEnv)")
  })

  test("external editor launching does not rely on macOS or Unix-only commands on Windows", () => {
    const source = readFileSync("src/main/lib/trpc/routers/external.ts", "utf-8")

    expect(source).toContain('process.platform === "win32" ? "where" : "which"')
    expect(source).toContain('shell: process.platform === "win32"')
    expect(source).toContain('if (process.platform !== "darwin")')
    expect(source).toContain("await shell.openPath(expandedPath)")
    expect(source).not.toContain('execFileSync("which"')
  })

  test("Windows default shell stays aligned with cmd exec arguments", () => {
    const source = readFileSync("src/main/lib/platform/windows.ts", "utf-8")

    expect(source).toContain(
      'const cmdPath = process.env.COMSPEC || "C:\\\\Windows\\\\System32\\\\cmd.exe"',
    )
    expect(source).toContain("executable: cmdPath")
    expect(source).toContain('execArgs: (command: string) => ["/c", command]')
    expect(source).not.toContain("WindowsPowerShell")
  })

  test("Windows release packaging is target-hosted and native-module checked", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf-8"))

    expect(packageJson.scripts["package:win"]).toContain(
      "scripts/assert-release-host.mjs --platform=win32",
    )
    expect(packageJson.scripts["release:win"]).toContain(
      "scripts/assert-release-host.mjs --platform=win32",
    )
    expect(packageJson.scripts["release:win"]).toContain("bun run native:check")
    expect(packageJson.scripts["release:win"]).toContain("bun run package:win")
    expect(packageJson.scripts.release).toBe("bun run release:mac")
  })
})
