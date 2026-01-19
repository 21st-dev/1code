import { app } from "electron"
import { join } from "path"
import { existsSync, lstatSync, readlinkSync } from "fs"

// Launch directory from CLI (e.g., `1code /path/to/project`)
let launchDirectory: string | null = null

export function getLaunchDirectory(): string | null {
  const dir = launchDirectory
  launchDirectory = null // consume once
  return dir
}

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

// CLI command installation
const CLI_INSTALL_PATH = "/usr/local/bin/1code"

function getCliSourcePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "cli", "1code")
  }
  return join(__dirname, "..", "..", "resources", "cli", "1code")
}

export function isCliInstalled(): boolean {
  try {
    if (!existsSync(CLI_INSTALL_PATH)) return false
    const stat = lstatSync(CLI_INSTALL_PATH)
    if (!stat.isSymbolicLink()) return false
    const target = readlinkSync(CLI_INSTALL_PATH)
    return target === getCliSourcePath()
  } catch {
    return false
  }
}

export async function installCli(): Promise<{ success: boolean; error?: string }> {
  const { exec } = await import("child_process")
  const { promisify } = await import("util")
  const execAsync = promisify(exec)

  const sourcePath = getCliSourcePath()

  if (!existsSync(sourcePath)) {
    return { success: false, error: "CLI script not found in app bundle" }
  }

  try {
    // Remove existing if present
    if (existsSync(CLI_INSTALL_PATH)) {
      await execAsync(
        `osascript -e 'do shell script "rm -f ${CLI_INSTALL_PATH}" with administrator privileges'`,
      )
    }

    // Create symlink with admin privileges
    await execAsync(
      `osascript -e 'do shell script "ln -s \\"${sourcePath}\\" ${CLI_INSTALL_PATH}" with administrator privileges'`,
    )

    console.log("[CLI] Installed 1code command to", CLI_INSTALL_PATH)
    return { success: true }
  } catch (error: any) {
    console.error("[CLI] Failed to install:", error)
    return { success: false, error: error.message || "Installation failed" }
  }
}

export async function uninstallCli(): Promise<{ success: boolean; error?: string }> {
  const { exec } = await import("child_process")
  const { promisify } = await import("util")
  const execAsync = promisify(exec)

  try {
    if (existsSync(CLI_INSTALL_PATH)) {
      await execAsync(
        `osascript -e 'do shell script "rm -f ${CLI_INSTALL_PATH}" with administrator privileges'`,
      )
    }
    console.log("[CLI] Uninstalled 1code command")
    return { success: true }
  } catch (error: any) {
    console.error("[CLI] Failed to uninstall:", error)
    return { success: false, error: error.message || "Uninstallation failed" }
  }
}
