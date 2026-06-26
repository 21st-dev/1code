import { contextBridge, ipcRenderer, webUtils } from "electron"
import { exposeElectronTRPC } from "trpc-electron/main"
import type { McpImportPreview } from "../shared/mcp-import-preview"

// Expose tRPC IPC bridge for type-safe communication
exposeElectronTRPC()

// Expose webUtils for file path access in drag and drop
contextBridge.exposeInMainWorld("webUtils", {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})

// Expose desktop-specific APIs
contextBridge.exposeInMainWorld("desktopApi", {
  // Platform info
  platform: process.platform,
  arch: process.arch,
  getVersion: () => ipcRenderer.invoke("app:version"),
  isPackaged: () => ipcRenderer.invoke("app:isPackaged"),
  isLocalOnlyMode: () => ipcRenderer.invoke("app:is-local-only-mode"),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  windowToggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
  windowIsFullscreen: () => ipcRenderer.invoke("window:is-fullscreen"),
  setTrafficLightVisibility: (visible: boolean) =>
    ipcRenderer.invoke("window:set-traffic-light-visibility", visible),

  // Windows-specific: Frame preference (native vs frameless)
  setWindowFramePreference: (useNativeFrame: boolean) =>
    ipcRenderer.invoke("window:set-frame-preference", useNativeFrame),
  getWindowFrameState: () => ipcRenderer.invoke("window:get-frame-state"),

  // Window events
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_event: unknown, isFullscreen: boolean) =>
      callback(isFullscreen)
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

  // Multi-window
  newWindow: (options?: { chatId?: string; subChatId?: string }) =>
    ipcRenderer.invoke("window:new", options) as Promise<{
      blocked: boolean
    } | void>,
  setWindowTitle: (title: string) =>
    ipcRenderer.invoke("window:set-title", title),

  // Chat ownership — prevent same chat open in multiple windows
  claimChat: (chatId: string) =>
    ipcRenderer.invoke("chat:claim", chatId) as Promise<
      { ok: true } | { ok: false; ownerStableId: string }
    >,
  releaseChat: (chatId: string) =>
    ipcRenderer.invoke("chat:release", chatId) as Promise<void>,
  focusChatOwner: (chatId: string) =>
    ipcRenderer.invoke("chat:focus-owner", chatId) as Promise<boolean>,

  // DevTools
  toggleDevTools: () => ipcRenderer.invoke("window:toggle-devtools"),
  unlockDevTools: () => ipcRenderer.invoke("window:unlock-devtools"),

  // Native features
  setBadge: (count: number | null) =>
    ipcRenderer.invoke("app:set-badge", count),
  setBadgeIcon: (imageData: string | null) =>
    ipcRenderer.invoke("app:set-badge-icon", imageData),
  showNotification: (options: { title: string; body: string }) =>
    ipcRenderer.invoke("app:show-notification", options),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),

  // API base URL (for fetch requests to server)
  getApiBaseUrl: () => ipcRenderer.invoke("app:get-api-base-url"),

  // Clipboard
  clipboardWrite: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  clipboardRead: () => ipcRenderer.invoke("clipboard:read"),

  // Save file with native dialog
  saveFile: (options: {
    base64Data: string
    filename: string
    filters?: { name: string; extensions: string[] }[]
  }) =>
    ipcRenderer.invoke("dialog:save-file", options) as Promise<{
      success: boolean
      filePath?: string
    }>,

  // Auth methods
  getUser: () => ipcRenderer.invoke("auth:get-user"),
  isAuthenticated: () => ipcRenderer.invoke("auth:is-authenticated"),
  logout: () => ipcRenderer.invoke("auth:logout"),

  // MCP import preview
  getPendingMcpImportPreview: () =>
    ipcRenderer.invoke(
      "mcp-import:get-pending-preview",
    ) as Promise<McpImportPreview | null>,
  clearPendingMcpImportPreview: () =>
    ipcRenderer.invoke("mcp-import:clear-pending-preview") as Promise<{
      success: boolean
    }>,
  onMcpImportPreview: (callback: (preview: McpImportPreview) => void) => {
    const handler = (_event: unknown, preview: McpImportPreview) =>
      callback(preview)
    ipcRenderer.on("mcp-import:preview", handler)
    return () => ipcRenderer.removeListener("mcp-import:preview", handler)
  },

  // Stream event listeners
  onStreamChunk: (streamId: string, callback: (chunk: Uint8Array) => void) => {
    const handler = (_event: unknown, chunk: Uint8Array) => callback(chunk)
    ipcRenderer.on(`stream:${streamId}:chunk`, handler)
    return () => ipcRenderer.removeListener(`stream:${streamId}:chunk`, handler)
  },
  onStreamDone: (streamId: string, callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(`stream:${streamId}:done`, handler)
    return () => ipcRenderer.removeListener(`stream:${streamId}:done`, handler)
  },
  onStreamError: (streamId: string, callback: (error: string) => void) => {
    const handler = (_event: unknown, error: string) => callback(error)
    ipcRenderer.on(`stream:${streamId}:error`, handler)
    return () => ipcRenderer.removeListener(`stream:${streamId}:error`, handler)
  },

  // Shortcut events (from main process menu accelerators)
  onShortcutNewAgent: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("shortcut:new-agent", handler)
    return () => ipcRenderer.removeListener("shortcut:new-agent", handler)
  },
  onShortcutOpenSettings: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("shortcut:open-settings", handler)
    return () => ipcRenderer.removeListener("shortcut:open-settings", handler)
  },
  onShortcutFind: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("shortcut:find", handler)
    return () => ipcRenderer.removeListener("shortcut:find", handler)
  },

  // File change events (from Claude Write/Edit tools)
  onFileChanged: (
    callback: (data: {
      filePath: string
      type: string
      subChatId: string
    }) => void,
  ) => {
    const handler = (
      _event: unknown,
      data: { filePath: string; type: string; subChatId: string },
    ) => callback(data)
    ipcRenderer.on("file-changed", handler)
    return () => ipcRenderer.removeListener("file-changed", handler)
  },

  // Git status change events (from file watcher)
  onGitStatusChanged: (
    callback: (data: {
      worktreePath: string
      changes: Array<{ path: string; type: "add" | "change" | "unlink" }>
    }) => void,
  ) => {
    const handler = (
      _event: unknown,
      data: {
        worktreePath: string
        changes: Array<{ path: string; type: "add" | "change" | "unlink" }>
      },
    ) => callback(data)
    ipcRenderer.on("git:status-changed", handler)
    return () => ipcRenderer.removeListener("git:status-changed", handler)
  },

  // Worktree setup failure events
  onWorktreeSetupFailed: (
    callback: (data: {
      kind: "create-failed" | "create-timeout" | "setup-failed"
      message: string
      projectId: string
      fallback?: { mode: "project-directory"; path: string }
    }) => void,
  ) => {
    const handler = (
      _event: unknown,
      data: {
        kind: "create-failed" | "create-timeout" | "setup-failed"
        message: string
        projectId: string
        fallback?: { mode: "project-directory"; path: string }
      },
    ) => callback(data)
    ipcRenderer.on("worktree:setup-failed", handler)
    return () => ipcRenderer.removeListener("worktree:setup-failed", handler)
  },

  // Worktree setup approval events
  onWorktreeSetupApprovalRequired: (
    callback: (data: {
      chatId: string
      projectId: string
      worktreePath: string
      source: string
      configPath: string
      commandHash: string
      commands: string[]
    }) => void,
  ) => {
    const handler = (
      _event: unknown,
      data: {
        chatId: string
        projectId: string
        worktreePath: string
        source: string
        configPath: string
        commandHash: string
        commands: string[]
      },
    ) => callback(data)
    ipcRenderer.on("worktree:setup-approval-required", handler)
    return () =>
      ipcRenderer.removeListener("worktree:setup-approval-required", handler)
  },

  // Subscribe to git watcher for a worktree (from renderer)
  subscribeToGitWatcher: (worktreePath: string) =>
    ipcRenderer.invoke("git:subscribe-watcher", worktreePath),
  unsubscribeFromGitWatcher: (worktreePath: string) =>
    ipcRenderer.invoke("git:unsubscribe-watcher", worktreePath),

  // VS Code theme scanning
  scanVSCodeThemes: () => ipcRenderer.invoke("vscode:scan-themes"),
  loadVSCodeTheme: (themePath: string) =>
    ipcRenderer.invoke("vscode:load-theme", themePath),
})

export type EditorSource = "vscode" | "vscode-insiders" | "cursor" | "windsurf"

export interface DiscoveredTheme {
  id: string
  name: string
  type: "light" | "dark"
  extensionId: string
  extensionName: string
  path: string
  source: EditorSource
}

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

export interface DesktopApi {
  platform: NodeJS.Platform
  arch: string
  getVersion: () => Promise<string>
  isPackaged: () => Promise<boolean>
  isLocalOnlyMode: () => Promise<boolean>
  // Window controls
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  windowToggleFullscreen: () => Promise<void>
  windowIsFullscreen: () => Promise<boolean>
  setTrafficLightVisibility: (visible: boolean) => Promise<void>
  // Windows-specific frame preference
  setWindowFramePreference: (useNativeFrame: boolean) => Promise<boolean>
  getWindowFrameState: () => Promise<boolean>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  onFocusChange: (callback: (isFocused: boolean) => void) => () => void
  zoomIn: () => Promise<void>
  zoomOut: () => Promise<void>
  zoomReset: () => Promise<void>
  getZoom: () => Promise<number>
  // Multi-window
  newWindow: (options?: {
    chatId?: string
    subChatId?: string
  }) => Promise<{ blocked: boolean } | void>
  setWindowTitle: (title: string) => Promise<void>
  // Chat ownership — prevent same chat open in multiple windows
  claimChat: (
    chatId: string,
  ) => Promise<{ ok: true } | { ok: false; ownerStableId: string }>
  releaseChat: (chatId: string) => Promise<void>
  focusChatOwner: (chatId: string) => Promise<boolean>
  toggleDevTools: () => Promise<void>
  unlockDevTools: () => Promise<void>
  setBadge: (count: number | null) => Promise<void>
  setBadgeIcon: (imageData: string | null) => Promise<void>
  showNotification: (options: { title: string; body: string }) => Promise<void>
  openExternal: (url: string) => Promise<void>
  getApiBaseUrl: () => Promise<string | null>
  clipboardWrite: (text: string) => Promise<void>
  clipboardRead: () => Promise<string>
  saveFile: (options: {
    base64Data: string
    filename: string
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<{ success: boolean; filePath?: string }>
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
  getPendingMcpImportPreview: () => Promise<McpImportPreview | null>
  clearPendingMcpImportPreview: () => Promise<{ success: boolean }>
  onMcpImportPreview: (
    callback: (preview: McpImportPreview) => void,
  ) => () => void
  onStreamChunk: (
    streamId: string,
    callback: (chunk: Uint8Array) => void,
  ) => () => void
  onStreamDone: (streamId: string, callback: () => void) => () => void
  onStreamError: (
    streamId: string,
    callback: (error: string) => void,
  ) => () => void
  // Shortcuts
  onShortcutNewAgent: (callback: () => void) => () => void
  onShortcutOpenSettings: (callback: () => void) => () => void
  onShortcutFind: (callback: () => void) => () => void
  // File changes
  onFileChanged: (
    callback: (data: {
      filePath: string
      type: string
      subChatId: string
    }) => void,
  ) => () => void
  // Git status changes (from file watcher)
  onGitStatusChanged: (
    callback: (data: {
      worktreePath: string
      changes: Array<{ path: string; type: "add" | "change" | "unlink" }>
    }) => void,
  ) => () => void
  onWorktreeSetupFailed: (
    callback: (data: {
      kind: "create-failed" | "create-timeout" | "setup-failed"
      message: string
      projectId: string
      fallback?: { mode: "project-directory"; path: string }
    }) => void,
  ) => () => void
  onWorktreeSetupApprovalRequired: (
    callback: (data: {
      chatId: string
      projectId: string
      worktreePath: string
      source: string
      configPath: string
      commandHash: string
      commands: string[]
    }) => void,
  ) => () => void
  subscribeToGitWatcher: (worktreePath: string) => Promise<void>
  unsubscribeFromGitWatcher: (worktreePath: string) => Promise<void>
  // VS Code theme scanning
  scanVSCodeThemes: () => Promise<DiscoveredTheme[]>
  loadVSCodeTheme: (themePath: string) => Promise<VSCodeThemeData>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
    webUtils: {
      getPathForFile: (file: File) => string
    }
  }
}
