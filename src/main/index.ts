import { app, BrowserWindow, Menu } from "electron"
import { join } from "path"
import { readFileSync, existsSync, unlinkSync, readlinkSync } from "fs"
// NOTE: @sentry/electron CANNOT be statically imported - it accesses electron.app at require time
// which fails in dev mode. We use dynamic import in initSentry() instead.
import { initDatabase, closeDatabase } from "./lib/db"
import { createMainWindow, getWindow } from "./windows/main"
import {
  initAnalytics,
  trackAppOpened,
  shutdown as shutdownAnalytics,
} from "./lib/analytics"
import {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  setupFocusUpdateCheck,
} from "./lib/auto-updater"
import { initGhAuth } from "./lib/git/gh-auth-setup"

// Dev mode detection
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

// Set dev mode userData path BEFORE requestSingleInstanceLock()
// This ensures dev and prod have separate instance locks
if (IS_DEV) {
  const { join } = require("path")
  const devUserData = join(app.getPath("userData"), "..", "Agents Dev")
  app.setPath("userData", devUserData)
  console.log("[Dev] Using separate userData path:", devUserData)
}

// Initialize Sentry (production only) - uses dynamic import to avoid dev mode crashes
// @sentry/electron accesses electron.app.getAppPath() at require time
async function initSentry(): Promise<void> {
  if (app.isPackaged && !IS_DEV) {
    const sentryDsn = import.meta.env.MAIN_VITE_SENTRY_DSN
    if (sentryDsn) {
      try {
        const Sentry = await import("@sentry/electron/main")
        Sentry.init({ dsn: sentryDsn })
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
}

// Initialize Sentry asynchronously (non-blocking)
initSentry().catch(console.error)

// URL configuration (exported for use in other modules)
// In packaged app, ALWAYS use production URL to prevent localhost leaking into releases
// In dev mode, allow override via MAIN_VITE_API_URL env variable
export function getBaseUrl(): string {
  if (app.isPackaged) {
    return "https://21st.dev"
  }
  return import.meta.env.MAIN_VITE_API_URL || "https://21st.dev"
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
  // Handle second instance launch
  app.on("second-instance", (_event, commandLine) => {
    const window = getWindow()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  // App ready
  app.whenReady().then(async () => {
    // Set dev mode app name (userData path was already set before requestSingleInstanceLock)
    if (IS_DEV) {
      app.name = "Agents Dev"
    }

    // Set app user model ID for Windows (different in dev to avoid taskbar conflicts)
    if (process.platform === "win32") {
      app.setAppUserModelId(IS_DEV ? "dev.21st.1code.dev" : "dev.21st.1code")
    }

    console.log(`[App] Starting 1Code${IS_DEV ? " (DEV)" : ""}...`)

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

    // Function to build and set application menu
    const buildMenu = () => {
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
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
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

    // Set update state and rebuild menu
    const setUpdateAvailable = (available: boolean, version?: string) => {
      updateAvailable = available
      availableVersion = version || null
      buildMenu()
    }

    // Expose setUpdateAvailable globally for auto-updater
    ;(global as any).__setUpdateAvailable = setUpdateAvailable

    // Build initial menu
    buildMenu()

    // Initialize analytics
    initAnalytics()

    // Track app opened
    trackAppOpened()

    // Initialize database
    try {
      initDatabase()
      console.log("[App] Database initialized")
    } catch (error) {
      console.error("[App] Failed to initialize database:", error)
    }

    // Configure git to use GitHub CLI for private repo auth
    initGhAuth().catch((error) => {
      console.warn("[App] GitHub CLI auth setup failed:", error)
    })

    // Create main window
    createMainWindow()

    // Initialize auto-updater (production only)
    if (app.isPackaged) {
      await initAutoUpdater(getWindow)
      // Setup update check on window focus (instead of periodic interval)
      setupFocusUpdateCheck(getWindow)
      // Check for updates 5 seconds after startup (force to bypass interval check)
      setTimeout(() => {
        checkForUpdates(true)
      }, 5000)
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
