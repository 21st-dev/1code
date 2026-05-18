import { app } from "electron"
import { publicProcedure, router } from "../index"
import { assertOfficialCloudAllowed } from "../../local-only"

const DEFAULT_RELEASES_REPO = "lupanpan1030/agent-code-for-me"

type ParsedVersion = {
  major: number
  minor: number
  patch: number
}

type GitHubRelease = {
  tag_name?: unknown
  name?: unknown
  html_url?: unknown
  published_at?: unknown
  body?: unknown
  draft?: unknown
  prerelease?: unknown
}

function getReleasesRepo(): string {
  return (
    process.env.LOCUS_RELEASES_REPO ||
    process.env.MAIN_VITE_RELEASES_REPO ||
    DEFAULT_RELEASES_REPO
  )
}

function getReleaseUrls() {
  const repo = getReleasesRepo()
  return {
    repo,
    latestApiUrl: `https://api.github.com/repos/${repo}/releases/latest`,
    releasesPageUrl: `https://github.com/${repo}/releases`,
    latestPageUrl: `https://github.com/${repo}/releases/latest`,
  }
}

function parseVersion(version: string): ParsedVersion | null {
  const cleaned = version.trim().replace(/^v/i, "")
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  }
}

function compareVersions(a: string, b: string): number | null {
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

export const appUpdatesRouter = router({
  getCurrent: publicProcedure.query(() => {
    const urls = getReleaseUrls()
    return {
      currentVersion: app.getVersion(),
      releasesRepo: urls.repo,
      releasesPageUrl: urls.releasesPageUrl,
      latestPageUrl: urls.latestPageUrl,
    }
  }),

  check: publicProcedure.mutation(async () => {
    const urls = getReleaseUrls()
    assertOfficialCloudAllowed("check Locus updates", urls.latestApiUrl)

    const response = await fetch(urls.latestApiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Locus/${app.getVersion()}`,
      },
    })

    if (response.status === 404) {
      return {
        status: "no-release",
        currentVersion: app.getVersion(),
        latestVersion: null,
        releaseName: null,
        releasePageUrl: urls.releasesPageUrl,
        releasesPageUrl: urls.releasesPageUrl,
        publishedAt: null,
        checkedAt: new Date().toISOString(),
        isDraft: false,
        isPrerelease: false,
        releaseNotes: undefined,
      }
    }

    if (!response.ok) {
      throw new Error(`GitHub Releases check failed (${response.status})`)
    }

    const release = (await response.json()) as GitHubRelease
    const latestVersion = getString(release.tag_name)

    if (!latestVersion) {
      throw new Error("Latest GitHub Release did not include a tag")
    }

    const currentVersion = app.getVersion()
    const comparison = compareVersions(latestVersion, currentVersion)
    const status =
      comparison === null
        ? "unknown"
        : comparison > 0
          ? "update-available"
          : "up-to-date"

    const releaseNotes = getString(release.body)

    return {
      status,
      currentVersion,
      latestVersion,
      releaseName: getString(release.name) ?? latestVersion,
      releasePageUrl: getString(release.html_url) ?? urls.latestPageUrl,
      releasesPageUrl: urls.releasesPageUrl,
      publishedAt: getString(release.published_at),
      checkedAt: new Date().toISOString(),
      isDraft: release.draft === true,
      isPrerelease: release.prerelease === true,
      releaseNotes: releaseNotes ? releaseNotes.slice(0, 1800) : undefined,
    }
  }),
})
