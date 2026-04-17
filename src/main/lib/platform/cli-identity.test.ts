import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DarwinPlatformProvider } from "./darwin"
import { LinuxPlatformProvider } from "./linux"
import { WindowsPlatformProvider } from "./windows"

describe("OpenCodex CLI identity", () => {
  test("uses OpenCodex-owned CLI command names across platforms", () => {
    expect(new DarwinPlatformProvider().getCliConfig()).toMatchObject({
      installPath: "/usr/local/bin/opencodex",
      scriptName: "opencodex",
    })
    expect(new LinuxPlatformProvider().getCliConfig()).toMatchObject({
      installPath: "/usr/local/bin/opencodex",
      scriptName: "opencodex",
    })

    const windowsConfig = new WindowsPlatformProvider().getCliConfig()
    expect(windowsConfig.installPath.endsWith(".local\\bin\\opencodex.cmd")).toBe(true)
    expect(windowsConfig.scriptName).toBe("opencodex.cmd")
  })

  test("keeps OpenCodex-owned launcher resources available for local installation", () => {
    const cliDir = join(import.meta.dir, "..", "..", "..", "..", "resources", "cli")
    const unixLauncherPath = join(cliDir, "opencodex")
    const windowsLauncherPath = join(cliDir, "opencodex.cmd")

    expect(existsSync(unixLauncherPath)).toBe(true)
    expect(existsSync(windowsLauncherPath)).toBe(true)
    expect(readFileSync(unixLauncherPath, "utf-8")).toContain('open -a "OpenCodex"')
    expect(readFileSync(windowsLauncherPath, "utf-8")).toContain("OpenCodex.exe")
  })
})
