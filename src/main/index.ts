import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from "electron"
import { existsSync, readFileSync, readlinkSync, unlinkSync } from "fs"
import { createServer } from "http"
import { join } from "path"
import { format as formatLog } from "util"
import { AuthManager, initAuthManager, getAuthManager as getAuthManagerFromModule } from "./auth-manager"
import { isLocalOnlyMode, openExternalUrl } from "./lib/local-only"
import { startAutomaticAppUpdateChecks } from "./lib/app-updater"
import { closeDatabase, initDatabase } from "./lib/db"
import { isHeadlessCliInvocation } from "./lib/headless/cli-args"
import { runHeadlessCliCommand } from "./lib/headless/cli-dispatcher"
import { recoverStaleAgentJobs } from "./lib/headless/job-recovery"
import {
  getLaunchDirectory,
  isCliInstalled,
  installCli,
  uninstallCli,
  parseLaunchDirectory,
} from "./lib/cli"
import { cleanupGitWatchers } from "./lib/git/watcher"
import { cancelAllPendingOAuth, handleMcpOAuthCallback } from "./lib/mcp-auth"
import { getAllMcpConfigHandler, hasActiveClaudeSessions, abortAllClaudeSessions } from "./lib/trpc/routers/claude"
import { getAllCodexMcpConfigHandler, hasActiveCodexStreams, abortAllCodexStreams } from "./lib/trpc/routers/codex"
import { resolveUserDataPath } from "./lib/user-data-path"
import {
  createMainWindow,
  createWindow,
  getWindow,
  getAllWindows,
  setIsQuitting,
} from "./windows/main"
import {
  parseMcpImportLink,
  sanitizeDeepLinkForLog,
  sanitizeProcessArgForLog,
  type McpImportPreview,
} from "../shared/mcp-import-preview"

import { IS_DEV, AUTH_SERVER_PORT } from "./constants"

const APP_NAME = "Locus"
const APP_DISPLAY_NAME = IS_DEV ? `${APP_NAME} Dev` : APP_NAME
const LEGACY_APP_NAME = "Agent Code for Me"
const APP_COPYRIGHT = "Copyright © 2026 Locus"
const APP_HOMEPAGE_URL = "https://github.com/lupanpan1030/agent-code-for-me"
const isHeadlessCliLaunch = isHeadlessCliInvocation(process.argv)

function redirectHeadlessStdoutLogs(): void {
  if (!isHeadlessCliLaunch) return
  const writeStderr = (...args: unknown[]) => {
    process.stderr.write(`${formatLog(...args)}\n`)
  }
  console.log = writeStderr as typeof console.log
  console.info = writeStderr as typeof console.info
  console.debug = writeStderr as typeof console.debug
}

redirectHeadlessStdoutLogs()

// Deep link protocol (must match package.json build.protocols.schemes)
// Use different protocol in dev to avoid conflicts with production app.
// Keep the old agent-code-for-me protocol registered as a compatibility alias.
const PROTOCOL = IS_DEV ? "locus-dev" : "locus"
const LEGACY_PROTOCOL = IS_DEV ? "agent-code-for-me-dev" : "agent-code-for-me"
const SUPPORTED_PROTOCOLS = [PROTOCOL, LEGACY_PROTOCOL]

app.setName(APP_DISPLAY_NAME)

// Keep the old userData path during the rebrand so existing local projects,
// credentials, settings, and SQLite data continue to load after upgrade.
// LOCUS_USER_DATA_DIR is an explicit escape hatch for clean first-run QA.
const userDataConfig = resolveUserDataPath({
  appDataPath: app.getPath("appData"),
  isDev: IS_DEV,
  legacyAppName: LEGACY_APP_NAME,
})
const userDataPath = userDataConfig.path
app.setPath("userData", userDataPath)
console.log(
  userDataConfig.source === "default"
    ? "[App] Using userData path:"
    : `[App] Using userData path override from ${userDataConfig.source}:`,
  userDataPath,
)

// Increase V8 old-space limit for renderer/main processes to reduce OOM frequency
// under heavy multi-chat workloads. Must be set before app readiness/window creation.
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=8192")

// Auth manager singleton (use the one from auth-manager module)
let authManager: AuthManager
let pendingMcpImportPreview: McpImportPreview | null = null

export function getAuthManager(): AuthManager {
  // First try to get from module, fallback to local variable for backwards compat
  return getAuthManagerFromModule() || authManager
}

ipcMain.handle("mcp-import:get-pending-preview", () => pendingMcpImportPreview)
ipcMain.handle("mcp-import:clear-pending-preview", () => {
  pendingMcpImportPreview = null
  return { success: true }
})

function publishMcpImportPreview(preview: McpImportPreview): void {
  pendingMcpImportPreview = preview
  for (const window of getAllWindows()) {
    window.webContents.send("mcp-import:preview", preview)
  }
}

// Handle deep link
function handleDeepLink(url: string): void {
  console.log("[DeepLink] Received:", sanitizeDeepLinkForLog(url))

  try {
    const parsed = new URL(url)
    const importResult = parseMcpImportLink(url)
    if (importResult.ok) {
      publishMcpImportPreview(importResult.preview)
      console.log("[DeepLink] MCP import preview queued")
      return
    }
    if (importResult.code !== "unsupported-link") {
      console.warn(
        "[DeepLink] MCP import rejected:",
        importResult.message,
        importResult.sanitizedUrl,
      )
      return
    }

    // Handle MCP OAuth callback: locus://mcp-oauth?code=xxx&state=yyy
    if (parsed.pathname === "/mcp-oauth" || parsed.host === "mcp-oauth") {
      const code = parsed.searchParams.get("code")
      const state = parsed.searchParams.get("state")
      if (code && state) {
        handleMcpOAuthCallback(code, state)
        return
      }
    }
  } catch (e) {
    console.error("[DeepLink] Failed to parse:", e)
  }
}

// Register protocol BEFORE app is ready
console.log("[Protocol] ========== PROTOCOL REGISTRATION ==========")
console.log("[Protocol] Primary protocol:", PROTOCOL)
console.log("[Protocol] Legacy protocol:", LEGACY_PROTOCOL)
console.log("[Protocol] Is dev mode (process.defaultApp):", process.defaultApp)
console.log("[Protocol] process.execPath:", process.execPath)
console.log("[Protocol] process.argv:", process.argv.map(sanitizeProcessArgForLog))

/**
 * Register the app as the handler for our custom protocol.
 * On macOS, this may not take effect immediately on first install -
 * Launch Services caches protocol handlers and may need time to update.
 */
function registerProtocol(): boolean {
  let primarySucceeded = false

  for (const protocol of SUPPORTED_PROTOCOLS) {
    let success = false

    if (process.defaultApp) {
      // Dev mode: need to pass execPath and script path
      if (process.argv.length >= 2) {
        success = app.setAsDefaultProtocolClient(protocol, process.execPath, [
          process.argv[1]!,
        ])
        console.log(
          `[Protocol] Dev mode registration (${protocol}):`,
          success ? "success" : "failed",
        )
      } else {
        console.warn("[Protocol] Dev mode: insufficient argv for registration")
      }
    } else {
      // Production mode
      success = app.setAsDefaultProtocolClient(protocol)
      console.log(
        `[Protocol] Production registration (${protocol}):`,
        success ? "success" : "failed",
      )
    }

    if (protocol === PROTOCOL) {
      primarySucceeded = success
    }
  }

  return primarySucceeded
}

// Store initial registration result (set in app.whenReady())
let initialRegistration = false

// Verify registration (this checks if OS recognizes us as the handler)
function verifyProtocolRegistration(): void {
  const isDefault = process.defaultApp
    ? app.isDefaultProtocolClient(PROTOCOL, process.execPath, [
        process.argv[1]!,
      ])
    : app.isDefaultProtocolClient(PROTOCOL)

  console.log(`[Protocol] Verification - isDefaultProtocolClient: ${isDefault}`)

  if (!isDefault && initialRegistration) {
    console.warn(
      "[Protocol] Registration returned success but verification failed.",
    )
    console.warn(
      "[Protocol] This is common on first install - macOS Launch Services may need time to update.",
    )
    console.warn("[Protocol] The protocol should work after app restart.")
  }
}

console.log("[Protocol] =============================================")

// Note: app.on("open-url") will be registered in app.whenReady()

// SVG favicon and auth-page mark.
const FAVICON_SVG = `<svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="14" fill="#111827"/><g stroke="#D9FEFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 24.5C8 19.8 11.8 16 16.5 16H31C35.2 16 37.7 18.1 40 21.7L42.5 25.5"/><path d="M31.5 43H16.5C11.8 43 8 39.2 8 34.5V24.5"/><path d="M41 24.5C44.1 21.1 47.8 19.5 52 19.5C56.4 19.5 60 23.1 60 27.5V39.5C60 43.9 56.4 47.5 52 47.5H47.5L39.5 54V47.5H37.5C33 47.5 29.7 45.2 28.5 41.4"/><path d="M16.5 27.5L22 33L16.5 38.5"/><path d="M23.5 38.5H29.5"/></g><path d="M39.5 6L41.2 10.8L46 12.5L41.2 14.2L39.5 19L37.8 14.2L33 12.5L37.8 10.8L39.5 6Z" fill="#D9FEFF"/></svg>`
const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`
const AUTH_PAGE_LOGO_SVG = `<svg class="logo" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="#0033FF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 24.5C8 19.8 11.8 16 16.5 16H31C35.2 16 37.7 18.1 40 21.7L42.5 25.5"/><path d="M31.5 43H16.5C11.8 43 8 39.2 8 34.5V24.5"/><path d="M41 24.5C44.1 21.1 47.8 19.5 52 19.5C56.4 19.5 60 23.1 60 27.5V39.5C60 43.9 56.4 47.5 52 47.5H47.5L39.5 54V47.5H37.5C33 47.5 29.7 45.2 28.5 41.4"/><path d="M16.5 27.5L22 33L16.5 38.5"/><path d="M23.5 38.5H29.5"/></g><path d="M39.5 6L41.2 10.8L46 12.5L41.2 14.2L39.5 19L37.8 14.2L33 12.5L37.8 10.8L39.5 6Z" fill="#0033FF"/></svg>`

// Local HTTP server for auth callbacks. Start it only after this process owns the
// Electron single-instance lock so second launches do not crash on EADDRINUSE.
const authCallbackServer = createServer((req, res) => {
    const url = new URL(req.url || "", `http://localhost:${AUTH_SERVER_PORT}`)

    // Serve favicon
    if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml" })
      res.end(FAVICON_SVG)
      return
    }

    if (url.pathname === "/callback") {
      // Handle MCP OAuth callback
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      console.log(
        "[Auth Server] Received MCP OAuth callback with code:",
        code?.slice(0, 8) + "...",
        "state:",
        state?.slice(0, 8) + "...",
      )

      if (code && state) {
        // Handle the MCP OAuth callback
        handleMcpOAuthCallback(code, state)

        // Send success response and close the browser tab
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
  <title>${APP_DISPLAY_NAME} - MCP Authentication</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #09090b;
      --text: #fafafa;
      --text-muted: #71717a;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #ffffff;
        --text: #09090b;
        --text-muted: #71717a;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .logo {
      width: 24px;
      height: 24px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    p {
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    ${AUTH_PAGE_LOGO_SVG}
    <h1>MCP Server authenticated</h1>
    <p>You can close this tab</p>
  </div>
  <script>setTimeout(() => window.close(), 1000)</script>
</body>
</html>`)
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" })
        res.end("Missing code or state parameter")
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Not found")
    }
})

let authCallbackServerStartAttempted = false

authCallbackServer.on("error", (error: NodeJS.ErrnoException) => {
  authCallbackServerStartAttempted = false

  if (error.code === "EADDRINUSE") {
    console.warn(
      `[Auth Server] Port ${AUTH_SERVER_PORT} is already in use; continuing without the local callback server.`,
    )
    console.warn(
      `[Auth Server] Close the other ${APP_DISPLAY_NAME} instance or free the port if auth callbacks do not complete.`,
    )
    return
  }

  console.error("[Auth Server] Failed to start local callback server:", error)
})

function startAuthCallbackServer(): void {
  if (authCallbackServerStartAttempted || authCallbackServer.listening) return

  authCallbackServerStartAttempted = true
  authCallbackServer.listen(AUTH_SERVER_PORT, () => {
    console.log(`[Auth Server] Listening on http://localhost:${AUTH_SERVER_PORT}`)
  })
}

function stopAuthCallbackServer(): Promise<void> {
  authCallbackServerStartAttempted = false

  if (!authCallbackServer.listening) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    authCallbackServer.close((error) => {
      if (error) {
        console.warn("[Auth Server] Failed to close local callback server:", error)
      }
      resolve()
    })
  })
}

// Clean up stale lock files from crashed instances
// Returns true if locks were cleaned, false otherwise
function cleanupStaleLocks(): boolean {
  const userDataPath = app.getPath("userData")
  const lockPath = join(userDataPath, "SingletonLock")

  if (!existsSync(lockPath)) return false

  try {
    // SingletonLock is a symlink like "hostname-pid"
    const lockTarget = readlinkSync(lockPath)
    const match = lockTarget.match(/-(\d+)$/)
    if (match) {
      const pid = parseInt(match[1], 10)
      try {
        // Check if process is running (signal 0 doesn't kill, just checks)
        process.kill(pid, 0)
        // Process exists, lock is valid
        console.log("[App] Lock held by running process:", pid)
        return false
      } catch {
        // Process doesn't exist, clean up stale locks
        console.log("[App] Cleaning stale locks (pid", pid, "not running)")
        const filesToRemove = ["SingletonLock", "SingletonSocket", "SingletonCookie"]
        for (const file of filesToRemove) {
          const filePath = join(userDataPath, file)
          if (existsSync(filePath)) {
            try {
              unlinkSync(filePath)
            } catch (e) {
              console.warn("[App] Failed to remove", file, e)
            }
          }
        }
        return true
      }
    }
  } catch (e) {
    console.warn("[App] Failed to check lock file:", e)
  }
  return false
}

async function runHeadlessMain(): Promise<void> {
  let exitCode = 1
  try {
    const db = initDatabase()
    exitCode = await runHeadlessCliCommand({
      argv: process.argv,
      db,
      appVersion: app.getVersion(),
      env: process.env,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    })
  } catch (error) {
    console.error("[Headless] Failed:", error)
    exitCode = 1
  } finally {
    try {
      await closeDatabase()
    } catch (error) {
      console.error("[Headless] Failed to close database:", error)
    }
    app.exit(exitCode)
  }
}

// Prevent multiple instances
if (isHeadlessCliLaunch) {
  app.whenReady().then(runHeadlessMain).catch((error) => {
    console.error("[Headless] Startup failed:", error)
    app.exit(1)
  })

  process.on("uncaughtException", (error) => {
    console.error("[Headless] Uncaught exception:", error)
    app.exit(1)
  })

  process.on("unhandledRejection", (reason, promise) => {
    console.error("[Headless] Unhandled rejection at:", promise, "reason:", reason)
    app.exit(1)
  })
} else {
let gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Maybe stale lock - try cleanup and retry once
  const cleaned = cleanupStaleLocks()
  if (cleaned) {
    gotTheLock = app.requestSingleInstanceLock()
  }
  if (!gotTheLock) {
    let lockOwner = "unknown owner"
    try {
      const lockPath = join(userDataPath, "SingletonLock")
      if (existsSync(lockPath)) {
        lockOwner = readlinkSync(lockPath)
      }
    } catch (error) {
      console.warn("[App] Failed to read SingletonLock owner:", error)
    }
    console.warn(
      `[App] Another ${APP_DISPLAY_NAME} instance is already running (${lockOwner}). Quitting this launch.`,
    )
    app.quit()
  }
}

if (gotTheLock) {
  // Handle second instance launch (also handles deep links on Windows/Linux)
  app.on("second-instance", (_event, commandLine) => {
    // Check for deep link in command line args
    const url = commandLine.find((arg) =>
      SUPPORTED_PROTOCOLS.some((protocol) => arg.startsWith(`${protocol}://`)),
    )
    if (url) {
      handleDeepLink(url)
    }

    // Focus on the first available window
    const windows = getAllWindows()
    if (windows.length > 0) {
      const window = windows[0]!
      if (window.isMinimized()) window.restore()
      window.focus()
    } else {
      // No windows open, create a new one
      createMainWindow()
    }
  })

  // App ready
  app.whenReady().then(async () => {
    // Register protocol handler (must be after app is ready)
    initialRegistration = registerProtocol()

    // Handle deep link on macOS (app already running)
    app.on("open-url", (event, url) => {
      console.log("[Protocol] open-url event received:", sanitizeDeepLinkForLog(url))
      event.preventDefault()
      handleDeepLink(url)
    })

    // Set app user model ID for Windows (different in dev to avoid taskbar conflicts)
    if (process.platform === "win32") {
      app.setAppUserModelId(
        IS_DEV
          ? "io.github.lupanpan1030.locus.dev"
          : "io.github.lupanpan1030.locus",
      )
    }

    console.log(`[App] Starting ${APP_DISPLAY_NAME}...`)

    // Verify protocol registration after app is ready
    // This helps diagnose first-install issues where the protocol isn't recognized yet
    verifyProtocolRegistration()

    // Get Claude Code version for About panel
    let claudeCodeVersion = "unknown"
    try {
      const isDev = !app.isPackaged
      const versionPath = isDev
        ? join(app.getAppPath(), "resources/bin/VERSION")
        : join(process.resourcesPath, "bin/VERSION")

      if (existsSync(versionPath)) {
        const versionContent = readFileSync(versionPath, "utf-8")
        claudeCodeVersion = versionContent.split("\n")[0]?.trim() || "unknown"
      }
    } catch (error) {
      console.warn("[App] Failed to read Claude Code version:", error)
    }

    // Set About panel options with Claude Code version
    app.setAboutPanelOptions({
      applicationName: APP_DISPLAY_NAME,
      applicationVersion: app.getVersion(),
      version: `Claude Code ${claudeCodeVersion}`,
      copyright: APP_COPYRIGHT,
    })

    // Track devtools unlock state (hidden feature - 5 clicks on Beta tab)
    let devToolsUnlocked = false

    // Menu icons: PNG template for settings (auto light/dark via "Template" suffix),
    // macOS native SF Symbol for terminal
    const settingsMenuIcon = nativeImage.createFromPath(
      join(__dirname, "../../build/settingsTemplate.png")
    )
    const terminalMenuIcon = process.platform === "darwin"
      ? nativeImage.createFromNamedImage("terminal")?.resize({ width: 12, height: 12 })
      : null

    // Function to build and set application menu
    const buildMenu = () => {
      // Show devtools menu item only in dev mode or when unlocked
      const showDevTools = !app.isPackaged || devToolsUnlocked
      const localOnly = isLocalOnlyMode()
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: APP_DISPLAY_NAME,
          submenu: [
            {
              label: `About ${APP_DISPLAY_NAME}`,
              click: () => app.showAboutPanel(),
            },
            { type: "separator" },
            {
              label: "Settings...",
              ...(settingsMenuIcon && { icon: settingsMenuIcon }),
              accelerator: "CmdOrCtrl+,",
              click: () => {
                const win = getWindow()
                if (win) {
                  win.webContents.send("shortcut:open-settings")
                }
              },
            },
            { type: "separator" },
            {
              label: isCliInstalled()
                ? "Uninstall 'locus' Command..."
                : "Install 'locus' Command in PATH...",
              ...(terminalMenuIcon && { icon: terminalMenuIcon }),
              click: async () => {
                const { dialog } = await import("electron")
                if (isCliInstalled()) {
                  const result = await uninstallCli()
                  if (result.success) {
                    dialog.showMessageBox({
                      type: "info",
                      message: "CLI command uninstalled",
                      detail: "The 'locus' command has been removed from your PATH.",
                    })
                    buildMenu()
                  } else {
                    dialog.showErrorBox("Uninstallation Failed", result.error || "Unknown error")
                  }
                } else {
                  const result = await installCli()
                  if (result.success) {
                    dialog.showMessageBox({
                      type: "info",
                      message: "CLI command installed",
                      detail:
                        `You can now use 'locus .' in any terminal to open ${APP_DISPLAY_NAME} in that directory.`,
                    })
                    buildMenu()
                  } else {
                    dialog.showErrorBox("Installation Failed", result.error || "Unknown error")
                  }
                }
              },
            },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            {
              label: "Quit",
              accelerator: "CmdOrCtrl+Q",
              click: async () => {
                if (hasActiveClaudeSessions() || hasActiveCodexStreams()) {
                  const { dialog } = await import("electron")
                  const { response } = await dialog.showMessageBox({
                    type: "warning",
                    buttons: ["Cancel", "Quit Anyway"],
                    defaultId: 0,
                    cancelId: 0,
                    title: "Active Sessions",
                    message: "There are active agent sessions running.",
                    detail: "Quitting now will interrupt them. Are you sure you want to quit?",
                  })
                  if (response === 1) {
                    abortAllClaudeSessions()
                    abortAllCodexStreams()
                    setIsQuitting(true)
                    app.quit()
                  }
                } else {
                  app.quit()
                }
              },
            },
          ],
        },
        {
          label: "File",
          submenu: [
            {
              label: "New Chat",
              accelerator: "CmdOrCtrl+N",
              click: () => {
                console.log("[Menu] New Chat clicked (Cmd+N)")
                const win = getWindow()
                if (win) {
                  console.log("[Menu] Sending shortcut:new-agent to renderer")
                  win.webContents.send("shortcut:new-agent")
                } else {
                  console.log("[Menu] No window found!")
                }
              },
            },
            {
              label: "New Window",
              accelerator: "CmdOrCtrl+Shift+N",
              click: () => {
                console.log("[Menu] New Window clicked (Cmd+Shift+N)")
                createWindow()
              },
            },
            { type: "separator" },
            {
              label: "Close Window",
              accelerator: "CmdOrCtrl+W",
              click: () => {
                const win = getWindow()
                if (win) {
                  win.close()
                }
              },
            },
          ],
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            {
              label: "Find",
              accelerator: "CmdOrCtrl+F",
              click: () => {
                const win = BrowserWindow.getFocusedWindow()
                if (win) {
                  win.webContents.send("shortcut:find")
                }
              },
            },
            { role: "selectAll" },
          ],
        },
        {
          label: "View",
          submenu: [
            // Cmd+R is disabled to prevent accidental page refresh
            // Cmd+Shift+R reloads but warns if there are active streams
            {
              label: "Force Reload",
              accelerator: "CmdOrCtrl+Shift+R",
              click: () => {
                const win = BrowserWindow.getFocusedWindow()
                if (!win) return
                if (hasActiveClaudeSessions() || hasActiveCodexStreams()) {
                  dialog
                    .showMessageBox(win, {
                      type: "warning",
                      buttons: ["Cancel", "Reload Anyway"],
                      defaultId: 0,
                      cancelId: 0,
                      title: "Active Sessions",
                      message: "There are active agent sessions running.",
                      detail:
                        "Reloading will interrupt them. The current progress will be saved. Are you sure you want to reload?",
                    })
                    .then(({ response }) => {
                      if (response === 1) {
                        abortAllClaudeSessions()
                        abortAllCodexStreams()
                        win.webContents.reloadIgnoringCache()
                      }
                    })
                } else {
                  win.webContents.reloadIgnoringCache()
                }
              },
            },
            // Only show DevTools in dev mode or when unlocked via hidden feature
            ...(showDevTools ? [{ role: "toggleDevTools" as const }] : []),
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" },
          ],
        },
        {
          label: "Window",
          submenu: [
            { role: "minimize" },
            { role: "zoom" },
            { type: "separator" },
            { role: "front" },
          ],
        },
        {
          role: "help",
          submenu: [
            ...(!localOnly
              ? [
                  {
                    label: "Learn More",
                    click: async () => {
                      await openExternalUrl("open app homepage", APP_HOMEPAGE_URL)
                    },
                  },
                ]
              : []),
          ],
        },
      ]
      Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    }

    // macOS: Set dock menu (right-click on dock icon)
    if (process.platform === "darwin") {
      if (IS_DEV) {
        app.dock?.setBadge("DEV")
      }

      const dockMenu = Menu.buildFromTemplate([
        {
          label: "New Window",
          click: () => {
            console.log("[Dock] New Window clicked")
            createWindow()
          },
        },
      ])
      app.dock?.setMenu(dockMenu)
    }

    // Unlock devtools and rebuild menu (called from renderer via IPC)
    const unlockDevTools = () => {
      if (!devToolsUnlocked) {
        devToolsUnlocked = true
        console.log("[App] DevTools unlocked via hidden feature")
        buildMenu()
      }
    }

    // Expose unlockDevTools globally for IPC handler
    ;(global as any).__unlockDevTools = unlockDevTools

    // Build initial menu
    buildMenu()

    // Initialize auth manager (uses singleton from auth-manager module)
    authManager = initAuthManager(!!process.env.ELECTRON_RENDERER_URL)
    console.log("[App] Auth manager initialized")
    startAuthCallbackServer()

    console.log("[Analytics] Hosted telemetry removed from local-first build")

    // Initialize database
    try {
      const db = initDatabase()
      const interruptedJobs = recoverStaleAgentJobs(db)
      if (interruptedJobs.length > 0) {
        console.warn(
          `[Headless] Marked ${interruptedJobs.length} stale agent job(s) as interrupted.`,
        )
      }
      console.log("[App] Database initialized")
    } catch (error) {
      console.error("[App] Failed to initialize database:", error)
    }

    // Create main window
    createMainWindow()

    startAutomaticAppUpdateChecks()

    // Warm up MCP cache 3 seconds after startup (background, non-blocking)
    // This populates the cache so all future sessions can use filtered MCP servers
    setTimeout(async () => {
      try {
        const results = await Promise.allSettled([
          getAllMcpConfigHandler(),
          getAllCodexMcpConfigHandler(),
        ])

        if (results[0].status === "rejected") {
          console.error("[App] Claude MCP warmup failed:", results[0].reason)
        }
        if (results[1].status === "rejected") {
          console.error("[App] Codex MCP warmup failed:", results[1].reason)
        }
      } catch (error) {
        console.error("[App] MCP warmup failed:", error)
      }
    }, 3000)

    // Handle directory argument from CLI (e.g., `locus /path/to/project`)
    parseLaunchDirectory()

    // Handle deep link from app launch (Windows/Linux)
    const deepLinkUrl = process.argv.find((arg) =>
      SUPPORTED_PROTOCOLS.some((protocol) => arg.startsWith(`${protocol}://`)),
    )
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl)
    }

    // macOS: Re-create window when dock icon is clicked
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })

  // Quit when all windows are closed (except on macOS)
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  // Cleanup before quit
  app.on("before-quit", async () => {
    console.log("[App] Shutting down...")
    cancelAllPendingOAuth()
    await stopAuthCallbackServer()
    await cleanupGitWatchers()
    await closeDatabase()
  })

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("[App] Uncaught exception:", error)
  })

  process.on("unhandledRejection", (reason, promise) => {
    console.error("[App] Unhandled rejection at:", promise, "reason:", reason)
  })
}
}
