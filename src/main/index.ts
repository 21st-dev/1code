import { app, BrowserWindow, dialog, Menu, nativeImage, session } from "electron"
import { existsSync, readFileSync, readlinkSync, unlinkSync } from "fs"
import { createServer } from "http"
import { join } from "path"
import { AuthManager, initAuthManager, getAuthManager as getAuthManagerFromModule } from "./auth-manager"
import { isLocalOnlyMode } from "./lib/local-only"
import { closeDatabase, initDatabase } from "./lib/db"
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
import { windowManager } from "./windows/window-manager"

import { IS_DEV, AUTH_SERVER_PORT } from "./constants"

const APP_NAME = "Agent Code for Me"
const APP_COPYRIGHT = "Copyright © 2026 Agent Code for Me"
const HOSTED_API_BASE_URL = import.meta.env.MAIN_VITE_API_URL || ""
const APP_HOMEPAGE_URL = "https://github.com/lupanpan1030/agent-code-for-me"

// Deep link protocol (must match package.json build.protocols.schemes)
// Use different protocol in dev to avoid conflicts with production app
const PROTOCOL = IS_DEV ? "agent-code-for-me-dev" : "agent-code-for-me"

// Set dev mode userData path BEFORE requestSingleInstanceLock()
// This ensures dev and prod have separate instance locks
if (IS_DEV) {
  const { join } = require("path")
  const devUserData = join(app.getPath("userData"), "..", `${APP_NAME} Dev`)
  app.setPath("userData", devUserData)
  console.log("[Dev] Using separate userData path:", devUserData)
}

// Increase V8 old-space limit for renderer/main processes to reduce OOM frequency
// under heavy multi-chat workloads. Must be set before app readiness/window creation.
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=8192")

// URL configuration (exported for optional hosted/internal builds)
export function getBaseUrl(): string {
  return HOSTED_API_BASE_URL
}

export function getAppUrl(): string | null {
  return (
    process.env.ELECTRON_RENDERER_URL ||
    (isLocalOnlyMode() || !HOSTED_API_BASE_URL
      ? null
      : `${HOSTED_API_BASE_URL}/agents`)
  )
}

// Auth manager singleton (use the one from auth-manager module)
let authManager: AuthManager

export function getAuthManager(): AuthManager {
  // First try to get from module, fallback to local variable for backwards compat
  return getAuthManagerFromModule() || authManager
}

// Handle auth code from deep link (exported for IPC handlers)
export async function handleAuthCode(code: string): Promise<void> {
  console.log("[Auth] Handling auth code:", code.slice(0, 8) + "...")

  try {
    const authData = await authManager.exchangeCode(code)
    console.log("[Auth] Success for user:", authData.user.email)

    // Set desktop token cookie using persist:main partition
    const ses = session.fromPartition("persist:main")
    try {
      // First remove any existing cookie to avoid HttpOnly conflict
      await ses.cookies.remove(getBaseUrl(), "x-desktop-token")
      await ses.cookies.set({
        url: getBaseUrl(),
        name: "x-desktop-token",
        value: authData.token,
        expirationDate: Math.floor(
          new Date(authData.expiresAt).getTime() / 1000,
        ),
        httpOnly: false,
        secure: getBaseUrl().startsWith("https"),
        sameSite: "lax" as const,
      })
      console.log("[Auth] Desktop token cookie set")
    } catch (cookieError) {
      // Cookie setting is optional - auth data is already saved to disk
      console.warn("[Auth] Cookie set failed (non-critical):", cookieError)
    }

    // Notify all windows and reload them to show app
    const windows = getAllWindows()
    for (const win of windows) {
      try {
        if (win.isDestroyed()) continue
        win.webContents.send("auth:success", authData.user)

        // Use stable window ID (main, window-2, etc.) instead of Electron's numeric ID
        const stableId = windowManager.getStableId(win)

        if (process.env.ELECTRON_RENDERER_URL) {
          // Pass window ID via query param for dev mode
          const url = new URL(process.env.ELECTRON_RENDERER_URL)
          url.searchParams.set("windowId", stableId)
          win.loadURL(url.toString())
        } else {
          // Pass window ID via hash for production
          win.loadFile(join(__dirname, "../renderer/index.html"), {
            hash: `windowId=${stableId}`,
          })
        }
      } catch (error) {
        // Window may have been destroyed during iteration
        console.warn("[Auth] Failed to reload window:", error)
      }
    }
    // Focus the first window
    windows[0]?.focus()
  } catch (error) {
    console.error("[Auth] Exchange failed:", error)
    // Broadcast auth error to all windows (not just focused)
    for (const win of getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send("auth:error", (error as Error).message)
        }
      } catch {
        // Window destroyed during iteration
      }
    }
  }
}

// Handle deep link
function handleDeepLink(url: string): void {
  console.log("[DeepLink] Received:", url)

  try {
    const parsed = new URL(url)

    // Handle auth callback: agent-code-for-me://auth?code=xxx
    if (parsed.pathname === "/auth" || parsed.host === "auth") {
      const code = parsed.searchParams.get("code")
      if (code) {
        handleAuthCode(code)
        return
      }
    }

    // Handle MCP OAuth callback: agent-code-for-me://mcp-oauth?code=xxx&state=yyy
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

// SVG favicon and auth-page mark.
const FAVICON_SVG = `<svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="14" fill="#111827"/><g stroke="#D9FEFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 24.5C8 19.8 11.8 16 16.5 16H31C35.2 16 37.7 18.1 40 21.7L42.5 25.5"/><path d="M31.5 43H16.5C11.8 43 8 39.2 8 34.5V24.5"/><path d="M41 24.5C44.1 21.1 47.8 19.5 52 19.5C56.4 19.5 60 23.1 60 27.5V39.5C60 43.9 56.4 47.5 52 47.5H47.5L39.5 54V47.5H37.5C33 47.5 29.7 45.2 28.5 41.4"/><path d="M16.5 27.5L22 33L16.5 38.5"/><path d="M23.5 38.5H29.5"/></g><path d="M39.5 6L41.2 10.8L46 12.5L41.2 14.2L39.5 19L37.8 14.2L33 12.5L37.8 10.8L39.5 6Z" fill="#D9FEFF"/></svg>`
const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`
const AUTH_PAGE_LOGO_SVG = `<svg class="logo" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="#0033FF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 24.5C8 19.8 11.8 16 16.5 16H31C35.2 16 37.7 18.1 40 21.7L42.5 25.5"/><path d="M31.5 43H16.5C11.8 43 8 39.2 8 34.5V24.5"/><path d="M41 24.5C44.1 21.1 47.8 19.5 52 19.5C56.4 19.5 60 23.1 60 27.5V39.5C60 43.9 56.4 47.5 52 47.5H47.5L39.5 54V47.5H37.5C33 47.5 29.7 45.2 28.5 41.4"/><path d="M16.5 27.5L22 33L16.5 38.5"/><path d="M23.5 38.5H29.5"/></g><path d="M39.5 6L41.2 10.8L46 12.5L41.2 14.2L39.5 19L37.8 14.2L33 12.5L37.8 10.8L39.5 6Z" fill="#0033FF"/></svg>`

// Start local HTTP server for auth callbacks
// This catches http://localhost:{AUTH_SERVER_PORT}/auth/callback?code=xxx and /callback (for MCP OAuth)
const server = createServer((req, res) => {
    const url = new URL(req.url || "", `http://localhost:${AUTH_SERVER_PORT}`)

    // Serve favicon
    if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml" })
      res.end(FAVICON_SVG)
      return
    }

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code")
      console.log(
        "[Auth Server] Received callback with code:",
        code?.slice(0, 8) + "...",
      )

      if (code) {
        // Handle the auth code
        handleAuthCode(code)

        // Send success response and close the browser tab
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
  <title>Agent Code for Me - Authentication</title>
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
    <h1>Authentication successful</h1>
    <p>You can close this tab</p>
  </div>
  <script>setTimeout(() => window.close(), 1000)</script>
</body>
</html>`)
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" })
        res.end("Missing code parameter")
      }
    } else if (url.pathname === "/callback") {
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
  <title>Agent Code for Me - MCP Authentication</title>
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
    //   app.name = "Agent Code for Me Dev"
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
      app.setAppUserModelId(
        IS_DEV
          ? "io.github.lupanpan1030.agentcodeforme.dev"
          : "io.github.lupanpan1030.agentcodeforme",
      )
    }

    console.log(`[App] Starting ${APP_NAME}${IS_DEV ? " (DEV)" : ""}...`)

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
      applicationName: APP_NAME,
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
          label: app.name,
          submenu: [
            {
              label: `About ${APP_NAME}`,
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
                ? "Uninstall '1code' Command..."
                : "Install '1code' Command in PATH...",
              ...(terminalMenuIcon && { icon: terminalMenuIcon }),
              click: async () => {
                const { dialog } = await import("electron")
                if (isCliInstalled()) {
                  const result = await uninstallCli()
                  if (result.success) {
                    dialog.showMessageBox({
                      type: "info",
                      message: "CLI command uninstalled",
                      detail: "The '1code' command has been removed from your PATH.",
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
                        `You can now use '1code .' in any terminal to open ${APP_NAME} in that directory.`,
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
            ...(!localOnly
              ? [
                  {
                    label: "Learn More",
                    click: async () => {
                      const { shell } = await import("electron")
                      await shell.openExternal(APP_HOMEPAGE_URL)
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

    console.log("[Analytics] Hosted telemetry removed from local-first build")

    // Set up callback to update cookie when token is refreshed
    authManager.setOnTokenRefresh(async (authData) => {
      console.log("[Auth] Token refreshed, updating cookie...")
      const ses = session.fromPartition("persist:main")
      try {
        await ses.cookies.set({
          url: getBaseUrl(),
          name: "x-desktop-token",
          value: authData.token,
          expirationDate: Math.floor(
            new Date(authData.expiresAt).getTime() / 1000,
          ),
          httpOnly: false,
          secure: getBaseUrl().startsWith("https"),
          sameSite: "lax" as const,
        })
        console.log("[Auth] Desktop token cookie updated after refresh")
      } catch (err) {
        console.error("[Auth] Failed to update cookie:", err)
      }
    })

    // Initialize database
    try {
      initDatabase()
      console.log("[App] Database initialized")
    } catch (error) {
      console.error("[App] Failed to initialize database:", error)
    }

    // Create main window
    createMainWindow()

    console.log("[AutoUpdater] Hosted updater removed from local-first build")

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

    // Handle directory argument from CLI (e.g., `1code /path/to/project`)
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
