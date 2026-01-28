/**
 * VS Code Theme Scanner
 *
 * Scans local VS Code extensions directories to discover installed themes.
 * Supports VS Code, VS Code Insiders, Cursor, and Windsurf.
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { ipcMain } from "electron"
import { parse as parseJsonc } from "jsonc-parser"

/**
 * Source editor type
 */
export type EditorSource = "vscode" | "vscode-insiders" | "cursor" | "windsurf"

/**
 * Discovered theme metadata (lightweight, for listing)
 */
export interface DiscoveredTheme {
  id: string
  name: string
  type: "light" | "dark"
  extensionId: string
  extensionName: string
  path: string
  source: EditorSource
}

/**
 * Full theme data (loaded on demand)
 */
export interface VSCodeThemeData {
  id: string
  name: string
  type: "light" | "dark"
  colors: Record<string, string>
  tokenColors?: any[]
  semanticHighlighting?: boolean
  semanticTokenColors?: Record<string, any>
  source: "imported"
  path: string
}

// No caching - always scan fresh to avoid issues

/**
 * Extension paths for different VS Code variants
 */
const EXTENSION_PATHS: { path: string; source: EditorSource }[] = [
  // VS Code
  { path: path.join(os.homedir(), ".vscode", "extensions"), source: "vscode" },
  // VS Code Insiders
  { path: path.join(os.homedir(), ".vscode-insiders", "extensions"), source: "vscode-insiders" },
  // Cursor
  { path: path.join(os.homedir(), ".cursor", "extensions"), source: "cursor" },
  // Windsurf
  { path: path.join(os.homedir(), ".windsurf", "extensions"), source: "windsurf" },
]

/**
 * Check if a directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * Detect theme type from colors
 */
function detectThemeType(colors: Record<string, string> | undefined): "light" | "dark" {
  if (!colors) return "dark"

  const bgColor = colors["editor.background"] || colors["editorPane.background"] || "#000000"
  const hex = bgColor.replace(/^#/, "")

  // Handle shorthand hex
  let r: number, g: number, b: number
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16)
    g = parseInt(hex[1] + hex[1], 16)
    b = parseInt(hex[2] + hex[2], 16)
  } else if (hex.length >= 6) {
    r = parseInt(hex.slice(0, 2), 16)
    g = parseInt(hex.slice(2, 4), 16)
    b = parseInt(hex.slice(4, 6), 16)
  } else {
    return "dark"
  }

  // Calculate perceived brightness using ITU-R BT.709 coefficients
  const brightness = r * 0.2126 + g * 0.7152 + b * 0.0722
  return brightness > 128 ? "light" : "dark"
}

/**
 * Map VS Code uiTheme to our theme type
 */
function mapUiTheme(uiTheme: string | undefined): "light" | "dark" {
  if (!uiTheme) return "dark"
  // VS Code uses: "vs" (light), "vs-dark" (dark), "hc-black" (high contrast dark), "hc-light" (high contrast light)
  return uiTheme === "vs" || uiTheme === "hc-light" ? "light" : "dark"
}

/**
 * Scan a single extensions directory
 */
async function scanExtensionsDir(extensionsDir: string, source: EditorSource): Promise<DiscoveredTheme[]> {
  const themes: DiscoveredTheme[] = []

  if (!(await directoryExists(extensionsDir))) {
    return themes
  }

  try {
    // Always use execSync to get directory listing (fs.readdir has caching issues in Electron)
    const { execSync } = require("child_process")
    const lsOutput = execSync(`ls -1 "${extensionsDir}"`, { encoding: "utf-8" })
    const lsEntries = lsOutput.trim().split("\n").filter(Boolean)

    // Create Dirent-like objects from ls output
    const entries_final = await Promise.all(
      lsEntries.map(async (name) => {
        const fullPath = path.join(extensionsDir, name)
        try {
          const stat = await fs.stat(fullPath)
          return {
            name,
            isDirectory: () => stat.isDirectory(),
          }
        } catch {
          return { name, isDirectory: () => false }
        }
      })
    )

    for (const entry of entries_final) {
      if (!entry.isDirectory()) continue

      const extDir = entry.name
      const packageJsonPath = path.join(extensionsDir, extDir, "package.json")

      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8")
        const manifest = JSON.parse(packageJsonContent)

        const themeContributions = manifest.contributes?.themes || []

        for (const theme of themeContributions) {
          if (!theme.path) continue

          const themePath = path.join(extensionsDir, extDir, theme.path)
          // Verify theme file exists and read the actual theme name from the file
          let actualThemeName: string | undefined
          try {
            const themeContent = await fs.readFile(themePath, "utf-8")
            // Use proper JSONC parser (handles comments and trailing commas)
            const themeData = parseJsonc(themeContent)
            actualThemeName = themeData.name
          } catch {
            continue
          }

          // Prefer: actual theme file name > label from package.json > id > file basename
          const themeName = actualThemeName || theme.label || theme.id || path.basename(theme.path, ".json")
          // Use file path basename in ID to ensure uniqueness
          const fileBasename = path.basename(theme.path, ".json")
          const themeId = `vscode-${extDir}-${fileBasename}`.replace(/[^a-zA-Z0-9-_]/g, "-")

          themes.push({
            id: themeId,
            name: themeName,
            type: mapUiTheme(theme.uiTheme),
            extensionId: extDir,
            extensionName: manifest.displayName || manifest.name || extDir,
            path: themePath,
            source,
          })
        }
      } catch {
        // Skip extensions with invalid package.json
        continue
      }
    }
  } catch (error) {
    console.error(`Error scanning extensions directory ${extensionsDir}:`, error)
  }

  return themes
}

/**
 * Scan all VS Code extension directories for themes
 */
export async function scanVSCodeThemes(): Promise<DiscoveredTheme[]> {
  const allThemes: DiscoveredTheme[] = []
  const seenPaths = new Set<string>()

  for (const { path: extensionsDir, source } of EXTENSION_PATHS) {
    const themes = await scanExtensionsDir(extensionsDir, source)
    for (const theme of themes) {
      // Deduplicate by normalized theme path (same theme in different editors)
      // Use the theme file's basename + extension ID as unique key
      const uniqueKey = `${theme.extensionId}-${path.basename(theme.path)}`
      if (!seenPaths.has(uniqueKey)) {
        seenPaths.add(uniqueKey)
        allThemes.push(theme)
      }
    }
  }

  // Sort by extension name, then theme name
  allThemes.sort((a, b) => {
    const extCompare = a.extensionName.localeCompare(b.extensionName)
    if (extCompare !== 0) return extCompare
    return a.name.localeCompare(b.name)
  })

  return allThemes
}

/**
 * Load full theme data from a theme file path
 */
export async function loadThemeFromPath(themePath: string): Promise<VSCodeThemeData> {
  const content = await fs.readFile(themePath, "utf-8")

  // Use proper JSONC parser (handles comments and trailing commas)
  const theme = parseJsonc(content)

  // Generate unique ID based on path and timestamp
  const id = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return {
    id,
    name: theme.name || path.basename(themePath, ".json"),
    type: detectThemeType(theme.colors),
    colors: theme.colors || {},
    tokenColors: theme.tokenColors,
    semanticHighlighting: theme.semanticHighlighting,
    semanticTokenColors: theme.semanticTokenColors,
    source: "imported",
    path: themePath,
  }
}

/**
 * Register IPC handlers for theme scanning
 */
let ipcRegistered = false
export function registerThemeScannerIPC(): void {
  if (ipcRegistered) {
    return
  }
  ipcRegistered = true

  ipcMain.handle("vscode:scan-themes", async () => {
    try {
      const themes = await scanVSCodeThemes()
      return themes
    } catch (error) {
      console.error("Error scanning VS Code themes:", error)
      throw error
    }
  })

  ipcMain.handle("vscode:load-theme", async (_, themePath: string) => {
    try {
      // Security: Validate path is within allowed directories
      const normalizedPath = path.normalize(themePath)
      const isAllowedPath = EXTENSION_PATHS.some(({ path: allowedDir }) => {
        const normalizedAllowed = path.normalize(allowedDir)
        // Ensure we check with path separator to avoid partial matches
        return normalizedPath.startsWith(normalizedAllowed + path.sep) ||
               normalizedPath.startsWith(normalizedAllowed)
      })

      if (!isAllowedPath) {
        throw new Error("Theme path is not within allowed directories")
      }

      return await loadThemeFromPath(normalizedPath)
    } catch (error) {
      console.error("Error loading VS Code theme:", error)
      throw error
    }
  })
}
