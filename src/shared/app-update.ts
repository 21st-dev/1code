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
