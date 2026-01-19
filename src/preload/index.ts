import { contextBridge, ipcRenderer } from "electron"
import { exposeElectronTRPC } from "trpc-electron/main"

// Only initialize Sentry in production to avoid IPC errors in dev mode
if (process.env.NODE_ENV === "production") {
  import("@sentry/electron/renderer").then((Sentry) => {
    Sentry.init()
  })
}

// Expose tRPC IPC bridge for type-safe communication
exposeElectronTRPC()

// Expose analytics force flag for testing
if (process.env.FORCE_ANALYTICS === "true") {
  contextBridge.exposeInMainWorld("__FORCE_ANALYTICS__", true)
}

// Expose desktop-specific APIs
contextBridge.exposeInMainWorld("desktopApi", {
  // Platform info
  platform: process.platform,
  arch: process.arch,
  getVersion: () => ipcRenderer.invoke("app:version"),

  // Auto-update methods
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),

  // Auto-update event listeners
  onUpdateChecking: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("update:checking", handler)
    return () => ipcRenderer.removeListener("update:checking", handler)
  },
  onUpdateAvailable: (callback: (info: { version: string; releaseDate?: string }) => void) => {
    const handler = (_event: unknown, info: { version: string; releaseDate?: string }) => callback(info)
    ipcRenderer.on("update:available", handler)
    return () => ipcRenderer.removeListener("update:available", handler)
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("update:not-available", handler)
    return () => ipcRenderer.removeListener("update:not-available", handler)
  },
  onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    const handler = (_event: unknown, progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => callback(progress)
    ipcRenderer.on("update:progress", handler)
    return () => ipcRenderer.removeListener("update:progress", handler)
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_event: unknown, info: { version: string }) => callback(info)
    ipcRenderer.on("update:downloaded", handler)
    return () => ipcRenderer.removeListener("update:downloaded", handler)
  },
  onUpdateError: (callback: (error: string) => void) => {
    const handler = (_event: unknown, error: string) => callback(error)
    ipcRenderer.on("update:error", handler)
    return () => ipcRenderer.removeListener("update:error", handler)
  },
  onUpdateManualCheck: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("update:manual-check", handler)
    return () => ipcRenderer.removeListener("update:manual-check", handler)
  },

  // Window controls
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  windowToggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
  windowIsFullscreen: () => ipcRenderer.invoke("window:is-fullscreen"),
  setTrafficLightVisibility: (visible: boolean) =>
    ipcRenderer.invoke("window:set-traffic-light-visibility", visible),

  // Window events
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_event: unknown, isFullscreen: boolean) => callback(isFullscreen)
    ipcRenderer.on("window:fullscreen-change", handler)
    return () => ipcRenderer.removeListener("window:fullscreen-change", handler)
  },
  onFocusChange: (callback: (isFocused: boolean) => void) => {
    const handler = (_event: unknown, isFocused: boolean) => callback(isFocused)
    ipcRenderer.on("window:focus-change", handler)
    return () => ipcRenderer.removeListener("window:focus-change", handler)
  },

  // Zoom controls
  zoomIn: () => ipcRenderer.invoke("window:zoom-in"),
  zoomOut: () => ipcRenderer.invoke("window:zoom-out"),
  zoomReset: () => ipcRenderer.invoke("window:zoom-reset"),
  getZoom: () => ipcRenderer.invoke("window:get-zoom"),

  // DevTools
  toggleDevTools: () => ipcRenderer.invoke("window:toggle-devtools"),

  // Analytics
  setAnalyticsOptOut: (optedOut: boolean) => ipcRenderer.invoke("analytics:set-opt-out", optedOut),

  // Native features
  setBadge: (count: number | null) => ipcRenderer.invoke("app:set-badge", count),
  showNotification: (options: { title: string; body: string }) =>
    ipcRenderer.invoke("app:show-notification", options),
  terminalNotify: (message: string, title: string) =>
    ipcRenderer.invoke("app:terminal-notify", { message, title }),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),

  // API base URL (for fetch requests to server)
  getApiBaseUrl: () => ipcRenderer.invoke("app:get-api-base-url"),

  // Clipboard
  clipboardWrite: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  clipboardRead: () => ipcRenderer.invoke("clipboard:read"),

  // Shortcut events (from main process menu accelerators)
  onShortcutNewAgent: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("shortcut:new-agent", handler)
    return () => ipcRenderer.removeListener("shortcut:new-agent", handler)
  },

  // File change events (from Claude Write/Edit tools)
  onFileChanged: (callback: (data: { filePath: string; type: string; subChatId: string }) => void) => {
    const handler = (_event: unknown, data: { filePath: string; type: string; subChatId: string }) => callback(data)
    ipcRenderer.on("file-changed", handler)
    return () => ipcRenderer.removeListener("file-changed", handler)
  },
})

// Type definitions
export interface UpdateInfo {
  version: string
  releaseDate?: string
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface DesktopApi {
  platform: NodeJS.Platform
  arch: string
  getVersion: () => Promise<string>
  // Auto-update
  checkForUpdates: () => Promise<UpdateInfo | null>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => void
  onUpdateChecking: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateNotAvailable: (callback: () => void) => () => void
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void
  onUpdateManualCheck: (callback: () => void) => () => void
  // Window controls
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  windowToggleFullscreen: () => Promise<void>
  windowIsFullscreen: () => Promise<boolean>
  setTrafficLightVisibility: (visible: boolean) => Promise<void>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  onFocusChange: (callback: (isFocused: boolean) => void) => () => void
  zoomIn: () => Promise<void>
  zoomOut: () => Promise<void>
  zoomReset: () => Promise<void>
  getZoom: () => Promise<number>
  toggleDevTools: () => Promise<void>
  setAnalyticsOptOut: (optedOut: boolean) => Promise<void>
  setBadge: (count: number | null) => Promise<void>
  showNotification: (options: { title: string; body: string }) => Promise<void>
  terminalNotify: (message: string, title: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  getApiBaseUrl: () => Promise<string>
  clipboardWrite: (text: string) => Promise<void>
  clipboardRead: () => Promise<string>
  // Auth
  getUser: () => Promise<{
    id: string
    email: string
    name: string | null
    imageUrl: string | null
    username: string | null
  } | null>
  isAuthenticated: () => Promise<boolean>
  logout: () => Promise<void>
  startAuthFlow: () => Promise<void>
  submitAuthCode: (code: string) => Promise<void>
  updateUser: (updates: { name?: string }) => Promise<{
    id: string
    email: string
    name: string | null
    imageUrl: string | null
    username: string | null
  } | null>
  onAuthSuccess: (callback: (user: any) => void) => () => void
  onAuthError: (callback: (error: string) => void) => () => void
  // Shortcuts
  onShortcutNewAgent: (callback: () => void) => () => void
  // File changes
  onFileChanged: (callback: (data: { filePath: string; type: string; subChatId: string }) => void) => () => void
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
