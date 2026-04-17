import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  assessPackagingReadiness,
  collectReleaseUploadPlan,
  getConfiguredWebBaseUrl,
  getMacArtifactNames,
  getManifestNextStepLines,
  getReleaseUploadTargetLabel,
  getReleaseWebTargetLabel,
} from "./release-config.mjs"

const tempRoots: string[] = []
const codexDownloaderSource = readFileSync(
  join(import.meta.dir, "download-codex-binary.mjs"),
  "utf-8",
)
const claudeDownloaderSource = readFileSync(
  join(import.meta.dir, "download-claude-binary.mjs"),
  "utf-8",
)
const syncToPublicSource = readFileSync(
  join(import.meta.dir, "sync-to-public.sh"),
  "utf-8",
)
const legacyCliLauncherPath = join(import.meta.dir, "..", "resources", "cli", "1code")

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function createTempReleaseDir(): string {
  const root = mkdtempSync(join(tmpdir(), "opencodex-release-"))
  tempRoots.push(root)
  return root
}

const packageJson = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "package.json"), "utf-8"),
) as {
  name: string
  description: string
  author?: { name?: string }
  build?: {
    appId?: string
    productName?: string
    protocols?: Array<{ name?: string; schemes?: string[] }>
    publish?: { url?: string }
    extraResources?: Array<{ from?: string; to?: string }>
  }
}

describe("release packaging identity", () => {
  test("package metadata uses OpenCodex-owned identifiers", () => {
    expect(packageJson.name).toBe("opencodex-desktop")
    expect(packageJson.description).toContain("OpenCodex")
    expect(packageJson.author?.name).toBe("OpenCodex")
    expect(packageJson.build?.appId).toBe("dev.opencodex.desktop")
    expect(packageJson.build?.productName).toBe("OpenCodex")
    expect(packageJson.build?.protocols).toEqual([
      {
        name: "OpenCodex",
        schemes: ["opencodex"],
      },
    ])
    expect(packageJson.build?.publish?.url).toBe("${env.OPENCODEX_UPDATE_BASE_URL}")
  })

  test("release packaging includes only the OpenCodex CLI launchers in extra resources", () => {
    expect(packageJson.build?.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "resources/cli/opencodex",
          to: "cli/opencodex",
        }),
        expect.objectContaining({
          from: "resources/cli/opencodex.cmd",
          to: "cli/opencodex.cmd",
        }),
      ]),
    )
    expect(packageJson.build?.extraResources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "resources/cli",
          to: "cli",
        }),
      ]),
    )
  })

  test("release script uses the OpenCodex doctor and upload flow", () => {
    expect(packageJson.scripts?.release).toContain("bun run dist:doctor")
    expect(packageJson.scripts?.release).toContain("bun run dist:upload")
    expect(packageJson.scripts?.release).not.toContain("upload-release-wrangler.sh")
  })

  test("release scripts avoid Unix-only rm -rf cleanup", () => {
    expect(packageJson.scripts?.release).not.toContain("rm -rf")
    expect(packageJson.scripts?.["release:dev"]).not.toContain("rm -rf")
  })

  test("codex downloader uses an OpenCodex-owned user-agent", () => {
    expect(codexDownloaderSource).toContain('const USER_AGENT = "opencodex-desktop-codex-downloader"')
    expect(codexDownloaderSource).not.toContain('21st-desktop-codex-downloader')
  })

  test("claude downloader uses an OpenCodex-owned user-agent", () => {
    expect(claudeDownloaderSource).toContain('const USER_AGENT = "opencodex-desktop-claude-downloader"')
    expect(claudeDownloaderSource).toContain('"User-Agent": USER_AGENT')
  })

  test("sync-to-public script requires explicit OpenCodex repo targets", () => {
    expect(syncToPublicSource).toContain('OPENCODEX_PUBLIC_REPO_GIT')
    expect(syncToPublicSource).toContain('OPENCODEX_PUBLIC_REPO_HTTPS')
    expect(syncToPublicSource).toContain('OPENCODEX_PRIVATE_REPO')
    expect(syncToPublicSource).not.toContain('git@github.com:21st-dev/1code.git')
    expect(syncToPublicSource).not.toContain('https://github.com/21st-dev/1code')
    expect(syncToPublicSource).not.toContain('21st-dev/21st')
  })

  test("legacy 1code cli launcher resource is removed", () => {
    expect(require('fs').existsSync(legacyCliLauncherPath)).toBe(false)
  })

  test("release artifact names follow the packaged product name", () => {
    expect(getMacArtifactNames({ productName: "OpenCodex", version: "1.2.3" })).toEqual({
      arm64Zip: "OpenCodex-1.2.3-arm64-mac.zip",
      x64Zip: "OpenCodex-1.2.3-mac.zip",
      arm64Dmg: "OpenCodex-1.2.3-arm64.dmg",
      x64Dmg: "OpenCodex-1.2.3.dmg",
    })
  })

  test("release upload instructions use the explicit OpenCodex update target when present", () => {
    expect(
      getReleaseUploadTargetLabel({
        OPENCODEX_UPDATE_BASE_URL: "https://updates.opencodex.test/releases/desktop/",
      }),
    ).toBe("https://updates.opencodex.test/releases/desktop")
  })

  test("release upload instructions call out the required OpenCodex update target when unset", () => {
    expect(getReleaseUploadTargetLabel({})).toBe("the OPENCODEX_UPDATE_BASE_URL target")
  })

  test("release web-host instructions use the explicit OpenCodex web host when present", () => {
    expect(getConfiguredWebBaseUrl({ OPENCODEX_WEB_URL: " https://desktop.opencodex.test/root/ " })).toBe(
      "https://desktop.opencodex.test/root",
    )
    expect(getReleaseWebTargetLabel({ OPENCODEX_WEB_URL: "https://desktop.opencodex.test/root/" })).toBe(
      "https://desktop.opencodex.test/root",
    )
  })

  test("release web-host instructions call out the required OpenCodex web host when unset", () => {
    expect(getConfiguredWebBaseUrl({})).toBeNull()
    expect(getReleaseWebTargetLabel({})).toBe("the OPENCODEX_WEB_URL host")
  })

  test("manifest next-step guidance includes both configured hosts and packaged artifacts", () => {
    expect(
      getManifestNextStepLines({
        env: {
          OPENCODEX_WEB_URL: "https://desktop.opencodex.test",
          OPENCODEX_UPDATE_BASE_URL: "https://updates.opencodex.test/releases/desktop",
        },
        channel: "latest",
        macArtifactNames: getMacArtifactNames({ productName: "OpenCodex", version: "1.2.3" }),
        hasArm64Manifest: true,
        hasX64Manifest: true,
      }),
    ).toEqual([
      "1. Confirm packaged hosts: web=https://desktop.opencodex.test, updates=https://updates.opencodex.test/releases/desktop",
      "2. Upload the following files to https://updates.opencodex.test/releases/desktop:",
      "   - latest-mac.yml",
      "   - OpenCodex-1.2.3-arm64-mac.zip",
      "   - OpenCodex-1.2.3-arm64.dmg (for manual download)",
      "   - latest-mac-x64.yml",
      "   - OpenCodex-1.2.3-mac.zip",
      "   - OpenCodex-1.2.3.dmg (for manual download)",
      "3. Create a release entry in the admin dashboard",
    ])
  })

  test("collects a release upload plan for generated manifests and artifacts", () => {
    const releaseDir = createTempReleaseDir()
    for (const fileName of [
      "latest-mac.yml",
      "latest-mac-x64.yml",
      "latest-linux.yml",
      "OpenCodex-1.2.3-arm64-mac.zip",
      "OpenCodex-1.2.3-mac.zip",
      "OpenCodex-1.2.3-arm64.dmg",
      "OpenCodex-1.2.3.dmg",
      "OpenCodex-1.2.3.AppImage",
    ]) {
      writeFileSync(join(releaseDir, fileName), fileName, "utf-8")
    }

    const plan = collectReleaseUploadPlan({
      env: {
        OPENCODEX_UPDATE_BASE_URL: "https://updates.opencodex.test/releases/desktop/",
      },
      productName: "OpenCodex",
      version: "1.2.3",
      releaseDir,
    })

    expect(plan.targetBaseUrl).toBe("https://updates.opencodex.test/releases/desktop")
    expect(plan.entries.map((entry) => entry.fileName)).toEqual([
      "latest-linux.yml",
      "latest-mac-x64.yml",
      "latest-mac.yml",
      "OpenCodex-1.2.3-arm64-mac.zip",
      "OpenCodex-1.2.3-arm64.dmg",
      "OpenCodex-1.2.3-mac.zip",
      "OpenCodex-1.2.3.AppImage",
      "OpenCodex-1.2.3.dmg",
    ])
    expect(plan.entries[0]?.targetUrl).toBe(
      "https://updates.opencodex.test/releases/desktop/latest-linux.yml",
    )
  })

  test("requires an explicit OpenCodex update target for upload planning", () => {
    const releaseDir = createTempReleaseDir()
    writeFileSync(join(releaseDir, "latest-mac.yml"), "manifest", "utf-8")

    expect(() =>
      collectReleaseUploadPlan({
        env: {},
        productName: "OpenCodex",
        version: "1.2.3",
        releaseDir,
      }),
    ).toThrow(/OPENCODEX_UPDATE_BASE_URL/i)
  })

  test("reports missing build-tool dependencies and update target as packaging-readiness blockers", () => {
    const rootDir = createTempReleaseDir()

    const readiness = assessPackagingReadiness({
      env: {},
      rootDir,
    })

    expect(readiness.ok).toBe(false)
    expect(readiness.issues).toEqual([
      "Missing installed dependency: electron-vite",
      "Missing installed dependency: electron-builder",
      "Missing required release env: OPENCODEX_UPDATE_BASE_URL",
      "Missing required packaged web env: OPENCODEX_WEB_URL",
    ])
  })

  test("reports packaging readiness once build tools and update target are available", () => {
    const rootDir = createTempReleaseDir()
    for (const pkg of ["electron-vite", "electron-builder"]) {
      const pkgDir = join(rootDir, "node_modules", pkg)
      require("fs").mkdirSync(pkgDir, { recursive: true })
      writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: pkg }, null, 2), "utf-8")
    }

    const readiness = assessPackagingReadiness({
      env: {
        OPENCODEX_UPDATE_BASE_URL: "https://updates.opencodex.test/releases/desktop",
        OPENCODEX_WEB_URL: "https://desktop.opencodex.test",
      },
      rootDir,
    })

    expect(readiness.ok).toBe(true)
    expect(readiness.issues).toEqual([])
  })
})