import {
  BrowserWindow,
  Notification,
  shell,
  nativeTheme,
  ipcMain,
  app,
  clipboard,
  nativeImage,
  dialog,
} from "electron"
import { join } from "path"
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs"
import { createIPCHandler } from "trpc-electron/main"
import { createAppRouter } from "../lib/trpc/routers"
import { getBaseUrl } from "../index"
import { registerGitWatcherIPC } from "../lib/git/watcher"
import { hasActiveClaudeSessions, abortAllClaudeSessions } from "../lib/trpc/routers/claude"
import { hasActiveCodexStreams, abortAllCodexStreams } from "../lib/trpc/routers/codex"
import { registerThemeScannerIPC } from "../lib/vscode-theme-scanner"
import { readOpenCodexReleaseMetadata } from "../lib/opencodex/preflight"
import { getOpenCodexStartupState, refreshOpenCodexStartupState } from "../lib/opencodex/startup-state"
import { formatOpenCodexWindowTitle, getOpenCodexTrustedHosts } from "../lib/opencodex/app-identity"
import {
  getOpenCodexBackendHostState,
  restartOpenCodexBackendHost,
} from "../lib/opencodex/backend-host"
import {
  readOpenCodexBackendConfig,
  resetOpenCodexBackendConfig,
  saveOpenCodexBackendConfig,
} from "../lib/opencodex/backend-config"
import {
  readOpenCodexLocalProfile,
  resetOpenCodexLocalProfile,
  updateOpenCodexLocalProfile,
} from "../lib/opencodex/local-profile"
import { windowManager } from "./window-manager"

// Flag to bypass close confirmation when app.quit() has already been confirmed
let isQuitting = false

export function setIsQuitting(value: boolean): void {
  isQuitting = value
}

// Helper to get window from IPC event
function getWindowFromEvent(
  event: Electron.IpcMainInvokeEvent,
): BrowserWindow | null {
  const webContents = event.sender
  const win = BrowserWindow.fromWebContents(webContents)
  return win && !win.isDestroyed() ? win : null
}

// Register IPC handlers for window operations (only once)
let ipcHandlersRegistered = false

function registerIpcHandlers(): void {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true

  // App info
  ipcMain.handle("app:version", () => app.getVersion())
  ipcMain.handle("app:isPackaged", () => app.isPackaged)
  ipcMain.handle("app:get-startup-state", () => getOpenCodexStartupState())
  ipcMain.handle("app:get-release-metadata", () =>
    readOpenCodexReleaseMetadata({ userDataPath: app.getPath("userData") }),
  )
  ipcMain.handle("app:retry-startup-preflight", async () => {
    const state = refreshOpenCodexStartupState({
      userDataPath: app.getPath("userData"),
      appVersion: app.getVersion(),
    })

    if (state.status === "ready") {
      const { initializeOpenCodexReadyServices } = await import("../index")
      await initializeOpenCodexReadyServices()
    }

    for (const win of windowManager.getAll()) {
      void loadWindowContent(win)
    }

    return state
  })

  // Windows: Frame preference persistence
  ipcMain.handle("window:set-frame-preference", (_event, useNativeFrame: boolean) => {
    try {
      const settingsPath = join(app.getPath("userData"), "window-settings.json")
      const settingsDir = app.getPath("userData")
      mkdirSync(settingsDir, { recursive: true })
      writeFileSync(settingsPath, JSON.stringify({ useNativeFrame }, null, 2))
      return true
    } catch (error) {
      console.error("[Main] Failed to save frame preference:", error)
      return false
    }
  })

  // Windows: Get current window frame state
  ipcMain.handle("window:get-frame-state", () => {
    if (process.platform !== "win32") return false
    try {
      const settingsPath = join(app.getPath("userData"), "window-settings.json")
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, "utf-8"))
        return settings.useNativeFrame === true
      }
      return false // Default: frameless
    } catch {
      return false
    }
  })

  // Note: Update checking is now handled by auto-updater module (lib/auto-updater.ts)
  ipcMain.handle("app:set-badge", (event, count: number | null) => {
    const win = getWindowFromEvent(event)
    if (process.platform === "darwin") {
      app.dock.setBadge(count ? String(count) : "")
    } else if (process.platform === "win32" && win) {
      // Windows: Update title with count as fallback
      if (count !== null && count > 0) {
        win.setTitle(formatOpenCodexWindowTitle({ badgeCount: count }))
      } else {
        win.setTitle(formatOpenCodexWindowTitle())
        win.setOverlayIcon(null, "")
      }
    }
  })

  // Windows: Badge overlay icon
  ipcMain.handle("app:set-badge-icon", (event, imageData: string | null) => {
    const win = getWindowFromEvent(event)
    if (process.platform === "win32" && win) {
      if (imageData) {
        const image = nativeImage.createFromDataURL(imageData)
        win.setOverlayIcon(image, "New messages")
      } else {
        win.setOverlayIcon(null, "")
      }
    }
  })

  ipcMain.handle(
    "app:show-notification",
    (event, options: { title: string; body: string }) => {
      try {
        if (!Notification.isSupported()) {
          console.warn("[Main] Notifications not supported on this system")
          return
        }

        // On macOS, the app icon is used automatically — no custom icon needed.
        // On Windows, use .ico; on Linux, use .png.
        let icon: Electron.NativeImage | undefined
        if (process.platform !== "darwin") {
          const ext = process.platform === "win32" ? "icon.ico" : "icon.png"
          const iconPath = join(__dirname, "../../build", ext)
          icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined
        }

        const notification = new Notification({
          title: options.title,
          body: options.body,
          ...(icon && { icon }),
          ...(process.platform === "win32" && { silent: false }),
        })

        notification.on("click", () => {
          const win = getWindowFromEvent(event)
          if (win) {
            if (win.isMinimized()) win.restore()
            win.focus()
          }
        })

        notification.show()
      } catch (error) {
        console.error("[Main] Failed to show notification:", error)
      }
    },
  )

  // API base URL for fetch requests
  ipcMain.handle("app:get-api-base-url", () => getBaseUrl())

  // Window controls - use event.sender to identify window
  ipcMain.handle("window:minimize", (event) => {
    getWindowFromEvent(event)?.minimize()
  })
  ipcMain.handle("window:maximize", (event) => {
    const win = getWindowFromEvent(event)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.handle("window:close", (event) => {
    getWindowFromEvent(event)?.close()
  })
  ipcMain.handle("window:is-maximized", (event) => {
    return getWindowFromEvent(event)?.isMaximized() ?? false
  })
  ipcMain.handle("window:toggle-fullscreen", (event) => {
    const win = getWindowFromEvent(event)
    if (win) {
      win.setFullScreen(!win.isFullScreen())
    }
  })
  ipcMain.handle("window:is-fullscreen", (event) => {
    return getWindowFromEvent(event)?.isFullScreen() ?? false
  })

  // Traffic light visibility control (for hybrid native/custom approach)
  ipcMain.handle(
    "window:set-traffic-light-visibility",
    (event, visible: boolean) => {
      const win = getWindowFromEvent(event)
      if (win && process.platform === "darwin") {
        // In fullscreen, always show native traffic lights (don't let React hide them)
        if (win.isFullScreen()) {
          win.setWindowButtonVisibility(true)
        } else {
          win.setWindowButtonVisibility(visible)
        }
      }
    },
  )

  // Zoom controls
  ipcMain.handle("window:zoom-in", (event) => {
    const win = getWindowFromEvent(event)
    if (win) {
      const zoom = win.webContents.getZoomFactor()
      win.webContents.setZoomFactor(Math.min(zoom + 0.1, 3))
    }
  })
  ipcMain.handle("window:zoom-out", (event) => {
    const win = getWindowFromEvent(event)
    if (win) {
      const zoom = win.webContents.getZoomFactor()
      win.webContents.setZoomFactor(Math.max(zoom - 0.1, 0.5))
    }
  })
  ipcMain.handle("window:zoom-reset", (event) => {
    getWindowFromEvent(event)?.webContents.setZoomFactor(1)
  })
  ipcMain.handle("window:get-zoom", (event) => {
    return getWindowFromEvent(event)?.webContents.getZoomFactor() ?? 1
  })

  // New window - optionally open with specific chat/subchat
  ipcMain.handle("window:new", (_event, options?: { chatId?: string; subChatId?: string }) => {
    // If chatId specified, check ownership atomically via focusChatOwner
    if (options?.chatId && windowManager.focusChatOwner(options.chatId)) {
      return { blocked: true }
    }

    const win = createWindow(options)

    // Pre-claim the chat for the new window
    if (options?.chatId) {
      windowManager.claimChat(options.chatId, win.id)
    }

    return { blocked: false }
  })

  // Chat ownership — prevent same chat open in multiple windows
  ipcMain.handle("chat:claim", (event, chatId: string) => {
    const win = getWindowFromEvent(event)
    if (!win) return { ok: false, ownerStableId: "unknown" }
    return windowManager.claimChat(chatId, win.id)
  })

  ipcMain.handle("chat:release", (event, chatId: string) => {
    const win = getWindowFromEvent(event)
    if (!win) return
    windowManager.releaseChat(chatId, win.id)
  })

  ipcMain.handle("chat:focus-owner", (_event, chatId: string) => {
    return windowManager.focusChatOwner(chatId)
  })

  // Set window title
  ipcMain.handle("window:set-title", (event, title: string) => {
    const win = getWindowFromEvent(event)
    if (win) {
      // Show just the title, or default app name if empty
      win.setTitle(formatOpenCodexWindowTitle({ title }))
    }
  })

  // DevTools - only allowed in dev mode or when unlocked
  ipcMain.handle("window:toggle-devtools", (event) => {
    const win = getWindowFromEvent(event)
    // Check if devtools are unlocked (or in dev mode)
    const isUnlocked = !app.isPackaged || (global as any).__devToolsUnlocked
    if (win && isUnlocked) {
      win.webContents.toggleDevTools()
    }
  })

  // Unlock DevTools (hidden feature - 5 clicks on Beta tab)
  ipcMain.handle("window:unlock-devtools", () => {
    // Mark as unlocked locally for IPC check
    ;(global as any).__devToolsUnlocked = true
    // Call the global function to rebuild menu
    if ((global as any).__unlockDevTools) {
      ;(global as any).__unlockDevTools()
    }
  })

  // Analytics
  ipcMain.handle("analytics:set-opt-out", async (_event, optedOut: boolean) => {
    const { setOptOut } = await import("../lib/analytics")
    setOptOut(optedOut)
  })

  // Shell
  ipcMain.handle("shell:open-external", (_event, url: string) =>
    shell.openExternal(url),
  )

  // Clipboard
  ipcMain.handle("clipboard:write", (_event, text: string) =>
    clipboard.writeText(text),
  )
  ipcMain.handle("clipboard:read", () => clipboard.readText())

  // Save file with native dialog
  ipcMain.handle(
    "dialog:save-file",
    async (
      event,
      options: { base64Data: string; filename: string; filters?: { name: string; extensions: string[] }[] },
    ) => {
      const win = getWindowFromEvent(event)
      if (!win) return { success: false }

      // Ensure window is focused before showing dialog (required on macOS)
      if (!win.isFocused()) {
        win.focus()
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      const result = await dialog.showSaveDialog(win, {
        defaultPath: options.filename,
        filters: options.filters || [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
          { name: "All Files", extensions: ["*"] },
        ],
      })

      if (result.canceled || !result.filePath) return { success: false }

      try {
        const buffer = Buffer.from(options.base64Data, "base64")
        writeFileSync(result.filePath, buffer)
        return { success: true, filePath: result.filePath }
      } catch (err) {
        console.error("[dialog:save-file] Failed to write file:", err)
        return { success: false }
      }
    },
  )

  const validateSender = (event: Electron.IpcMainInvokeEvent): boolean => {
    const senderUrl = event.sender.getURL()
    try {
      const parsed = new URL(senderUrl)
      if (parsed.protocol === "file:") return true
      const hostname = parsed.hostname.toLowerCase()
      const trusted = getOpenCodexTrustedHosts(getBaseUrl())
      return trusted.some((h) => hostname === h || hostname.endsWith(`.${h}`))
    } catch {
      return false
    }
  }

  ipcMain.handle("opencodex:get-local-profile", (event) => {
    if (!validateSender(event)) {
      return readOpenCodexLocalProfile({ userDataPath: app.getPath("userData") })
    }
    return readOpenCodexLocalProfile({ userDataPath: app.getPath("userData") })
  })

  ipcMain.handle("opencodex:update-local-profile", (event, updates: { displayName?: string }) => {
    if (!validateSender(event)) {
      throw new Error("Unauthorized sender")
    }
    return updateOpenCodexLocalProfile({
      userDataPath: app.getPath("userData"),
      updates,
    })
  })

  ipcMain.handle("opencodex:reset-local-workspace", async (event) => {
    if (!validateSender(event)) {
      throw new Error("Unauthorized sender")
    }
    resetOpenCodexBackendConfig({ userDataPath: app.getPath("userData") })
    resetOpenCodexLocalProfile({ userDataPath: app.getPath("userData") })
    for (const win of windowManager.getAll()) {
      void loadWindowContent(win)
    }
  })

  ipcMain.handle("opencodex:get-backend-config", (event) => {
    if (!validateSender(event)) {
      return null
    }
    return readOpenCodexBackendConfig({ userDataPath: app.getPath("userData") })
  })

  ipcMain.handle("opencodex:save-backend-config", async (event, config) => {
    if (!validateSender(event)) {
      throw new Error("Unauthorized sender")
    }
    return saveOpenCodexBackendConfig({
      userDataPath: app.getPath("userData"),
      config,
    })
  })

  ipcMain.handle("opencodex:get-backend-host-state", (event) => {
    if (!validateSender(event)) {
      return getOpenCodexBackendHostState()
    }
    return getOpenCodexBackendHostState()
  })

  ipcMain.handle("opencodex:restart-backend-host", async (event) => {
    if (!validateSender(event)) {
      throw new Error("Unauthorized sender")
    }
    return await restartOpenCodexBackendHost({
      appRoot: app.getAppPath(),
      userDataPath: app.getPath("userData"),
      workspacePath: app.getAppPath(),
    })
  })

  // Register git watcher IPC handlers
  registerGitWatcherIPC()

  // Register VS Code theme scanner IPC handlers
  registerThemeScannerIPC()
}

function loadAppInWindow(window: BrowserWindow, options?: { chatId?: string; subChatId?: string }): void {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  const windowId = windowManager.getStableId(window)

  const buildParams = (params: URLSearchParams) => {
    params.set("windowId", windowId)
    if (options?.chatId) params.set("chatId", options.chatId)
    if (options?.subChatId) params.set("subChatId", options.subChatId)
  }

  if (devServerUrl) {
    const url = new URL(devServerUrl)
    buildParams(url.searchParams)
    void window.loadURL(url.toString())
    if (!app.isPackaged && windowId === "main") {
      window.webContents.openDevTools()
    }
    return
  }

  const hashParams = new URLSearchParams()
  buildParams(hashParams)
  void window.loadFile(join(__dirname, "../renderer/index.html"), {
    hash: hashParams.toString(),
  })
}

function loadWindowContent(window: BrowserWindow, options?: { chatId?: string; subChatId?: string }): void {
  const startupState = getOpenCodexStartupState()
  if (startupState.status === "blocked") {
    console.log("[Main] OpenCodex startup blocked, loading blocker UI")
    loadAppInWindow(window, options)
    return
  }

  loadAppInWindow(window, options)
}

export function showLoginPage(): void {
  const win = windowManager.getFocused() || windowManager.getAll()[0]
  if (!win) return
  loadWindowContent(win)
}

// Singleton IPC handler (prevents duplicate handlers on macOS window recreation)
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null

/**
 * Get the focused window reference
 * Used by tRPC procedures that need window access
 */
export function getWindow(): BrowserWindow | null {
  return windowManager.getFocused()
}

/**
 * Get all windows
 */
export function getAllWindows(): BrowserWindow[] {
  return windowManager.getAll()
}

/**
 * Read window frame preference from settings file (Windows only)
 * Returns true if native frame should be used, false for frameless
 */
function getUseNativeFramePreference(): boolean {
  if (process.platform !== "win32") return false

  try {
    const settingsPath = join(app.getPath("userData"), "window-settings.json")
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"))
      return settings.useNativeFrame === true
    }
    return false // Default: frameless (dark title bar)
  } catch {
    return false
  }
}

/**
 * Create a new application window
 * @param options Optional settings for the new window
 * @param options.chatId Open this chat in the new window
 * @param options.subChatId Open this sub-chat in the new window
 */
export function createWindow(options?: { chatId?: string; subChatId?: string }): BrowserWindow {
  // Register IPC handlers before creating first window
  registerIpcHandlers()

  // Read Windows frame preference
  const useNativeFrame = getUseNativeFramePreference()

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 500, // Allow narrow mobile-like mode
    minHeight: 600,
    show: false,
    title: formatOpenCodexWindowTitle(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#09090b" : "#ffffff",
    // hiddenInset shows native traffic lights inset in the window
    // hiddenInset hides the native title bar but keeps traffic lights visible
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 15, y: 12 } : undefined,
    // Windows: Use native frame or frameless based on user preference
    ...(process.platform === "win32" && {
      frame: useNativeFrame,
      autoHideMenuBar: true,
    }),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for electron-trpc
      webSecurity: true,
      partition: "persist:main", // Use persistent session for cookies
    },
  })

  // Register window with manager and get stable ID for localStorage namespacing
  const stableWindowId = windowManager.register(window)
  console.log(
    `[Main] Created window ${window.id} with stable ID "${stableWindowId}" (total: ${windowManager.count()})`,
  )

  // Setup tRPC IPC handler (singleton pattern)
  if (ipcHandler) {
    // Reuse existing handler, just attach new window
    ipcHandler.attachWindow(window)
  } else {
    // Create new handler with context
    ipcHandler = createIPCHandler({
      router: createAppRouter(getWindow),
      windows: [window],
      createContext: async () => ({
        getWindow,
      }),
    })
  }

  // Show window when ready
  window.on("ready-to-show", () => {
    console.log("[Main] Window", window.id, "ready to show")
    // Start with traffic lights hidden - the renderer will show them
    // after hydration based on the persisted sidebar state
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(false)
    }
    window.show()
  })

  // Emit fullscreen change events and manage traffic lights
  window.on("enter-full-screen", () => {
    // Always show native traffic lights in fullscreen
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(true)
    }
    window.webContents.send("window:fullscreen-change", true)
  })
  window.on("leave-full-screen", () => {
    // Don't force traffic lights visible here - the renderer will
    // restore the correct visibility based on sidebar state when
    // it receives the fullscreen-change event
    window.webContents.send("window:fullscreen-change", false)
  })

  // Emit focus change events
  window.on("focus", () => {
    window.webContents.send("window:focus-change", true)
  })
  window.on("blur", () => {
    window.webContents.send("window:focus-change", false)
  })

  // Disable Cmd+R / Ctrl+R to prevent accidental page refresh
  // Cmd+Shift+R / Ctrl+Shift+R is allowed but warns if there are active streams
  window.webContents.on("before-input-event", (event, input) => {
    const isMac = process.platform === "darwin"
    const modifierKey = isMac ? input.meta : input.control
    if (modifierKey && input.key.toLowerCase() === "r") {
      if (!input.shift) {
        // Block Cmd+R entirely
        event.preventDefault()
      } else if (hasActiveClaudeSessions() || hasActiveCodexStreams()) {
        // Cmd+Shift+R with active streams — intercept and confirm
        event.preventDefault()
        dialog
          .showMessageBox(window, {
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
              window.webContents.reloadIgnoringCache()
            }
          })
      }
    }
  })

  // Handle external links
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  // Prevent window close if there are active streaming sessions
  window.on("close", (event) => {
    // Skip confirmation if app quit was already confirmed by the user
    if (isQuitting) {
      // Still abort sessions gracefully so partial state is saved
      abortAllClaudeSessions()
      abortAllCodexStreams()
      return
    }

    if (hasActiveClaudeSessions() || hasActiveCodexStreams()) {
      event.preventDefault()
      dialog
        .showMessageBox(window, {
          type: "warning",
          buttons: ["Cancel", "Close Anyway"],
          defaultId: 0,
          cancelId: 0,
          title: "Active Sessions",
          message: "There are active agent sessions running.",
          detail:
            "Closing this window will interrupt them. The current progress will be saved. Are you sure you want to close?",
        })
        .then(({ response }) => {
          if (response === 1) {
            abortAllClaudeSessions()
            abortAllCodexStreams()
            window.destroy()
          }
        })
    }
  })

  // Handle window close
  window.on("closed", () => {
    console.log(`[Main] Window ${window.id} closed`)
    // windowManager handles cleanup via 'closed' event listener
  })

  // Load the renderer content based on startup state and auth
  loadWindowContent(window, options)

  // Log page load - traffic light visibility is managed by the renderer
  window.webContents.on("did-finish-load", () => {
    console.log("[Main] Page finished loading in window", window.id)
  })
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      console.error(
        "[Main] Page failed to load in window",
        window.id,
        ":",
        errorCode,
        errorDescription,
      )
    },
  )

  return window
}

/**
 * Create the main application window (alias for createWindow for backwards compatibility)
 */
export function createMainWindow(): BrowserWindow {
  return createWindow()
}
