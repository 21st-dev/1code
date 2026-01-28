import * as Sentry from "@sentry/electron/main"
import { app, BrowserWindow, Menu, session } from "electron"
import { existsSync, readFileSync, readlinkSync, unlinkSync } from "fs"
import { createServer } from "http"
import { join } from "path"
import { AuthManager, initAuthManager, getAuthManager as getAuthManagerFromModule } from "./auth-manager"
import {
  identify,
  initAnalytics,
  setSubscriptionPlan,
  shutdown as shutdownAnalytics,
  trackAppOpened,
  trackAuthCompleted,
} from "./lib/analytics"
import {
  checkForUpdates,
  downloadUpdate,
  initAutoUpdater,
  setupFocusUpdateCheck,
} from "./lib/auto-updater"
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
import {
  createMainWindow,
  createWindow,
  getWindow,
  getAllWindows,
} from "./windows/main"
import { windowManager } from "./windows/window-manager"

import { IS_DEV, AUTH_SERVER_PORT } from "./constants"

// Deep link protocol (must match package.json build.protocols.schemes)
// Use different protocol in dev to avoid conflicts with production app
const PROTOCOL = IS_DEV ? "twentyfirst-agents-dev" : "twentyfirst-agents"

// Set dev mode userData path BEFORE requestSingleInstanceLock()
// This ensures dev and prod have separate instance locks
if (IS_DEV) {
  const { join } = require("path")
  const devUserData = join(app.getPath("userData"), "..", "Agents Dev")
  app.setPath("userData", devUserData)
  console.log("[Dev] Using separate userData path:", devUserData)
}

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
  if (app.isPackaged) {
    return "https://21st.dev"
  }
  return import.meta.env.MAIN_VITE_API_URL || "https://21st.dev"
}

export function getAppUrl(): string {
  return process.env.ELECTRON_RENDERER_URL || "https://21st.dev/agents"
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

    // Track successful authentication
    trackAuthCompleted(authData.user.id, authData.user.email)

    // Fetch and set subscription plan for analytics
    try {
      const planData = await authManager.fetchUserPlan()
      if (planData) {
        setSubscriptionPlan(planData.plan)
      }
    } catch (e) {
      console.warn("[Auth] Failed to fetch user plan for analytics:", e)
    }

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

    // Handle auth callback: twentyfirst-agents://auth?code=xxx
    if (parsed.pathname === "/auth" || parsed.host === "auth") {
      const code = parsed.searchParams.get("code")
      if (code) {
        handleAuthCode(code)
        return
      }
    }

    // Handle MCP OAuth callback: twentyfirst-agents://mcp-oauth?code=xxx&state=yyy
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
  <title>1Code - Authentication</title>
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
  <title>1Code - MCP Authentication</title>
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
    if (IS_DEV) {
      app.name = "Agents Dev"
    }

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
      app.setAppUserModelId(IS_DEV ? "dev.21st.1code.dev" : "dev.21st.1code")
    }

    console.log(`[App] Starting 1Code${IS_DEV ? " (DEV)" : ""}...`)

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
      applicationName: "1Code",
      applicationVersion: app.getVersion(),
      version: `Claude Code ${claudeCodeVersion}`,
      copyright: "Copyright © 2026 21st.dev",
    })

    // Track update availability for menu
    let updateAvailable = false
    let availableVersion: string | null = null
    // Track devtools unlock state (hidden feature - 5 clicks on Beta tab)
    let devToolsUnlocked = false

    // Function to build and set application menu
    const buildMenu = () => {
      // Show devtools menu item only in dev mode or when unlocked
      const showDevTools = !app.isPackaged || devToolsUnlocked
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: app.name,
          submenu: [
            { role: "about", label: "About 1Code" },
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
              label: isCliInstalled()
                ? "Uninstall '1code' Command..."
                : "Install '1code' Command in PATH...",
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
                        "You can now use '1code .' in any terminal to open 1Code in that directory.",
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
            { role: "quit" },
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
            // Use Cmd+Shift+R (Force Reload) for intentional reloads
            { role: "forceReload" },
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
              label: "Learn More",
              click: async () => {
                const { shell } = await import("electron")
                await shell.openExternal("https://21st.dev")
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

    // Initialize auth manager (uses singleton from auth-manager module)
    authManager = initAuthManager(!!process.env.ELECTRON_RENDERER_URL)
    console.log("[App] Auth manager initialized")

    // Initialize analytics after auth manager so we can identify user
    initAnalytics()

    // If user already authenticated from previous session, identify them
    if (authManager.isAuthenticated()) {
      const user = authManager.getUser()
      if (user) {
        identify(user.id, { email: user.email })
        console.log("[Analytics] User identified from saved session:", user.id)
      }
    }

    // Track app opened (now with correct user ID if authenticated)
    trackAppOpened()

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

    // Initialize auto-updater (production only)
    if (app.isPackaged) {
      await initAutoUpdater(getAllWindows)
      // Setup update check on window focus (instead of periodic interval)
      setupFocusUpdateCheck(getAllWindows)
      // Check for updates 5 seconds after startup (force to bypass interval check)
      setTimeout(() => {
        checkForUpdates(true)
      }, 5000)
    }

    // Warm up MCP cache 3 seconds after startup (background, non-blocking)
    // This populates the cache so all future sessions can use filtered MCP servers
    setTimeout(async () => {
      try {
        const { getAllMcpConfigHandler } = await import("./lib/trpc/routers/claude")
        await getAllMcpConfigHandler()
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
