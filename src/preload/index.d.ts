import type { OpenCodexBackendRoute } from "../shared/opencodex-backend-route"
export type OpenCodexStartupState =
  | { status: "ready" }
  | {
      status: "blocked"
      reason: "packaging-preflight"
      message: string
    }

export interface OpenCodexReleaseMetadata {
  currentVersion: string
  firstRunVersion: string
  previousVersion: string | null
  lastStartedAt: string
}

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

export interface OpenCodexLocalProfile {
  displayName: string
  identityLabel: string
}

export type OpenCodexBackendConfigInput = OpenCodexBackendRoute

export interface OpenCodexBackendHostState {
  status: "stopped" | "starting" | "ready" | "error"
  pid: number | null
  startedAt: string | null
  lastError: string | null
  lastEventType: string | null
}

export interface WorktreeSetupFailurePayload {
  kind: "create-failed" | "setup-failed"
  message: string
  projectId: string
}

export interface DesktopApi {
  platform: NodeJS.Platform
  arch: string
  getVersion: () => Promise<string>
  getStartupState: () => Promise<OpenCodexStartupState>
  getReleaseMetadata: () => Promise<OpenCodexReleaseMetadata | null>
  retryStartupPreflight: () => Promise<OpenCodexStartupState>

  checkForUpdates: (force?: boolean) => Promise<UpdateInfo | null>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => void
  onUpdateChecking: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateNotAvailable: (callback: () => void) => () => void
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void
  onUpdateManualCheck: (callback: () => void) => () => void

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
  openExternal: (url: string) => Promise<void>
  getApiBaseUrl: () => Promise<string>

  clipboardWrite: (text: string) => Promise<void>
  clipboardRead: () => Promise<string>

  getLocalProfile: () => Promise<OpenCodexLocalProfile>
  updateLocalProfile: (updates: { displayName?: string }) => Promise<OpenCodexLocalProfile>
  resetLocalWorkspace: () => Promise<void>
  getOpenCodexBackendConfig: () => Promise<OpenCodexBackendConfigInput | null>
  saveOpenCodexBackendConfig: (config: OpenCodexBackendConfigInput) => Promise<OpenCodexBackendConfigInput>
  getBackendHostState: () => Promise<OpenCodexBackendHostState>
  restartBackendHost: () => Promise<OpenCodexBackendHostState>

  newWindow: (options?: { chatId?: string; subChatId?: string }) => Promise<{ blocked: boolean } | void>
  claimChat: (chatId: string) => Promise<{ ok: true } | { ok: false; ownerStableId: string }>
  releaseChat: (chatId: string) => Promise<void>
  focusChatOwner: (chatId: string) => Promise<boolean>

  onShortcutNewAgent: (callback: () => void) => () => void
  onWorktreeSetupFailed: (callback: (payload: WorktreeSetupFailurePayload) => void) => () => void
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
