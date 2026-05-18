import { describe, expect, test } from "bun:test"
import {
  compareVersions,
  parseGitHubReleaseForUpdate,
  parseVersion,
} from "../src/shared/app-update"

describe("app update parsing", () => {
  test("parses semver-like release tags", () => {
    expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 })
    expect(parseVersion("1.2")).toEqual({ major: 1, minor: 2, patch: 0 })
    expect(parseVersion("1.2.3-beta.1")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
    })
    expect(parseVersion("release")).toBeNull()
  })

  test("compares current and latest versions", () => {
    expect(compareVersions("v0.0.73", "0.0.72")).toBe(1)
    expect(compareVersions("0.0.72", "0.0.72")).toBe(0)
    expect(compareVersions("0.0.71", "0.0.72")).toBe(-1)
    expect(compareVersions("canary", "0.0.72")).toBeNull()
  })

  test("normalizes GitHub release response into update-available status", () => {
    const result = parseGitHubReleaseForUpdate(
      {
        tag_name: "v0.0.73",
        name: "Locus 0.0.73",
        html_url: "https://github.com/lupanpan1030/agent-code-for-me/releases/tag/v0.0.73",
        published_at: "2026-05-18T01:00:00Z",
        body: "A".repeat(1900),
        draft: false,
        prerelease: true,
      },
      {
        currentVersion: "0.0.72",
        latestPageUrl: "https://github.com/lupanpan1030/agent-code-for-me/releases/latest",
        releasesPageUrl: "https://github.com/lupanpan1030/agent-code-for-me/releases",
        checkedAt: "2026-05-18T02:00:00Z",
      },
    )

    expect(result.status).toBe("update-available")
    expect(result.latestVersion).toBe("v0.0.73")
    expect(result.releaseName).toBe("Locus 0.0.73")
    expect(result.isPrerelease).toBe(true)
    expect(result.releaseNotes?.length).toBe(1800)
    expect(result.checkedAt).toBe("2026-05-18T02:00:00Z")
  })

  test("falls back release fields and reports unknown for unparsable tags", () => {
    const result = parseGitHubReleaseForUpdate(
      { tag_name: "nightly", name: " ", html_url: " " },
      {
        currentVersion: "0.0.72",
        latestPageUrl: "https://example.com/latest",
        releasesPageUrl: "https://example.com/releases",
        checkedAt: "2026-05-18T02:00:00Z",
      },
    )

    expect(result.status).toBe("unknown")
    expect(result.releaseName).toBe("nightly")
    expect(result.releasePageUrl).toBe("https://example.com/latest")
  })

  test("rejects release responses without a tag", () => {
    expect(() =>
      parseGitHubReleaseForUpdate(
        {},
        {
          currentVersion: "0.0.72",
          latestPageUrl: "https://example.com/latest",
          releasesPageUrl: "https://example.com/releases",
        },
      ),
    ).toThrow("Latest GitHub Release did not include a tag")
  })
})
