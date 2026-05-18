import { app } from "electron"
import { publicProcedure, router } from "../index"
import { assertOfficialCloudAllowed } from "../../local-only"
import {
  parseGitHubReleaseForUpdate,
  type GitHubReleaseLike,
} from "../../../../shared/app-update"

const DEFAULT_RELEASES_REPO = "lupanpan1030/agent-code-for-me"

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

    const release = (await response.json()) as GitHubReleaseLike
    return parseGitHubReleaseForUpdate(release, {
      currentVersion: app.getVersion(),
      latestPageUrl: urls.latestPageUrl,
      releasesPageUrl: urls.releasesPageUrl,
    })
  }),
})
