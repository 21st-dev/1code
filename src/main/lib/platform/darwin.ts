/**
 * macOS Platform Provider
 */

import { exec, execSync } from "node:child_process"
import { existsSync, lstatSync, readlinkSync } from "node:fs"
import * as path from "node:path"
import { promisify } from "node:util"
import { BasePlatformProvider } from "./base"
import type {
  ShellConfig,
  PathConfig,
  CliConfig,
  EnvironmentConfig,
} from "./types"

const execAsync = promisify(exec)

export class DarwinPlatformProvider extends BasePlatformProvider {
  readonly platform = "darwin" as const
  readonly displayName = "macOS"

  getShellConfig(): ShellConfig {
    const shell = process.env.SHELL || "/bin/zsh"

    return {
      executable: shell,
      loginArgs: ["-l"],
      execArgs: (command: string) => ["-c", command],
    }
  }

  getPathConfig(): PathConfig {
    const home = this.getHome()

    return {
      separator: ":",
      commonPaths: [
        // Homebrew (Apple Silicon)
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        // Homebrew (Intel)
        "/usr/local/bin",
        "/usr/local/sbin",
        // System
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        // MacPorts
        "/opt/local/bin",
        "/opt/local/sbin",
      ],
      localBin: path.join(home, ".local", "bin"),
      packageManagerPaths: [
        path.join(home, ".bun", "bin"),
        path.join(home, ".cargo", "bin"),
        path.join(home, ".deno", "bin"),
        // NVM managed Node.js (common pattern)
        path.join(home, ".nvm", "versions", "node", "*", "bin"),
      ],
    }
  }

  getCliConfig(): CliConfig {
    return {
      installPath: "/usr/local/bin/opencodex",
      scriptName: "opencodex",
      requiresAdmin: true, // /usr/local/bin requires admin on macOS
    }
  }

  getEnvironmentConfig(): EnvironmentConfig {
    const home = this.getHome()

    return {
      homeVar: "HOME",
      userVar: "USER",
      additionalVars: {
        TMPDIR: process.env.TMPDIR || "/tmp",
        __CF_USER_TEXT_ENCODING: process.env.__CF_USER_TEXT_ENCODING || "",
      },
    }
  }

  override getDefaultShell(): string {
    return process.env.SHELL || "/bin/zsh"
  }

  override async detectShell(): Promise<string> {
    // Try SHELL env var first (most reliable)
    if (process.env.SHELL) {
      return process.env.SHELL
    }

    // Try to get from Directory Services
    try {
      const { stdout } = await this.execCommand("sh", [
        "-c",
        `dscl . -read /Users/$(whoami) UserShell 2>/dev/null`,
      ])
      const match = stdout.match(/UserShell:\s*(.+)/)
      if (match?.[1]) {
        return match[1].trim()
      }
    } catch {
      // Ignore errors
    }

    return "/bin/zsh"
  }

  override async detectLocale(): Promise<string> {
    // Check environment first
    if (process.env.LANG?.includes("UTF-8")) {
      return process.env.LANG
    }
    if (process.env.LC_ALL?.includes("UTF-8")) {
      return process.env.LC_ALL
    }

    // Try to get from locale command
    try {
      const { stdout } = await this.execCommand("sh", [
        "-c",
        "locale 2>/dev/null | grep LANG= | cut -d= -f2",
      ])
      const trimmed = stdout.trim()
      if (trimmed?.includes("UTF-8")) {
        return trimmed
      }
    } catch {
      // Ignore errors
    }

    return "en_US.UTF-8"
  }

  async installCli(
    sourcePath: string
  ): Promise<{ success: boolean; error?: string }> {
    const cliConfig = this.getCliConfig()
    const installPath = cliConfig.installPath

    if (!existsSync(sourcePath)) {
      return { success: false, error: "CLI script not found in app bundle" }
    }

    try {
      // Remove existing if present
      if (existsSync(installPath)) {
        await execAsync(
          `osascript -e 'do shell script "rm -f ${installPath}" with administrator privileges'`
        )
      }

      // Create symlink with admin privileges
      await execAsync(
        `osascript -e 'do shell script "ln -s \\"${sourcePath}\\" ${installPath}" with administrator privileges'`
      )

      console.log("[CLI] Installed opencodex command to", installPath)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Installation failed"
      console.error("[CLI] Failed to install:", error)
      return { success: false, error: errorMessage }
    }
  }

  async uninstallCli(): Promise<{ success: boolean; error?: string }> {
    const cliConfig = this.getCliConfig()
    const installPath = cliConfig.installPath

    try {
      if (!existsSync(installPath)) {
        console.log("[CLI] CLI command not installed, nothing to uninstall")
        return { success: true }
      }

      await execAsync(
        `osascript -e 'do shell script "rm -f ${installPath}" with administrator privileges'`
      )

      console.log("[CLI] Uninstalled opencodex command")
      return { success: true }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Uninstallation failed"
      console.error("[CLI] Failed to uninstall:", error)
      return { success: false, error: errorMessage }
    }
  }

  isCliInstalled(sourcePath: string): boolean {
    const cliConfig = this.getCliConfig()
    try {
      if (!existsSync(cliConfig.installPath)) return false
      const stat = lstatSync(cliConfig.installPath)
      if (!stat.isSymbolicLink()) return false
      const target = readlinkSync(cliConfig.installPath)
      return target === sourcePath
    } catch {
      return false
    }
  }
}
