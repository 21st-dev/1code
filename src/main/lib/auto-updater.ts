import { BrowserWindow, ipcMain, app } from "electron"
import log from "electron-log"
import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater"

/**
 * IMPORTANT: Do NOT use lazy/dynamic imports for electron-updater!
 *
 * In v0.0.6 we tried using async getAutoUpdater() with dynamic imports,
 * which broke the auto-updater completely. The synchronous import is required
 * for electron-updater to work correctly.
 *
 * See commit d946614c5 for the broken implementation - do not repeat this mistake.
 */

function initAutoUpdaterConfig() {
  // Configure logging
  log.transports.file.level = "info"
  autoUpdater.logger = log

  // Configure updater behavior
  autoUpdater.autoDownload = false // Let user decide when to download
  autoUpdater.autoInstallOnAppQuit = true // Install on quit if downloaded
  autoUpdater.autoRunAppAfterInstall = true // Restart app after install
}

// CDN base URL for updates
const CDN_BASE = "https://cdn.kosal.io/releases/kcode"

// Minimum interval between update checks (prevent spam on rapid focus/blur)
const MIN_CHECK_INTERVAL = 60 * 1000 // 1 minute
let lastCheckTime = 0

let mainWindow: (() => BrowserWindow | null) | null = null

/**
 * Send update event to renderer process
 */
function sendToRenderer(channel: string, data?: unknown) {
  const win = mainWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

/**
 * Initialize the auto-updater with event handlers and IPC
 */
export async function initAutoUpdater(getWindow: () => BrowserWindow | null) {
  mainWindow = getWindow

  // Initialize config
  initAutoUpdaterConfig()

  // Configure feed URL to point to R2 CDN
  autoUpdater.setFeedURL({
    provider: "generic",
    url: CDN_BASE,
  })

  // Event: Checking for updates
  autoUpdater.on("checking-for-update", () => {
    log.info("[AutoUpdater] Checking for updates...")
    sendToRenderer("update:checking")
  })

  // Event: Update available
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] Update available: v${info.version}`)
    // Update menu to show "Update to vX.X.X..."
    const setUpdateAvailable = (global as any).__setUpdateAvailable
    if (setUpdateAvailable) {
      setUpdateAvailable(true, info.version)
    }
    sendToRenderer("update:available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  // Event: No update available
  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] App is up to date (v${info.version})`)
    sendToRenderer("update:not-available", {
      version: info.version,
    })
  })

  // Event: Download progress
  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    log.info(
      `[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}% ` +
        `(${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`,
    )
    sendToRenderer("update:progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  // Event: Update downloaded
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    log.info(`[AutoUpdater] Update downloaded: v${info.version}`)
    // Reset menu back to "Check for Updates..." since update is ready
    const setUpdateAvailable = (global as any).__setUpdateAvailable
    if (setUpdateAvailable) {
      setUpdateAvailable(false)
    }
    sendToRenderer("update:downloaded", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  // Event: Error
  autoUpdater.on("error", (error: Error) => {
    log.error("[AutoUpdater] Error:", error.message)
    sendToRenderer("update:error", error.message)
  })

  // Register IPC handlers
  registerIpcHandlers()

  log.info("[AutoUpdater] Initialized with feed URL:", CDN_BASE)
}

/**
 * Register IPC handlers for update operations
 */
function registerIpcHandlers() {
  // Check for updates
  ipcMain.handle("update:check", async () => {
    if (!app.isPackaged) {
      log.info("[AutoUpdater] Skipping update check in dev mode")
      return null
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.updateInfo || null
    } catch (error) {
      log.error("[AutoUpdater] Check failed:", error)
      return null
    }
  })

  // Download update
  ipcMain.handle("update:download", async () => {
    try {
      await autoUpdater.downloadUpdate()
      return true
    } catch (error) {
      log.error("[AutoUpdater] Download failed:", error)
      return false
    }
  })

  // Install update and restart
  ipcMain.handle("update:install", () => {
    log.info("[AutoUpdater] Installing update and restarting...")
    // Give renderer time to save state
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true)
    }, 100)
  })

  // Get current update state (useful for re-renders)
  ipcMain.handle("update:get-state", () => {
    return {
      currentVersion: app.getVersion(),
    }
  })
}

/**
 * Manually trigger an update check
 * @param force - Skip the minimum interval check
 */
export async function checkForUpdates(force = false) {
  if (!app.isPackaged) {
    log.info("[AutoUpdater] Skipping update check in dev mode")
    return Promise.resolve(null)
  }

  // Respect minimum interval to prevent spam
  const now = Date.now()
  if (!force && now - lastCheckTime < MIN_CHECK_INTERVAL) {
    log.info(
      `[AutoUpdater] Skipping check - last check was ${Math.round((now - lastCheckTime) / 1000)}s ago`,
    )
    return Promise.resolve(null)
  }

  lastCheckTime = now
  return autoUpdater.checkForUpdates()
}

/**
 * Start downloading the update
 */
export async function downloadUpdate() {
  if (!app.isPackaged) {
    log.info("[AutoUpdater] Skipping download in dev mode")
    return false
  }

  try {
    log.info("[AutoUpdater] Starting update download...")
    await autoUpdater.downloadUpdate()
    return true
  } catch (error) {
    log.error("[AutoUpdater] Download failed:", error)
    return false
  }
}

/**
 * Check for updates when window gains focus
 * This is more natural than checking on an interval
 */
export function setupFocusUpdateCheck(getWindow: () => BrowserWindow | null) {
  // Listen for window focus events
  app.on("browser-window-focus", () => {
    log.info("[AutoUpdater] Window focused - checking for updates")
    checkForUpdates()
  })
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}
