import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs"
import { join } from "path"

export const OPENCODEX_LAYOUT_VERSION = 1
export const OPENCODEX_APP_SERVER_HOME_VERSION = 1

export interface OpenCodexDataPaths {
  rootDir: string
  stateDir: string
  logsDir: string
  cacheDir: string
  importsDir: string
  appServerHomeDir: string
  desktopStateDbPath: string
  legacyDesktopDbPath: string
  layoutVersionFile: string
  appServerHomeVersionFile: string
  desktopImportReceiptFile: string
  legacyImportManifestFile: string
  legacyUpdateChannelPrefPath: string
  releaseMetadataFile: string
  updateChannelPrefPath: string
}

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

export interface OpenCodexImportArtifact {
  kind: string
  source: string
  destination: string
}

export interface OpenCodexSkippedArtifact {
  kind: string
  source: string
  reason: string
}

export interface OpenCodexPackagingPreflightResult {
  status: "ready"
  importedLegacyDesktopDb: boolean
  paths: OpenCodexDataPaths
}

export class OpenCodexPackagingPreflightError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OpenCodexPackagingPreflightError"
  }
}

export function resolveOpenCodexDataPaths(userDataPath: string): OpenCodexDataPaths {
  const rootDir = join(userDataPath, "opencodex")
  const stateDir = join(rootDir, "state")
  const importsDir = join(rootDir, "imports")
  const appServerHomeDir = join(rootDir, "app-server-home")

  return {
    rootDir,
    stateDir,
    logsDir: join(rootDir, "logs"),
    cacheDir: join(rootDir, "cache"),
    importsDir,
    appServerHomeDir,
    desktopStateDbPath: join(stateDir, "agents.db"),
    legacyDesktopDbPath: join(userDataPath, "data", "agents.db"),
    layoutVersionFile: join(stateDir, "layout-version.json"),
    appServerHomeVersionFile: join(appServerHomeDir, "version.json"),
    desktopImportReceiptFile: join(importsDir, "desktop-state-import.json"),
    legacyImportManifestFile: join(importsDir, "legacy-import-manifest.json"),
    legacyUpdateChannelPrefPath: join(userDataPath, "update-channel.json"),
    releaseMetadataFile: join(stateDir, "release-metadata.json"),
    updateChannelPrefPath: join(stateDir, "update-channel.json"),
  }
}

export function runOpenCodexPackagingPreflight({
  userDataPath,
  appVersion,
}: {
  userDataPath: string
  appVersion: string
}): OpenCodexPackagingPreflightResult {
  const paths = resolveOpenCodexDataPaths(userDataPath)
  const layoutVersion = readVersion(paths.layoutVersionFile, "layout metadata")
  const appServerHomeVersion = readVersion(
    paths.appServerHomeVersionFile,
    "app-server-home version metadata",
  )
  const legacyDesktopDbExists = existsSync(paths.legacyDesktopDbPath)
  const ownedDesktopDbExists = existsSync(paths.desktopStateDbPath)
  const ownsImportArtifacts =
    ownedDesktopDbExists || existsSync(paths.desktopImportReceiptFile) || hasMeaningfulContents(paths.stateDir)

  ensureDirectories(paths)

  if (layoutVersion === null) {
    if (appServerHomeVersion !== null || ownsImportArtifacts) {
      throw new OpenCodexPackagingPreflightError(
        "OpenCodex startup blocked: owned layout metadata is missing for an existing state layout.",
      )
    }

    writeVersionFile(paths.layoutVersionFile, OPENCODEX_LAYOUT_VERSION)
    writeVersionFile(paths.appServerHomeVersionFile, OPENCODEX_APP_SERVER_HOME_VERSION)
    writeReleaseMetadata(paths.releaseMetadataFile, {
      currentVersion: appVersion,
      firstRunVersion: appVersion,
      previousVersion: null,
      lastStartedAt: new Date().toISOString(),
    })

    const importedArtifacts: OpenCodexImportArtifact[] = []
    const skippedArtifacts: OpenCodexSkippedArtifact[] = []
    importLegacyUpdateChannelPreference(paths, importedArtifacts, skippedArtifacts)

    let importedLegacyDesktopDb = false
    if (legacyDesktopDbExists && !ownedDesktopDbExists) {
      copyFileSync(paths.legacyDesktopDbPath, paths.desktopStateDbPath)
      writeJson(paths.desktopImportReceiptFile, {
        imported: true,
        source: paths.legacyDesktopDbPath,
        destination: paths.desktopStateDbPath,
        importedAt: new Date().toISOString(),
      })
      importedArtifacts.unshift({
        kind: "desktop-database",
        source: paths.legacyDesktopDbPath,
        destination: paths.desktopStateDbPath,
      })
      importedLegacyDesktopDb = true
    }

    collectSkippedLegacyDesktopArtifacts(paths, skippedArtifacts)

    writeJson(paths.legacyImportManifestFile, {
      importedArtifacts,
      skippedArtifacts,
    })

    return {
      status: "ready",
      importedLegacyDesktopDb,
      paths,
    }
  }

  if (layoutVersion !== OPENCODEX_LAYOUT_VERSION) {
    throw new OpenCodexPackagingPreflightError(
      `OpenCodex startup blocked: expected layout version ${OPENCODEX_LAYOUT_VERSION}, found ${layoutVersion}.`,
    )
  }

  if (appServerHomeVersion === null) {
    throw new OpenCodexPackagingPreflightError(
      "OpenCodex startup blocked: app-server-home version metadata is missing.",
    )
  }

  if (appServerHomeVersion !== OPENCODEX_APP_SERVER_HOME_VERSION) {
    throw new OpenCodexPackagingPreflightError(
      `OpenCodex startup blocked: expected app-server-home version ${OPENCODEX_APP_SERVER_HOME_VERSION}, found ${appServerHomeVersion}.`,
    )
  }

  const releaseMetadata = readReleaseMetadata(
    paths.releaseMetadataFile,
    "release metadata",
  )
  if (!releaseMetadata) {
    throw new OpenCodexPackagingPreflightError(
      "OpenCodex startup blocked: release metadata is missing.",
    )
  }

  writeReleaseMetadata(paths.releaseMetadataFile, {
    currentVersion: appVersion,
    firstRunVersion:
      typeof releaseMetadata.firstRunVersion === "string"
        ? releaseMetadata.firstRunVersion
        : appVersion,
    previousVersion:
      releaseMetadata.currentVersion !== appVersion
        ? releaseMetadata.currentVersion
        : releaseMetadata.previousVersion ?? null,
    lastStartedAt: new Date().toISOString(),
  })

  return {
    status: "ready",
    importedLegacyDesktopDb: false,
    paths,
  }
}

export function readOpenCodexReleaseMetadata({
  userDataPath,
}: {
  userDataPath: string
}): OpenCodexReleaseMetadata | null {
  const metadata = readReleaseMetadata(
    resolveOpenCodexDataPaths(userDataPath).releaseMetadataFile,
    "release metadata",
  )

  if (
    !metadata ||
    typeof metadata.currentVersion !== "string" ||
    typeof metadata.firstRunVersion !== "string" ||
    (metadata.previousVersion !== null &&
      metadata.previousVersion !== undefined &&
      typeof metadata.previousVersion !== "string") ||
    typeof metadata.lastStartedAt !== "string"
  ) {
    return null
  }

  return {
    currentVersion: metadata.currentVersion,
    firstRunVersion: metadata.firstRunVersion,
    previousVersion: metadata.previousVersion ?? null,
    lastStartedAt: metadata.lastStartedAt,
  }
}

export function evaluateOpenCodexStartupState({
  userDataPath,
  appVersion,
}: {
  userDataPath: string
  appVersion: string
}): OpenCodexStartupState {
  try {
    runOpenCodexPackagingPreflight({ userDataPath, appVersion })
    return { status: "ready" }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "OpenCodex startup blocked by an unexpected packaging preflight failure."

    return {
      status: "blocked",
      reason: "packaging-preflight",
      message,
    }
  }
}
function ensureDirectories(paths: OpenCodexDataPaths): void {
  for (const dir of [
    paths.rootDir,
    paths.stateDir,
    paths.logsDir,
    paths.cacheDir,
    paths.importsDir,
    paths.appServerHomeDir,
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}

function importLegacyUpdateChannelPreference(
  paths: OpenCodexDataPaths,
  importedArtifacts: OpenCodexImportArtifact[],
  skippedArtifacts: OpenCodexSkippedArtifact[],
): void {
  if (existsSync(paths.updateChannelPrefPath) || !existsSync(paths.legacyUpdateChannelPrefPath)) {
    return
  }

  try {
    const content = JSON.parse(
      readFileSync(paths.legacyUpdateChannelPrefPath, "utf-8"),
    ) as { channel?: unknown }

    if (content.channel === "latest" || content.channel === "beta") {
      writeJson(paths.updateChannelPrefPath, { channel: content.channel })
      importedArtifacts.push({
        kind: "update-channel-preference",
        source: paths.legacyUpdateChannelPrefPath,
        destination: paths.updateChannelPrefPath,
      })
      return
    }

    skippedArtifacts.push({
      kind: "update-channel-preference",
      source: paths.legacyUpdateChannelPrefPath,
      reason: "unsupported-update-channel-value",
    })
  } catch {
    skippedArtifacts.push({
      kind: "update-channel-preference",
      source: paths.legacyUpdateChannelPrefPath,
      reason: "invalid-update-channel-json",
    })
    // Ignore invalid legacy preference files; the updater will default to latest.
  }
}

function collectSkippedLegacyDesktopArtifacts(
  paths: OpenCodexDataPaths,
  skippedArtifacts: OpenCodexSkippedArtifact[],
): void {
  const legacyDesktopStateDir = join(paths.legacyDesktopDbPath, "..")
  if (!existsSync(legacyDesktopStateDir)) {
    return
  }

  for (const entry of readdirSync(legacyDesktopStateDir, { withFileTypes: true })) {
    if (entry.name === "agents.db") {
      continue
    }

    skippedArtifacts.push({
      kind: entry.isDirectory() ? "unsupported-desktop-state-directory" : "unsupported-desktop-state-file",
      source: join(legacyDesktopStateDir, entry.name),
      reason: "unsupported-legacy-desktop-artifact",
    })
  }
}

function readVersion(path: string, label: string): number | null {
  if (!existsSync(path)) {
    return null
  }

  const content = readJsonFile(path, label) as { version?: unknown }
  return typeof content.version === "number" ? content.version : null
}

function writeVersionFile(path: string, version: number): void {
  writeJson(path, { version })
}

function readJsonFile(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch {
    throw new OpenCodexPackagingPreflightError(
      `OpenCodex startup blocked: ${label} is invalid JSON.`,
    )
  }
}

function readReleaseMetadata(
  path: string,
  label: string,
): { currentVersion?: unknown; firstRunVersion?: unknown; previousVersion?: unknown; lastStartedAt?: unknown } | null {
  if (!existsSync(path)) {
    return null
  }

  return readJsonFile(path, label) as {
    currentVersion?: unknown
    firstRunVersion?: unknown
    previousVersion?: unknown
    lastStartedAt?: unknown
  }
}

function writeReleaseMetadata(
  path: string,
  value: {
    currentVersion: string
    firstRunVersion: string
    previousVersion: string | null
    lastStartedAt: string
  },
): void {
  writeJson(path, value)
}

function writeJson(path: string, value: object): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

function hasMeaningfulContents(path: string): boolean {
  if (!existsSync(path)) {
    return false
  }

  return readdirSync(path).length > 0
}
