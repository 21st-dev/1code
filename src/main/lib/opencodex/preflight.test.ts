import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  OPENCODEX_APP_SERVER_HOME_VERSION,
  OPENCODEX_LAYOUT_VERSION,
  evaluateOpenCodexStartupState,
  readOpenCodexReleaseMetadata,
  resolveOpenCodexDataPaths,
  runOpenCodexPackagingPreflight,
} from "./preflight"

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function createTempUserDataRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "opencodex-preflight-"))
  tempRoots.push(root)
  return root
}

describe("runOpenCodexPackagingPreflight", () => {
  test("writes release metadata for the current app version on first run", () => {
    const userDataPath = createTempUserDataRoot()

    const result = runOpenCodexPackagingPreflight({
      userDataPath,
      appVersion: "1.2.3",
    })
    const paths = resolveOpenCodexDataPaths(userDataPath)
    const releaseMetadata = JSON.parse(
      readFileSync(paths.releaseMetadataFile, "utf-8"),
    ) as {
      currentVersion: string
      firstRunVersion: string
      previousVersion?: string | null
    }

    expect(result.status).toBe("ready")
    expect(releaseMetadata.currentVersion).toBe("1.2.3")
    expect(releaseMetadata.firstRunVersion).toBe("1.2.3")
    expect(releaseMetadata.previousVersion ?? null).toBe(null)
  })

  test("creates the owned OpenCodex layout for a fresh install", () => {
    const userDataPath = createTempUserDataRoot()

    const result = runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })
    const paths = resolveOpenCodexDataPaths(userDataPath)

    expect(result.status).toBe("ready")
    expect(result.importedLegacyDesktopDb).toBe(false)
    expect(existsSync(paths.stateDir)).toBe(true)
    expect(existsSync(paths.logsDir)).toBe(true)
    expect(existsSync(paths.cacheDir)).toBe(true)
    expect(existsSync(paths.importsDir)).toBe(true)
    expect(existsSync(paths.appServerHomeDir)).toBe(true)
    expect(readFileSync(paths.layoutVersionFile, "utf-8")).toContain(
      `"version": ${OPENCODEX_LAYOUT_VERSION}`,
    )
    expect(readFileSync(paths.appServerHomeVersionFile, "utf-8")).toContain(
      `"version": ${OPENCODEX_APP_SERVER_HOME_VERSION}`,
    )
  })

  test("imports the legacy desktop database into the owned state layout exactly once", () => {
    const userDataPath = createTempUserDataRoot()
    const legacyDataDir = join(userDataPath, "data")
    mkdirSync(legacyDataDir, { recursive: true })
    writeFileSync(join(legacyDataDir, "agents.db"), "legacy-db", "utf-8")

    const result = runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })
    const paths = resolveOpenCodexDataPaths(userDataPath)
    const receipt = readFileSync(paths.desktopImportReceiptFile, "utf-8")

    expect(result.status).toBe("ready")
    expect(result.importedLegacyDesktopDb).toBe(true)
    expect(readFileSync(paths.desktopStateDbPath, "utf-8")).toBe("legacy-db")
    expect(readFileSync(join(legacyDataDir, "agents.db"), "utf-8")).toBe("legacy-db")
    expect(receipt).toContain(`"imported": true`)
    expect(receipt).toContain(`"source": "${join(legacyDataDir, "agents.db").replaceAll("\\", "\\\\")}"`)
  })

  test("reads owned release metadata after a versioned upgrade", () => {
    const userDataPath = createTempUserDataRoot()

    runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })
    runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.4" })

    const releaseMetadata = readOpenCodexReleaseMetadata({ userDataPath })

    expect(releaseMetadata?.firstRunVersion).toBe("1.2.3")
    expect(releaseMetadata?.previousVersion).toBe("1.2.3")
    expect(releaseMetadata?.currentVersion).toBe("1.2.4")
  })


  test("imports the legacy update channel preference into the owned state layout", () => {
    const userDataPath = createTempUserDataRoot()
    const paths = resolveOpenCodexDataPaths(userDataPath)

    writeFileSync(
      join(userDataPath, "update-channel.json"),
      JSON.stringify({ channel: "beta" }, null, 2),
      "utf-8",
    )

    runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })

    const importedChannel = JSON.parse(
      readFileSync(paths.updateChannelPrefPath, "utf-8"),
    ) as { channel?: string }

    expect(importedChannel.channel).toBe("beta")
  })


  test("writes a legacy import manifest for imported artifacts", () => {
    const userDataPath = createTempUserDataRoot()
    const legacyDataDir = join(userDataPath, "data")
    const paths = resolveOpenCodexDataPaths(userDataPath)

    mkdirSync(legacyDataDir, { recursive: true })
    writeFileSync(join(legacyDataDir, "agents.db"), "legacy-db", "utf-8")
    writeFileSync(
      join(userDataPath, "update-channel.json"),
      JSON.stringify({ channel: "beta" }, null, 2),
      "utf-8",
    )

    runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })

    const manifest = JSON.parse(
      readFileSync(paths.legacyImportManifestFile, "utf-8"),
    ) as {
      importedArtifacts: Array<{ kind: string; source: string; destination: string }>
    }

    expect(manifest.importedArtifacts).toEqual([
      {
        kind: "desktop-database",
        source: join(userDataPath, "data", "agents.db"),
        destination: paths.desktopStateDbPath,
      },
      {
        kind: "update-channel-preference",
        source: join(userDataPath, "update-channel.json"),
        destination: paths.updateChannelPrefPath,
      },
    ])
  })

  test("records unsupported legacy desktop files as skipped artifacts", () => {
    const userDataPath = createTempUserDataRoot()
    const legacyDataDir = join(userDataPath, "data")
    const paths = resolveOpenCodexDataPaths(userDataPath)

    mkdirSync(legacyDataDir, { recursive: true })
    writeFileSync(join(legacyDataDir, "agents.db"), "legacy-db", "utf-8")
    writeFileSync(join(legacyDataDir, "notes.txt"), "leave-me-alone", "utf-8")

    runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })

    const manifest = JSON.parse(
      readFileSync(paths.legacyImportManifestFile, "utf-8"),
    ) as {
      skippedArtifacts: Array<{ kind: string; source: string; reason: string }>
    }

    expect(readFileSync(join(legacyDataDir, "notes.txt"), "utf-8")).toBe("leave-me-alone")
    expect(manifest.skippedArtifacts).toContainEqual({
      kind: "unsupported-desktop-state-file",
      source: join(userDataPath, "data", "notes.txt"),
      reason: "unsupported-legacy-desktop-artifact",
    })
  })

  test("records invalid legacy update-channel preferences as skipped artifacts", () => {
    const userDataPath = createTempUserDataRoot()
    const paths = resolveOpenCodexDataPaths(userDataPath)

    writeFileSync(
      join(userDataPath, "update-channel.json"),
      JSON.stringify({ channel: "nightly" }, null, 2),
      "utf-8",
    )

    runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })

    const manifest = JSON.parse(
      readFileSync(paths.legacyImportManifestFile, "utf-8"),
    ) as {
      importedArtifacts: Array<{ kind: string; source: string; destination: string }>
      skippedArtifacts: Array<{ kind: string; source: string; reason: string }>
    }

    expect(existsSync(paths.updateChannelPrefPath)).toBe(false)
    expect(manifest.importedArtifacts).toEqual([])
    expect(manifest.skippedArtifacts).toContainEqual({
      kind: "update-channel-preference",
      source: join(userDataPath, "update-channel.json"),
      reason: "unsupported-update-channel-value",
    })
  })

  test("blocks startup when the owned layout exists but release metadata is missing", () => {
    const userDataPath = createTempUserDataRoot()
    const paths = resolveOpenCodexDataPaths(userDataPath)

    mkdirSync(paths.stateDir, { recursive: true })
    mkdirSync(paths.appServerHomeDir, { recursive: true })
    writeFileSync(
      paths.layoutVersionFile,
      JSON.stringify({ version: OPENCODEX_LAYOUT_VERSION }, null, 2),
      "utf-8",
    )
    writeFileSync(
      paths.appServerHomeVersionFile,
      JSON.stringify({ version: OPENCODEX_APP_SERVER_HOME_VERSION }, null, 2),
      "utf-8",
    )

    expect(() =>
      runOpenCodexPackagingPreflight({
        userDataPath,
        appVersion: "1.2.3",
      }),
    ).toThrow(/release metadata/i)
  })

  test("blocks startup when the owned layout exists but app-server-home version metadata is missing", () => {
    const userDataPath = createTempUserDataRoot()
    const paths = resolveOpenCodexDataPaths(userDataPath)

    mkdirSync(paths.stateDir, { recursive: true })
    mkdirSync(paths.appServerHomeDir, { recursive: true })
    writeFileSync(
      paths.layoutVersionFile,
      JSON.stringify({ version: OPENCODEX_LAYOUT_VERSION }, null, 2),
      "utf-8",
    )

    expect(() => runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })).toThrow(
      /app-server-home version metadata/i,
    )
  })

  test("blocks startup when release metadata json is malformed", () => {
    const userDataPath = createTempUserDataRoot()
    const paths = resolveOpenCodexDataPaths(userDataPath)

    mkdirSync(paths.stateDir, { recursive: true })
    mkdirSync(paths.appServerHomeDir, { recursive: true })
    writeFileSync(
      paths.layoutVersionFile,
      JSON.stringify({ version: OPENCODEX_LAYOUT_VERSION }, null, 2),
      "utf-8",
    )
    writeFileSync(
      paths.appServerHomeVersionFile,
      JSON.stringify({ version: OPENCODEX_APP_SERVER_HOME_VERSION }, null, 2),
      "utf-8",
    )
    writeFileSync(paths.releaseMetadataFile, '{not-json', 'utf-8')

    expect(() => runOpenCodexPackagingPreflight({ userDataPath, appVersion: "1.2.3" })).toThrow(
      /release metadata.*invalid/i,
    )
  })

  test("returns a blocked startup state when app-server-home version json is malformed", () => {
    const userDataPath = createTempUserDataRoot()
    const paths = resolveOpenCodexDataPaths(userDataPath)

    mkdirSync(paths.stateDir, { recursive: true })
    mkdirSync(paths.appServerHomeDir, { recursive: true })
    writeFileSync(
      paths.layoutVersionFile,
      JSON.stringify({ version: OPENCODEX_LAYOUT_VERSION }, null, 2),
      "utf-8",
    )
    writeFileSync(paths.appServerHomeVersionFile, '{not-json', 'utf-8')

    const state = evaluateOpenCodexStartupState({ userDataPath, appVersion: "1.2.3" })

    expect(state.status).toBe("blocked")
    expect(state.message).toMatch(/app-server-home version metadata.*invalid/i)
  })

  test("returns a blocked startup state instead of throwing when preflight fails", () => {
    const userDataPath = createTempUserDataRoot()
    const paths = resolveOpenCodexDataPaths(userDataPath)

    mkdirSync(paths.stateDir, { recursive: true })
    mkdirSync(paths.appServerHomeDir, { recursive: true })
    writeFileSync(
      paths.layoutVersionFile,
      JSON.stringify({ version: OPENCODEX_LAYOUT_VERSION }, null, 2),
      "utf-8",
    )

    const state = evaluateOpenCodexStartupState({ userDataPath, appVersion: "1.2.3" })

    expect(state.status).toBe("blocked")
    expect(state.reason).toBe("packaging-preflight")
    expect(state.message).toMatch(/app-server-home version metadata/i)
  })
})
