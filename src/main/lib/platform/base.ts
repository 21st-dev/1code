/**
 * Base Platform Provider
 * Contains shared logic for all platforms
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as os from "node:os"
import * as path from "node:path"
import type {
  PlatformProvider,
  ShellConfig,
  PathConfig,
  CliConfig,
  EnvironmentConfig,
} from "./types"

const execFileAsync = promisify(execFile)

export abstract class BasePlatformProvider implements PlatformProvider {
  abstract readonly platform: "win32" | "darwin" | "linux"
  abstract readonly displayName: string

  abstract getShellConfig(): ShellConfig
  abstract getPathConfig(): PathConfig
  abstract getCliConfig(): CliConfig
  abstract getEnvironmentConfig(): EnvironmentConfig

  /**
   * Get home directory (cross-platform)
   */
  protected getHome(): string {
    return os.homedir()
  }

  /**
   * Get username (cross-platform)
   */
  protected getUsername(): string {
    return os.userInfo().username
  }

  buildExtendedPath(currentPath?: string): string {
    const config = this.getPathConfig()
    const existingPaths = currentPath
      ? currentPath.split(config.separator).filter(Boolean)
      : []

    const allPaths = [
      ...config.commonPaths,
      config.localBin,
      ...config.packageManagerPaths,
    ]

    // Add paths that aren't already present (case-insensitive on Windows)
    const isWindows = this.platform === "win32"
    const normalizedExisting = new Set(
      existingPaths.map((p) =>
        isWindows ? path.normalize(p).toLowerCase() : path.normalize(p)
      )
    )

    const newPaths: string[] = []
    for (const p of allPaths) {
      const normalized = isWindows
        ? path.normalize(p).toLowerCase()
        : path.normalize(p)
      if (!normalizedExisting.has(normalized)) {
        newPaths.push(path.normalize(p))
        normalizedExisting.add(normalized)
      }
    }

    return [...newPaths, ...existingPaths].join(config.separator)
  }

  getDefaultShell(): string {
    const config = this.getShellConfig()
    return config.executable
  }

  async detectShell(): Promise<string> {
    // Default implementation returns configured shell
    // Platforms can override for more sophisticated detection
    return this.getDefaultShell()
  }

  async detectLocale(): Promise<string> {
    // Default: check environment or return fallback
    return process.env.LANG || "en_US.UTF-8"
  }

  buildEnvironment(baseEnv?: Record<string, string>): Record<string, string> {
    const envConfig = this.getEnvironmentConfig()
    const pathConfig = this.getPathConfig()
    const home = this.getHome()
    const user = this.getUsername()

    const env: Record<string, string> = { ...baseEnv }

    // Set home directory
    env[envConfig.homeVar] = home
    if (!env.HOME) env.HOME = home

    // Set user
    env[envConfig.userVar] = user
    if (!env.USER) env.USER = user

    // Set additional platform-specific vars
    for (const [key, value] of Object.entries(envConfig.additionalVars)) {
      if (!env[key]) {
        // Resolve special placeholders
        env[key] = value
          .replace("${HOME}", home)
          .replace("${USER}", user)
      }
    }

    // Build extended PATH
    env.PATH = this.buildExtendedPath(env.PATH || process.env.PATH)

    // Set TERM if not present
    if (!env.TERM) {
      env.TERM = "xterm-256color"
    }

    // Set SHELL
    if (!env.SHELL) {
      env.SHELL = this.getDefaultShell()
    }

    return env
  }

  /**
   * Execute a command safely using execFile (no shell interpolation).
   *
   * This is the preferred method for simple command execution as it:
   * - Avoids shell injection vulnerabilities
   * - Has predictable argument handling
   *
   * For complex shell commands (pipes, redirects, osascript with quotes),
   * implementations may use exec/execSync directly as needed.
   */
  async execCommand(
    command: string,
    args: string[],
    options?: { timeout?: number; env?: Record<string, string> }
  ): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: options?.timeout ?? 5000,
      env: options?.env,
      encoding: "utf8",
    })
    return { stdout, stderr }
  }

  // Abstract methods that must be implemented by each platform
  abstract installCli(
    sourcePath: string
  ): Promise<{ success: boolean; error?: string }>
  abstract uninstallCli(): Promise<{ success: boolean; error?: string }>
  abstract isCliInstalled(sourcePath: string): boolean
}
