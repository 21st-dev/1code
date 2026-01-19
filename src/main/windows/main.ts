import {
  BrowserWindow,
  shell,
  nativeTheme,
  ipcMain,
  app,
  clipboard,
} from "electron"
import { join } from "path"
import { exec } from "child_process"
import { createIPCHandler } from "trpc-electron/main"
import { createAppRouter } from "../lib/trpc/routers"
import { getBaseUrl } from "../index"

// Register IPC handlers for window operations (only once)
let ipcHandlersRegistered = false

function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true

  // App info
  ipcMain.handle("app:version", () => app.getVersion())
  // Note: Update checking is now handled by auto-updater module (lib/auto-updater.ts)
  ipcMain.handle("app:set-badge", (_event, count: number | null) => {
    if (process.platform === "darwin") {
      app.dock.setBadge(count ? String(count) : "")
    }
  })
  ipcMain.handle(
    "app:show-notification",
    (_event, options: { title: string; body: string }) => {
      const { Notification } = require("electron")
      new Notification(options).show()
    },
  )

  // Terminal-notifier for macOS (per CLAUDE.md instructions)
  ipcMain.handle(
    "app:terminal-notify",
    (_event, { message, title }: { message: string; title: string }) => {
      if (process.platform === "darwin") {
        // Escape quotes to prevent command injection
        const safeMessage = message.replace(/"/g, '\\"')
        const safeTitle = title.replace(/"/g, '\\"')
        exec(
          `terminal-notifier -message "${safeMessage}" -title "${safeTitle}"`,
          (err) => {
            if (err) {
              console.warn(
                "[Notification] terminal-notifier failed:",
                err.message,
              )
            }
          },
        )
      }
    },
  )

  // API base URL for fetch requests
  ipcMain.handle("app:get-api-base-url", () => getBaseUrl())

  // Window controls
  ipcMain.handle("window:minimize", () => getWindow()?.minimize())
  ipcMain.handle("window:maximize", () => {
    const win = getWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.handle("window:close", () => getWindow()?.close())
  ipcMain.handle(
    "window:is-maximized",
    () => getWindow()?.isMaximized() ?? false,
  )
  ipcMain.handle("window:toggle-fullscreen", () => {
    const win = getWindow()
    if (win) {
      win.setFullScreen(!win.isFullScreen())
    }
  })
  ipcMain.handle(
    "window:is-fullscreen",
    () => getWindow()?.isFullScreen() ?? false,
  )

  // Traffic light visibility control (for hybrid native/custom approach)
  ipcMain.handle(
    "window:set-traffic-light-visibility",
    (_event, visible: boolean) => {
      const win = getWindow()
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
  ipcMain.handle("window:zoom-in", () => {
    const win = getWindow()
    if (win) {
      const zoom = win.webContents.getZoomFactor()
      win.webContents.setZoomFactor(Math.min(zoom + 0.1, 3))
    }
  })
  ipcMain.handle("window:zoom-out", () => {
    const win = getWindow()
    if (win) {
      const zoom = win.webContents.getZoomFactor()
      win.webContents.setZoomFactor(Math.max(zoom - 0.1, 0.5))
    }
  })
  ipcMain.handle("window:zoom-reset", () => {
    getWindow()?.webContents.setZoomFactor(1)
  })
  ipcMain.handle(
    "window:get-zoom",
    () => getWindow()?.webContents.getZoomFactor() ?? 1,
  )

  // DevTools
  ipcMain.handle("window:toggle-devtools", () => {
    const win = getWindow()
    if (win) {
      win.webContents.toggleDevTools()
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
}

// Current window reference
let currentWindow: BrowserWindow | null = null

// Singleton IPC handler (prevents duplicate handlers on macOS window recreation)
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null

/**
 * Get the current window reference
 * Used by tRPC procedures that need window access
 */
export function getWindow(): BrowserWindow | null {
  return currentWindow
}

/**
 * Create the main application window
 */
export function createMainWindow(): BrowserWindow {
  // Register IPC handlers before creating window
  registerIpcHandlers(getWindow)

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 500, // Allow narrow mobile-like mode
    minHeight: 600,
    show: false,
    title: "1Code",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#09090b" : "#ffffff",
    // hiddenInset shows native traffic lights inset in the window
    // Start with traffic lights off-screen (custom ones shown in normal mode)
    // Native lights will be moved on-screen in fullscreen mode
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 15, y: 12 } : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for electron-trpc
      webSecurity: true,
      partition: "persist:main", // Use persistent session for cookies
    },
  })

  // Update current window reference
  currentWindow = window

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
    console.log("[Main] Window ready to show")
    // Ensure native traffic lights are visible by default (login page, loading states)
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(true)
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
    // Show native traffic lights when exiting fullscreen (TrafficLights component will manage after mount)
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(true)
    }
    window.webContents.send("window:fullscreen-change", false)
  })

  // Emit focus change events
  window.on("focus", () => {
    window.webContents.send("window:focus-change", true)
  })
  window.on("blur", () => {
    window.webContents.send("window:focus-change", false)
  })

  // Handle external links
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  // Handle window close
  window.on("closed", () => {
    currentWindow = null
  })

  // Load the renderer - check auth first
  const devServerUrl = process.env.ELECTRON_RENDERER_URL

  if (devServerUrl) {
    window.loadURL(devServerUrl)
    window.webContents.openDevTools()
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"))
  }

  // Ensure traffic lights are visible after page load (covers reload/Cmd+R case)
  window.webContents.on("did-finish-load", () => {
    console.log("[Main] Page finished loading")
    if (process.platform === "darwin") {
      window.setWindowButtonVisibility(true)
    }
  })
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      console.error("[Main] Page failed to load:", errorCode, errorDescription)
    },
  )

  return window
}
