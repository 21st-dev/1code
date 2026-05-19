import { app } from "electron"
import { autoUpdater } from "electron-updater"
import type { ProgressInfo, UpdateInfo } from "builder-util-runtime"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import {
  DEFAULT_APP_UPDATE_SETTINGS,
  getAutoUpdateSupport,
  parseAppUpdateSettingsContent,
  serializeAppUpdateSettings,
  type AppAutoUpdateState,
  type AppUpdateSettings,
} from "../../shared/app-update"

const SETTINGS_FILE = "app-update-settings.json"
const STARTUP_CHECK_DELAY_MS = 15_000
const FOCUS_CHECK_COOLDOWN_MS = 60_000

let listenersAttached = false
let automaticChecksStarted = false
let lastAutomaticCheckAt = 0
let checkPromise: Promise<AppAutoUpdateState> | null = null
let downloadPromise: Promise<AppAutoUpdateState> | null = null

let state: AppAutoUpdateState = {
  status: "idle",
  supported: false,
  enabled: DEFAULT_APP_UPDATE_SETTINGS.autoCheckEnabled,
  currentVersion: "0.0.0",
}

function getSettingsPath(): string {
  return join(app.getPath("userData"), SETTINGS_FILE)
}

export function readAppUpdateSettings(): AppUpdateSettings {
  try {
    const path = getSettingsPath()
    if (!existsSync(path)) return DEFAULT_APP_UPDATE_SETTINGS
    return parseAppUpdateSettingsContent(readFileSync(path, "utf-8"))
  } catch {
    return DEFAULT_APP_UPDATE_SETTINGS
  }
}

export function writeAppUpdateSettings(settings: AppUpdateSettings): void {
  const path = getSettingsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${serializeAppUpdateSettings(settings)}\n`, "utf-8")
}

function getAvailability(options?: { ignoreAutoCheckSetting?: boolean }) {
  const settings = readAppUpdateSettings()
  const support = getAutoUpdateSupport({
    isPackaged: app.isPackaged,
    platform: process.platform,
    env: process.env,
  })

  if (!support.supported) {
    return {
      canUseUpdater: false,
      settings,
      supported: false,
      disabledReason: support.reason,
    } as const
  }

  if (!settings.autoCheckEnabled && !options?.ignoreAutoCheckSetting) {
    return {
      canUseUpdater: false,
      settings,
      supported: true,
      disabledReason: "disabled-by-user",
    } as const
  }

  return {
    canUseUpdater: true,
    settings,
    supported: true,
    disabledReason: undefined,
  } as const
}

function releaseNotesToString(notes: unknown): string | undefined {
  if (typeof notes === "string" && notes.trim()) {
    return notes.trim().slice(0, 1800)
  }

  if (Array.isArray(notes)) {
    const joined = notes
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "note" in item) {
          const note = (item as { note?: unknown }).note
          return typeof note === "string" ? note : ""
        }
        return ""
      })
      .filter(Boolean)
      .join("\n\n")
      .trim()
    return joined ? joined.slice(0, 1800) : undefined
  }

  return undefined
}

function applyUpdateInfo(
  status: AppAutoUpdateState["status"],
  info?: UpdateInfo | null,
): void {
  const availability = getAvailability({ ignoreAutoCheckSetting: true })
  state = {
    ...state,
    status,
    supported: availability.supported,
    enabled: availability.settings.autoCheckEnabled,
    disabledReason: undefined,
    currentVersion: app.getVersion(),
    latestVersion: info?.version ?? state.latestVersion,
    releaseName:
      typeof info?.releaseName === "string"
        ? info.releaseName
        : state.releaseName,
    releaseNotes: releaseNotesToString(info?.releaseNotes) ?? state.releaseNotes,
    releaseDate: info?.releaseDate ?? state.releaseDate,
    checkedAt:
      status === "checking" || status === "downloaded"
        ? state.checkedAt
        : new Date().toISOString(),
    downloadedAt:
      status === "downloaded" ? new Date().toISOString() : state.downloadedAt,
    error: undefined,
    progress: status === "downloading" ? state.progress : undefined,
  }
}

function applyProgress(progress: ProgressInfo): void {
  const availability = getAvailability({ ignoreAutoCheckSetting: true })
  state = {
    ...state,
    status: "downloading",
    supported: availability.supported,
    enabled: availability.settings.autoCheckEnabled,
    currentVersion: app.getVersion(),
    progress: {
      percent: Math.max(0, Math.min(100, progress.percent || 0)),
      transferred: progress.transferred || 0,
      total: progress.total || 0,
      bytesPerSecond: progress.bytesPerSecond || 0,
    },
    error: undefined,
  }
}

function applyError(error: unknown): void {
  const availability = getAvailability({ ignoreAutoCheckSetting: true })
  state = {
    ...state,
    status: "error",
    supported: availability.supported,
    enabled: availability.settings.autoCheckEnabled,
    currentVersion: app.getVersion(),
    error: error instanceof Error ? error.message : String(error),
    progress: undefined,
  }
}

function refreshStateForAvailability(options?: {
  ignoreAutoCheckSetting?: boolean
}): boolean {
  const availability = getAvailability(options)
  const currentVersion = app.getVersion()

  if (!availability.canUseUpdater) {
    state = {
      status: "disabled",
      supported: availability.supported,
      enabled: availability.settings.autoCheckEnabled,
      disabledReason: availability.disabledReason,
      currentVersion,
    }
    return false
  }

  state = {
    ...state,
    status: state.status === "disabled" ? "idle" : state.status,
    supported: true,
    enabled: availability.settings.autoCheckEnabled,
    disabledReason: undefined,
    currentVersion,
  }
  return true
}

function configureUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = console

  if (listenersAttached) return
  listenersAttached = true

  autoUpdater.on("checking-for-update", () => {
    applyUpdateInfo("checking")
  })
  autoUpdater.on("update-available", (info) => {
    applyUpdateInfo("update-available", info)
  })
  autoUpdater.on("update-not-available", (info) => {
    applyUpdateInfo("up-to-date", info)
  })
  autoUpdater.on("download-progress", (progress) => {
    applyProgress(progress)
  })
  autoUpdater.on("update-downloaded", (event) => {
    applyUpdateInfo("downloaded", event)
  })
  autoUpdater.on("error", (error) => {
    applyError(error)
  })
}

export function getAppUpdateState(): AppAutoUpdateState {
  refreshStateForAvailability({
    ignoreAutoCheckSetting:
      state.status === "update-available" ||
      state.status === "downloading" ||
      state.status === "downloaded",
  })
  return { ...state, progress: state.progress ? { ...state.progress } : undefined }
}

export function setAppUpdateAutoCheckEnabled(enabled: boolean): AppAutoUpdateState {
  writeAppUpdateSettings({ autoCheckEnabled: enabled })
  refreshStateForAvailability()
  return getAppUpdateState()
}

export async function checkForAppUpdates(options?: {
  manual?: boolean
}): Promise<AppAutoUpdateState> {
  configureUpdater()
  const canUseUpdater = refreshStateForAvailability({
    ignoreAutoCheckSetting: options?.manual,
  })
  if (!canUseUpdater) return getAppUpdateState()

  if (checkPromise) return checkPromise

  checkPromise = (async () => {
    try {
      applyUpdateInfo("checking")
      const result = await autoUpdater.checkForUpdates()
      if (result?.updateInfo && state.status === "checking") {
        applyUpdateInfo("up-to-date", result.updateInfo)
      }
    } catch (error) {
      applyError(error)
    } finally {
      checkPromise = null
    }
    return getAppUpdateState()
  })()

  return checkPromise
}

export async function downloadAppUpdate(): Promise<AppAutoUpdateState> {
  configureUpdater()
  const canUseUpdater = refreshStateForAvailability({
    ignoreAutoCheckSetting: true,
  })
  if (!canUseUpdater) return getAppUpdateState()

  if (state.status === "downloaded") return getAppUpdateState()
  if (state.status !== "update-available") {
    throw new Error("No update is ready to download")
  }

  if (downloadPromise) return downloadPromise

  downloadPromise = (async () => {
    try {
      state = { ...state, status: "downloading", progress: undefined, error: undefined }
      await autoUpdater.downloadUpdate()
      if (state.status === "downloading") {
        applyUpdateInfo("downloaded")
      }
    } catch (error) {
      applyError(error)
    } finally {
      downloadPromise = null
    }
    return getAppUpdateState()
  })()

  return downloadPromise
}

export function quitAndInstallAppUpdate(): AppAutoUpdateState {
  configureUpdater()
  refreshStateForAvailability({ ignoreAutoCheckSetting: true })
  if (state.status !== "downloaded") {
    throw new Error("No downloaded update is ready to install")
  }
  autoUpdater.quitAndInstall(false, true)
  return getAppUpdateState()
}

export function startAutomaticAppUpdateChecks(): void {
  if (automaticChecksStarted) return
  automaticChecksStarted = true
  configureUpdater()
  refreshStateForAvailability()

  setTimeout(() => {
    void runAutomaticCheck()
  }, STARTUP_CHECK_DELAY_MS)

  app.on("browser-window-focus", () => {
    void runAutomaticCheck()
  })
}

async function runAutomaticCheck(): Promise<void> {
  const now = Date.now()
  if (now - lastAutomaticCheckAt < FOCUS_CHECK_COOLDOWN_MS) return
  if (!refreshStateForAvailability()) return
  if (
    state.status === "checking" ||
    state.status === "downloading" ||
    state.status === "downloaded"
  ) {
    return
  }

  lastAutomaticCheckAt = now
  await checkForAppUpdates()
}
