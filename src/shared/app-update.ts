export type ParsedVersion = {
  major: number
  minor: number
  patch: number
}

export type GitHubReleaseLike = {
  tag_name?: unknown
  name?: unknown
  html_url?: unknown
  published_at?: unknown
  body?: unknown
  draft?: unknown
  prerelease?: unknown
}

export type AppUpdateCheckStatus =
  | "update-available"
  | "up-to-date"
  | "unknown"

export type AppAutoUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "update-available"
  | "downloading"
  | "downloaded"
  | "error"

export type AppAutoUpdateDisabledReason =
  | "development"
  | "unsupported-platform"
  | "portable"
  | "disabled-by-user"

export type AppAutoUpdateProgress = {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export type AppAutoUpdateState = {
  status: AppAutoUpdateStatus
  supported: boolean
  enabled: boolean
  disabledReason?: AppAutoUpdateDisabledReason
  currentVersion: string
  latestVersion?: string
  releaseName?: string
  releaseNotes?: string
  releaseDate?: string
  checkedAt?: string
  downloadedAt?: string
  error?: string
  progress?: AppAutoUpdateProgress
}

export type AppUpdateSettings = {
  autoCheckEnabled: boolean
}

export const DEFAULT_APP_UPDATE_SETTINGS: AppUpdateSettings = {
  autoCheckEnabled: true,
}

export type AutoUpdateSupportInput = {
  isPackaged: boolean
  platform: string
  env?: Record<string, string | undefined>
}

export type AutoUpdateSupportResult =
  | { supported: true }
  | { supported: false; reason: Exclude<AppAutoUpdateDisabledReason, "disabled-by-user"> }

export type ParsedAppUpdateRelease = {
  status: AppUpdateCheckStatus
  currentVersion: string
  latestVersion: string
  releaseName: string
  releasePageUrl: string
  releasesPageUrl: string
  publishedAt: string | undefined
  checkedAt: string
  isDraft: boolean
  isPrerelease: boolean
  releaseNotes: string | undefined
}

export function parseAppUpdateSettings(value: unknown): AppUpdateSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_APP_UPDATE_SETTINGS
  }

  const settings = value as Partial<AppUpdateSettings>
  return {
    autoCheckEnabled:
      typeof settings.autoCheckEnabled === "boolean"
        ? settings.autoCheckEnabled
        : DEFAULT_APP_UPDATE_SETTINGS.autoCheckEnabled,
  }
}

export function parseAppUpdateSettingsContent(
  content: string | null | undefined,
): AppUpdateSettings {
  if (!content) return DEFAULT_APP_UPDATE_SETTINGS

  try {
    return parseAppUpdateSettings(JSON.parse(content))
  } catch {
    return DEFAULT_APP_UPDATE_SETTINGS
  }
}

export function serializeAppUpdateSettings(
  settings: AppUpdateSettings,
): string {
  return JSON.stringify(parseAppUpdateSettings(settings), null, 2)
}

export function getAutoUpdateSupport(
  input: AutoUpdateSupportInput,
): AutoUpdateSupportResult {
  if (!input.isPackaged) {
    return { supported: false, reason: "development" }
  }

  if (input.platform === "darwin") {
    return { supported: true }
  }

  if (input.platform === "win32") {
    const env = input.env ?? {}
    if (env.PORTABLE_EXECUTABLE_DIR || env.PORTABLE_EXECUTABLE_FILE) {
      return { supported: false, reason: "portable" }
    }
    return { supported: true }
  }

  return { supported: false, reason: "unsupported-platform" }
}

export function getAutoUpdateDisabledReason(
  input: AutoUpdateSupportInput & { autoCheckEnabled: boolean },
): AppAutoUpdateDisabledReason | undefined {
  const support = getAutoUpdateSupport(input)
  if (!support.supported) return support.reason
  if (!input.autoCheckEnabled) return "disabled-by-user"
  return undefined
}

export function parseVersion(version: string): ParsedVersion | null {
  const cleaned = version.trim().replace(/^v/i, "")
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  }
}

export function compareVersions(a: string, b: string): number | null {
  const parsedA = parseVersion(a)
  const parsedB = parseVersion(b)
  if (!parsedA || !parsedB) return null

  for (const key of ["major", "minor", "patch"] as const) {
    if (parsedA[key] > parsedB[key]) return 1
    if (parsedA[key] < parsedB[key]) return -1
  }
  return 0
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function parseGitHubReleaseForUpdate(
  release: GitHubReleaseLike,
  options: {
    currentVersion: string
    latestPageUrl: string
    releasesPageUrl: string
    checkedAt?: string
  },
): ParsedAppUpdateRelease {
  const latestVersion = getString(release.tag_name)

  if (!latestVersion) {
    throw new Error("Latest GitHub Release did not include a tag")
  }

  const comparison = compareVersions(latestVersion, options.currentVersion)
  const status =
    comparison === null
      ? "unknown"
      : comparison > 0
        ? "update-available"
        : "up-to-date"
  const releaseNotes = getString(release.body)

  return {
    status,
    currentVersion: options.currentVersion,
    latestVersion,
    releaseName: getString(release.name) ?? latestVersion,
    releasePageUrl: getString(release.html_url) ?? options.latestPageUrl,
    releasesPageUrl: options.releasesPageUrl,
    publishedAt: getString(release.published_at),
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    isDraft: release.draft === true,
    isPrerelease: release.prerelease === true,
    releaseNotes: releaseNotes ? releaseNotes.slice(0, 1800) : undefined,
  }
}
