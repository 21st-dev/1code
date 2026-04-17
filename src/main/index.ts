import * as Sentry from "@sentry/electron/main"
import { app, BrowserWindow, dialog, Menu, nativeImage } from "electron"
import { existsSync, readFileSync, readlinkSync, unlinkSync } from "fs"
import { createServer } from "http"
import { join } from "path"
import {
  initAnalytics,
  shutdown as shutdownAnalytics,
  trackAppOpened,
} from "./lib/analytics"
import {
  checkForUpdates,
  downloadUpdate,
  initAutoUpdater,
  setupFocusUpdateCheck,
} from "./lib/auto-updater"
import { closeDatabase, initDatabase } from "./lib/db"
import { runOpenCodexPackagingPreflight } from "./lib/opencodex/preflight"
import {
  maybeStartOpenCodexBackendHost,
  stopOpenCodexBackendHost,
} from "./lib/opencodex/backend-host"
import { setOpenCodexStartupState } from "./lib/opencodex/startup-state"
import { getOpenCodexAppUserModelId, getOpenCodexAuthPageTitle, getOpenCodexCopyright, getOpenCodexProtocol, getOpenCodexSupportUrl, getOpenCodexWebAppUrl, getOpenCodexWebBaseUrl, OPENCODEX_PRODUCT_NAME } from "./lib/opencodex/app-identity"
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
import {
  createMainWindow,
  createWindow,
  getWindow,
  getAllWindows,
  setIsQuitting,
} from "./windows/main"

import { IS_DEV, AUTH_SERVER_PORT } from "./constants"

// Deep link protocol (must match package.json build.protocols.schemes)
// Use different protocol in dev to avoid conflicts with production app
const PROTOCOL = getOpenCodexProtocol(IS_DEV)

// Set dev mode userData path BEFORE requestSingleInstanceLock()
// This ensures dev and prod have separate instance locks
if (IS_DEV) {
  const { join } = require("path")
  const devUserData = join(app.getPath("userData"), "..", "Agents Dev")
  app.setPath("userData", devUserData)
  console.log("[Dev] Using separate userData path:", devUserData)
}

// Increase V8 old-space limit for renderer/main processes to reduce OOM frequency
// under heavy multi-chat workloads. Must be set before app readiness/window creation.
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=8192")

// Initialize Sentry before app is ready (production only)
if (app.isPackaged && !IS_DEV) {
  const sentryDsn = import.meta.env.MAIN_VITE_SENTRY_DSN
  if (sentryDsn) {
    try {
      Sentry.init({
        dsn: sentryDsn,
      })
      console.log("[App] Sentry initialized")
    } catch (error) {
      console.warn("[App] Failed to initialize Sentry:", error)
    }
  } else {
    console.log("[App] Skipping Sentry initialization (no DSN configured)")
  }
} else {
  console.log("[App] Skipping Sentry initialization (dev mode)")
}

// URL configuration (exported for use in other modules)
// In packaged app, ALWAYS use production URL to prevent localhost leaking into releases
// In dev mode, allow override via MAIN_VITE_API_URL env variable
export function getBaseUrl(): string {
  return getOpenCodexWebBaseUrl({
    OPENCODEX_WEB_URL: process.env.OPENCODEX_WEB_URL,
    MAIN_VITE_API_URL: import.meta.env.MAIN_VITE_API_URL,
  })
}

export function getAppUrl(): string {
  return getOpenCodexWebAppUrl({
    OPENCODEX_WEB_URL: process.env.OPENCODEX_WEB_URL,
    MAIN_VITE_API_URL: import.meta.env.MAIN_VITE_API_URL,
    ELECTRON_RENDERER_URL: process.env.ELECTRON_RENDERER_URL,
  })
}

// Handle deep link
function handleDeepLink(url: string): void {
  console.log("[DeepLink] Received:", url)

  try {
    const parsed = new URL(url)

    // Handle MCP OAuth callback: opencodex://mcp-oauth?code=xxx&state=yyy
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
console.log("[Protocol] Protocol:", PROTOCOL)
console.log("[Protocol] Is dev mode (process.defaultApp):", process.defaultApp)
console.log("[Protocol] process.execPath:", process.execPath)
console.log("[Protocol] process.argv:", process.argv)

/**
 * Register the app as the handler for our custom protocol.
 * On macOS, this may not take effect immediately on first install -
 * Launch Services caches protocol handlers and may need time to update.
 */
function registerProtocol(): boolean {
  let success = false

  if (process.defaultApp) {
    // Dev mode: need to pass execPath and script path
    if (process.argv.length >= 2) {
      success = app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        process.argv[1]!,
      ])
      console.log(
        `[Protocol] Dev mode registration:`,
        success ? "success" : "failed",
      )
    } else {
      console.warn("[Protocol] Dev mode: insufficient argv for registration")
    }
  } else {
    // Production mode
    success = app.setAsDefaultProtocolClient(PROTOCOL)
    console.log(
      `[Protocol] Production registration:`,
      success ? "success" : "failed",
    )
  }

  return success
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

// SVG favicon as data URI for auth callback pages (matches web app favicon)
const FAVICON_SVG = `<svg width="32" height="32" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#0033FF"/><path fill-rule="evenodd" clip-rule="evenodd" d="M800.165 148C842.048 148 876 181.952 876 223.835V686.415C876 690.606 872.606 694 868.415 694H640.915C636.729 694 633.335 697.394 633.335 701.585V868.415C633.335 872.606 629.936 876 625.75 876H223.835C181.952 876 148 842.048 148 800.165V702.59C148 697.262 150.807 692.326 155.376 689.586L427.843 526.1C434.031 522.388 431.956 513.238 425.327 512.118L423.962 512H155.585C151.394 512 148 508.606 148 504.415V337.585C148 333.394 151.394 330 155.585 330H443.75C447.936 330 451.335 326.606 451.335 322.415V155.585C451.335 151.394 454.729 148 458.915 148H800.165ZM458.915 330C454.729 330 451.335 333.394 451.335 337.585V686.415C451.335 690.606 454.729 694 458.915 694H625.75C629.936 694 633.335 690.606 633.335 686.415V337.585C633.335 333.394 629.936 330 625.75 330H458.915Z" fill="#F4F4F4"/></svg>`
const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`

// Start local HTTP server for MCP OAuth callbacks.
// This catches http://localhost:{AUTH_SERVER_PORT}/callback?code=xxx&state=yyy.
const server = createServer((req, res) => {
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
  <title>${getOpenCodexAuthPageTitle("MCP Authentication")}</title>
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
    <svg class="logo" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M14.3333 0C15.2538 0 16 0.746192 16 1.66667V11.8333C16 11.9254 15.9254 12 15.8333 12H10.8333C10.7413 12 10.6667 12.0746 10.6667 12.1667V15.8333C10.6667 15.9254 10.592 16 10.5 16H1.66667C0.746192 16 0 15.2538 0 14.3333V12.1888C0 12.0717 0.0617409 11.9632 0.162081 11.903L6.15043 8.30986C6.28644 8.22833 6.24077 8.02716 6.09507 8.00256L6.06511 8H0.166667C0.0746186 8 0 7.92538 0 7.83333V4.16667C0 4.07462 0.0746193 4 0.166667 4H6.5C6.59205 4 6.66667 3.92538 6.66667 3.83333V0.166667C6.66667 0.0746193 6.74129 0 6.83333 0H14.3333ZM6.83333 4C6.74129 4 6.66667 4.07462 6.66667 4.16667V11.8333C6.66667 11.9254 6.74129 12 6.83333 12H10.5C10.592 12 10.6667 11.9254 10.6667 11.8333V4.16667C10.6667 4.07462 10.592 4 10.5 4H6.83333Z" fill="#0033FF"/>
    </svg>
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

server.listen(AUTH_SERVER_PORT, () => {
  console.log(`[Auth Server] Listening on http://localhost:${AUTH_SERVER_PORT}`)
})

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

// Prevent multiple instances
let gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Maybe stale lock - try cleanup and retry once
  const cleaned = cleanupStaleLocks()
  if (cleaned) {
    gotTheLock = app.requestSingleInstanceLock()
  }
  if (!gotTheLock) {
    app.quit()
  }
}

let openCodexReadyServicesInitialized = false

export async function initializeOpenCodexReadyServices(): Promise<void> {
  if (openCodexReadyServicesInitialized) {
    return
  }

  try {
    initDatabase()
    console.log("[App] Database initialized")
  } catch (error) {
    console.error("[App] Failed to initialize database:", error)
  }

  if (app.isPackaged) {
    try {
      await initAutoUpdater(getAllWindows)
      setupFocusUpdateCheck(getAllWindows)
      setTimeout(() => {
        checkForUpdates(true)
      }, 5000)
    } catch (error) {
      console.error("[App] Failed to initialize auto-updater:", error)
    }
  }

  try {
    const backendHostState = await maybeStartOpenCodexBackendHost({
      appRoot: app.getAppPath(),
      userDataPath: app.getPath("userData"),
      workspacePath: app.getAppPath(),
    })
    console.log("[OpenCodex] Backend host state:", backendHostState.status)
    if (backendHostState.lastError) {
      console.warn("[OpenCodex] Backend host detail:", backendHostState.lastError)
    }
  } catch (error) {
    console.error("[OpenCodex] Failed to start backend host:", error)
  }

  openCodexReadyServicesInitialized = true
}

if (gotTheLock) {
  // Handle second instance launch (also handles deep links on Windows/Linux)
  app.on("second-instance", (_event, commandLine) => {
    // Check for deep link in command line args
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`))
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
    // Set dev mode app name (userData path was already set before requestSingleInstanceLock)
    // if (IS_DEV) {
    //   app.name = "Agents Dev"
    // }


    // Register protocol handler (must be after app is ready)
    initialRegistration = registerProtocol()

    // Handle deep link on macOS (app already running)
    app.on("open-url", (event, url) => {
      console.log("[Protocol] open-url event received:", url)
      event.preventDefault()
      handleDeepLink(url)
    })

    // Set app user model ID for Windows (different in dev to avoid taskbar conflicts)
    if (process.platform === "win32") {
      app.setAppUserModelId(getOpenCodexAppUserModelId(IS_DEV))
    }

    console.log(`[App] Starting ${OPENCODEX_PRODUCT_NAME}${IS_DEV ? " (DEV)" : ""}...`)

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
      applicationName: OPENCODEX_PRODUCT_NAME,
      applicationVersion: app.getVersion(),
      version: `Claude Code ${claudeCodeVersion}`,
      copyright: getOpenCodexCopyright(2026),
    })

    // Track update availability for menu
    let updateAvailable = false
    let availableVersion: string | null = null
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
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: app.name,
          submenu: [
            {
              label: `About ${OPENCODEX_PRODUCT_NAME}`,
              click: () => app.showAboutPanel(),
            },
            {
              label: updateAvailable
                ? `Update to v${availableVersion}...`
                : "Check for Updates...",
              click: () => {
                // Send event to renderer to clear dismiss state
                const win = getWindow()
                if (win) {
                  win.webContents.send("update:manual-check")
                }
                // If update is already available, start downloading immediately
                if (updateAvailable) {
                  downloadUpdate()
                } else {
                  checkForUpdates(true)
                }
              },
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
                ? "Uninstall 'opencodex' Command..."
                : "Install 'opencodex' Command in PATH...",
              ...(terminalMenuIcon && { icon: terminalMenuIcon }),
              click: async () => {
                const { dialog } = await import("electron")
                if (isCliInstalled()) {
                  const result = await uninstallCli()
                  if (result.success) {
                    dialog.showMessageBox({
                      type: "info",
                      message: "CLI command uninstalled",
                      detail: "The 'opencodex' command has been removed from your PATH.",
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
                        "You can now use 'opencodex .' in any terminal to open OpenCodex in that directory.",
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
            {
              label: "OpenCodex Support",
              click: async () => {
                const { shell } = await import("electron")
                await shell.openExternal(getOpenCodexSupportUrl())
              },
            },
          ],
        },
      ]
      Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    }

    // macOS: Set dock menu (right-click on dock icon)
    if (process.platform === "darwin") {
      const dockMenu = Menu.buildFromTemplate([
        {
          label: "New Window",
          click: () => {
            console.log("[Dock] New Window clicked")
            createWindow()
          },
        },
      ])
      app.dock.setMenu(dockMenu)
    }

    // Set update state and rebuild menu
    const setUpdateAvailable = (available: boolean, version?: string) => {
      updateAvailable = available
      availableVersion = version || null
      buildMenu()
    }

    // Unlock devtools and rebuild menu (called from renderer via IPC)
    const unlockDevTools = () => {
      if (!devToolsUnlocked) {
        devToolsUnlocked = true
        console.log("[App] DevTools unlocked via hidden feature")
        buildMenu()
      }
    }

    // Expose setUpdateAvailable globally for auto-updater
    ;(global as any).__setUpdateAvailable = setUpdateAvailable
    // Expose unlockDevTools globally for IPC handler
    ;(global as any).__unlockDevTools = unlockDevTools

    // Build initial menu
    buildMenu()

    initAnalytics()

    trackAppOpened()

    const startupState = (() => {
      try {
        const preflight = runOpenCodexPackagingPreflight({
          userDataPath: app.getPath("userData"),
          appVersion: app.getVersion(),
        })
        console.log("[OpenCodex] Packaging preflight ready", {
          importedLegacyDesktopDb: preflight.importedLegacyDesktopDb,
          rootDir: preflight.paths.rootDir,
        })
        return setOpenCodexStartupState({ status: "ready" })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "OpenCodex startup blocked by an unexpected packaging preflight failure."
        console.error("[OpenCodex] Packaging preflight failed:", error)
        return setOpenCodexStartupState({
          status: "blocked",
          reason: "packaging-preflight",
          message,
        })
      }
    })()

    if (startupState.status === "ready") {
      await initializeOpenCodexReadyServices()
    } else {
      console.warn("[OpenCodex] Starting in blocked UI mode", startupState)
    }

    // Create main window
    createMainWindow()

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

    // Handle directory argument from CLI (e.g., `opencodex /path/to/project`)
    parseLaunchDirectory()

    // Handle deep link from app launch (Windows/Linux)
    const deepLinkUrl = process.argv.find((arg) =>
      arg.startsWith(`${PROTOCOL}://`),
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
    await stopOpenCodexBackendHost()
    await cleanupGitWatchers()
    await shutdownAnalytics()
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
