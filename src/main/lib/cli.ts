/**
 * CLI command support for OpenCodex
 * Allows users to open OpenCodex from terminal with: opencodex . or opencodex /path/to/project
 *
 * Based on PR #16 by @caffeinum (Aleksey Bykhun)
 * https://github.com/21st-dev/1code/pull/16
 */

import { app } from "electron"
import { join } from "path"
import { existsSync, lstatSync } from "fs"
import { platform } from "./platform"

// Launch directory from CLI (e.g., `opencodex /path/to/project`)
let launchDirectory: string | null = null

/**
 * Get the launch directory passed via CLI args (consumed once)
 */
export function getLaunchDirectory(): string | null {
  const dir = launchDirectory
  launchDirectory = null // consume once
  return dir
}

/**
 * Parse CLI arguments to find a directory argument
 * Called on app startup to handle `opencodex .` or `opencodex /path/to/project`
 */
export function parseLaunchDirectory(): void {
  // Look for a directory argument in argv
  // Skip electron executable and script path
  const args = process.argv.slice(process.defaultApp ? 2 : 1)

  for (const arg of args) {
    // Skip flags and protocol URLs
    if (arg.startsWith("-") || arg.includes("://")) continue

    // Check if it's a valid directory
    if (existsSync(arg)) {
      try {
        const stat = lstatSync(arg)
        if (stat.isDirectory()) {
          console.log("[CLI] Launch directory:", arg)
          launchDirectory = arg
          return
        }
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Get the CLI source path (where the CLI script is bundled)
 */
function getCliSourcePath(): string {
  const cliName = platform.getCliConfig().scriptName
  if (app.isPackaged) {
    return join(process.resourcesPath, "cli", cliName)
  }
  return join(__dirname, "..", "..", "resources", "cli", cliName)
}

/**
 * Check if the CLI command is installed
 */
export function isCliInstalled(): boolean {
  return platform.isCliInstalled(getCliSourcePath())
}

/**
 * Install the CLI command
 * Platform-specific behavior is handled by the platform provider
 */
export async function installCli(): Promise<{
  success: boolean
  error?: string
}> {
  return platform.installCli(getCliSourcePath())
}

/**
 * Uninstall the CLI command
 * Platform-specific behavior is handled by the platform provider
 */
export async function uninstallCli(): Promise<{
  success: boolean
  error?: string
}> {
  return platform.uninstallCli()
}
