import { createHash, randomUUID } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "node:path"
import { inflateRawSync } from "node:zlib"
import { getElectronUserDataPath } from "../electron-app"
import {
  type KunCliSettingsOptions,
  readKunCliSettings,
  writeKunCliSettings,
} from "./kun-cli-settings"

const KUN_MANAGED_INSTALL_HINT =
  "Install Kun through Locus when a pinned build is available, or use guided BYO setup."
const KUN_MANAGED_INSTALL_VERSION = "0.2.16"
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_UNIX_SYMLINK_MODE = 0o120000
const ZIP_UNIX_FILE_TYPE_MASK = 0o170000

export type KunManagedInstallArchiveKind = "zip"

export type KunManagedInstallBuild = {
  version: string
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  assetUrl: string
  assetName: string
  sha256: string
  sizeBytes: number
  archiveKind: KunManagedInstallArchiveKind
  executableRelativePath: string
}

export type KunManagedInstallState =
  | "unavailable"
  | "available"
  | "installed"
  | "update-available"

export type KunManagedInstallStatus = {
  state: KunManagedInstallState
  available: boolean
  installed: boolean
  updateAvailable: boolean
  version: string | null
  installedVersion: string | null
  assetName: string | null
  executablePath: string | null
  installPath: string | null
  reason: string | null
  hint: string
}

export type KunManagedInstallOptions = KunCliSettingsOptions & {
  platform?: NodeJS.Platform
  arch?: NodeJS.Architecture
  builds?: readonly KunManagedInstallBuild[]
}

export type KunManagedInstallRunOptions = KunManagedInstallOptions & {
  fetchImpl?: typeof fetch
}

export type KunManagedInstallResult = {
  ok: true
  build: KunManagedInstallBuild
  executablePath: string
  installPath: string
  status: KunManagedInstallStatus
}

export const DEFAULT_KUN_MANAGED_INSTALL_BUILDS: readonly KunManagedInstallBuild[] =
  [
    {
      version: KUN_MANAGED_INSTALL_VERSION,
      platform: "darwin",
      arch: "arm64",
      assetUrl:
        "https://github.com/KunAgent/Kun/releases/download/v0.2.16/Kun-0.2.16-mac-arm64.zip",
      assetName: "Kun-0.2.16-mac-arm64.zip",
      sha256:
        "ffcdc9fe346722ec2e0243e0ae5957aa64c0e1942b635af5cd57b65289704d3b",
      sizeBytes: 213_938_855,
      archiveKind: "zip",
      executableRelativePath: "Kun.app/Contents/MacOS/Kun",
    },
    {
      version: KUN_MANAGED_INSTALL_VERSION,
      platform: "darwin",
      arch: "x64",
      assetUrl:
        "https://github.com/KunAgent/Kun/releases/download/v0.2.16/Kun-0.2.16-mac-x64.zip",
      assetName: "Kun-0.2.16-mac-x64.zip",
      sha256:
        "734c4a6ce43c41c0403cc4a44404c2e095580eafe11e64f5ee361c139476ed7c",
      sizeBytes: 220_778_712,
      archiveKind: "zip",
      executableRelativePath: "Kun.app/Contents/MacOS/Kun",
    },
  ]

function sanitizeInstallError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.trim().slice(0, 500) || "Kun managed install failed."
}

function resolveUserDataPath(options: KunManagedInstallOptions): string | null {
  if (options.userDataPath) return options.userDataPath
  try {
    return getElectronUserDataPath()
  } catch {
    return null
  }
}

export function getKunManagedInstallRoot(
  options: KunManagedInstallOptions = {},
): string | null {
  const userDataPath = resolveUserDataPath(options)
  return userDataPath ? join(userDataPath, "runtimes", "kun") : null
}

function getKunManagedInstallPath(
  build: KunManagedInstallBuild,
  options: KunManagedInstallOptions = {},
): string | null {
  const root = getKunManagedInstallRoot(options)
  return root ? join(root, build.version) : null
}

function isSameOrInside(childPath: string, parentPath: string): boolean {
  const child = resolve(childPath)
  const parent = resolve(parentPath)
  const childToParent = relative(parent, child)
  return (
    childToParent === "" ||
    (!!childToParent &&
      !childToParent.startsWith("..") &&
      !isAbsolute(childToParent))
  )
}

export function isKunManagedExecutablePath(
  executablePath: string | null | undefined,
  options: KunManagedInstallOptions = {},
): boolean {
  if (!executablePath) return false
  const root = getKunManagedInstallRoot(options)
  return Boolean(root && isSameOrInside(executablePath, root))
}

export function selectKunManagedInstallBuild(
  options: KunManagedInstallOptions = {},
): KunManagedInstallBuild | null {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  return (
    (options.builds ?? DEFAULT_KUN_MANAGED_INSTALL_BUILDS).find(
      (build) => build.platform === platform && build.arch === arch,
    ) ?? null
  )
}

function managedInstallUnavailable(reason: string): KunManagedInstallStatus {
  return {
    state: "unavailable",
    available: false,
    installed: false,
    updateAvailable: false,
    version: null,
    installedVersion: null,
    assetName: null,
    executablePath: null,
    installPath: null,
    reason,
    hint: KUN_MANAGED_INSTALL_HINT,
  }
}

function managedExecutablePathForBuild(
  build: KunManagedInstallBuild,
  options: KunManagedInstallOptions,
): string | null {
  const installPath = getKunManagedInstallPath(build, options)
  if (!installPath) return null
  return join(installPath, build.executableRelativePath)
}

function managedVersionFromPath(
  executablePath: string | null,
  options: KunManagedInstallOptions,
): string | null {
  if (!executablePath) return null
  const root = getKunManagedInstallRoot(options)
  if (!root || !isSameOrInside(executablePath, root)) return null
  const rel = relative(root, executablePath)
  const [version] = rel.split(/[\\/]/)
  return version?.trim() || null
}

function executableExists(filePath: string | null): boolean {
  if (!filePath || !existsSync(filePath)) return false
  try {
    const stats = statSync(filePath)
    return stats.isFile() && (stats.mode & 0o111) !== 0
  } catch {
    return false
  }
}

export function resolveKunManagedInstallStatus(
  options: KunManagedInstallOptions = {},
): KunManagedInstallStatus {
  const root = getKunManagedInstallRoot(options)
  if (!root) {
    return managedInstallUnavailable(
      "Electron userData path is unavailable in this runtime.",
    )
  }
  const build = selectKunManagedInstallBuild(options)
  if (!build) {
    return managedInstallUnavailable(
      `No allowlisted Kun managed build for ${options.platform ?? process.platform}/${options.arch ?? process.arch}.`,
    )
  }

  const currentSettings = readKunCliSettings(options)
  const currentManagedVersion = managedVersionFromPath(
    currentSettings.executablePath,
    options,
  )
  const installed = executableExists(currentSettings.executablePath)
  const installPath = getKunManagedInstallPath(build, options)
  const selectedExecutablePath = managedExecutablePathForBuild(build, options)
  const selectedInstalled =
    currentSettings.executablePath === selectedExecutablePath &&
    executableExists(selectedExecutablePath)
  const updateAvailable =
    Boolean(currentManagedVersion && currentManagedVersion !== build.version) ||
    Boolean(
      currentManagedVersion &&
        currentManagedVersion === build.version &&
        !selectedInstalled,
    )

  if (selectedInstalled) {
    return {
      state: "installed",
      available: true,
      installed: true,
      updateAvailable: false,
      version: build.version,
      installedVersion: build.version,
      assetName: build.assetName,
      executablePath: selectedExecutablePath,
      installPath,
      reason: null,
      hint: KUN_MANAGED_INSTALL_HINT,
    }
  }

  if (installed && currentManagedVersion) {
    return {
      state: updateAvailable ? "update-available" : "installed",
      available: true,
      installed: true,
      updateAvailable,
      version: build.version,
      installedVersion: currentManagedVersion,
      assetName: build.assetName,
      executablePath: currentSettings.executablePath,
      installPath,
      reason: updateAvailable
        ? `Kun ${build.version} is available for managed install.`
        : null,
      hint: KUN_MANAGED_INSTALL_HINT,
    }
  }

  return {
    state: "available",
    available: true,
    installed: false,
    updateAvailable: false,
    version: build.version,
    installedVersion: currentManagedVersion,
    assetName: build.assetName,
    executablePath: currentSettings.executablePath,
    installPath,
    reason: `Kun ${build.version} is available for managed install.`,
    hint: KUN_MANAGED_INSTALL_HINT,
  }
}

function validateSha256(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Managed Kun build has an invalid SHA-256 allowlist entry.")
  }
  return normalized
}

async function fetchAllowlistedAsset(
  build: KunManagedInstallBuild,
  options: KunManagedInstallRunOptions,
): Promise<Buffer> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(build.assetUrl)
  if (!response.ok) {
    throw new Error(
      `Kun download failed with HTTP ${response.status}: ${response.statusText}`,
    )
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength !== build.sizeBytes) {
    throw new Error(
      `Kun download size mismatch: expected ${build.sizeBytes}, got ${bytes.byteLength}.`,
    )
  }
  const actualSha256 = createHash("sha256").update(bytes).digest("hex")
  if (actualSha256 !== validateSha256(build.sha256)) {
    throw new Error("Kun download checksum mismatch.")
  }
  return bytes
}

function validateArchiveEntryName(name: string): string {
  if (!name || name.includes("\0")) {
    throw new Error("Kun archive contains an invalid entry name.")
  }
  if (name.includes("\\")) {
    throw new Error(`Kun archive entry uses a backslash path: ${name}`)
  }
  if (name.startsWith("/") || /^[A-Za-z]:\//.test(name)) {
    throw new Error(`Kun archive entry is absolute: ${name}`)
  }
  if (name.split("/").includes("..")) {
    throw new Error(`Kun archive entry escapes the install root: ${name}`)
  }
  const normalized = normalize(name).replace(/\\/g, "/")
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith(`..${"/"}`) ||
    normalized.includes(`${"/"}..${"/"}`) ||
    normalized.endsWith(`${"/"}..`)
  ) {
    throw new Error(`Kun archive entry escapes the install root: ${name}`)
  }
  return normalized
}

function safeArchiveDestination(root: string, entryName: string): string {
  const normalized = validateArchiveEntryName(entryName)
  const destination = resolve(root, normalized)
  if (!isSameOrInside(destination, root)) {
    throw new Error(`Kun archive entry escapes the install root: ${entryName}`)
  }
  return destination
}

function findZipEndOfCentralDirectory(zip: Buffer): number {
  if (zip.length < 22) {
    throw new Error("Kun archive is not a supported zip file.")
  }
  const minOffset = Math.max(0, zip.length - 65_557)
  for (let offset = zip.length - 22; offset >= minOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset
    }
  }
  throw new Error("Kun archive is not a supported zip file.")
}

type ZipCentralEntry = {
  name: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
  externalAttributes: number
  directory: boolean
}

function readZipCentralDirectory(zip: Buffer): ZipCentralEntry[] {
  const eocdOffset = findZipEndOfCentralDirectory(zip)
  const entryCount = zip.readUInt16LE(eocdOffset + 10)
  const centralDirectorySize = zip.readUInt32LE(eocdOffset + 12)
  const centralDirectoryOffset = zip.readUInt32LE(eocdOffset + 16)
  if (
    centralDirectoryOffset < 0 ||
    centralDirectorySize < 0 ||
    centralDirectoryOffset + centralDirectorySize > zip.length
  ) {
    throw new Error("Kun archive central directory is invalid.")
  }

  const entries: ZipCentralEntry[] = []
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Kun archive central directory entry is invalid.")
    }
    const compressionMethod = zip.readUInt16LE(offset + 10)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const uncompressedSize = zip.readUInt32LE(offset + 24)
    const fileNameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const externalAttributes = zip.readUInt32LE(offset + 38)
    const localHeaderOffset = zip.readUInt32LE(offset + 42)
    const nameStart = offset + 46
    const nameEnd = nameStart + fileNameLength
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new Error("Kun archive uses unsupported zip64 entries.")
    }
    const name = zip.toString("utf8", nameStart, nameEnd)
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      externalAttributes,
      directory: name.endsWith("/"),
    })
    offset = nameEnd + extraLength + commentLength
  }
  return entries
}

function extractZipEntry(zip: Buffer, entry: ZipCentralEntry): Buffer {
  const localOffset = entry.localHeaderOffset
  if (zip.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Kun archive local entry is invalid: ${entry.name}`)
  }
  const fileNameLength = zip.readUInt16LE(localOffset + 26)
  const extraLength = zip.readUInt16LE(localOffset + 28)
  const dataStart = localOffset + 30 + fileNameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > zip.length) {
    throw new Error(`Kun archive entry is truncated: ${entry.name}`)
  }
  const compressed = zip.subarray(dataStart, dataEnd)
  const content =
    entry.compressionMethod === 0
      ? Buffer.from(compressed)
      : entry.compressionMethod === 8
        ? inflateRawSync(compressed)
        : null
  if (!content) {
    throw new Error(
      `Kun archive entry uses unsupported compression: ${entry.name}`,
    )
  }
  if (content.byteLength !== entry.uncompressedSize) {
    throw new Error(`Kun archive entry size mismatch: ${entry.name}`)
  }
  return content
}

export function extractKunZipArchiveForTest(zip: Buffer, destination: string) {
  extractKunZipArchive(zip, destination)
}

function extractKunZipArchive(zip: Buffer, destination: string): void {
  const entries = readZipCentralDirectory(zip)
  for (const entry of entries) {
    const unixMode = (entry.externalAttributes >>> 16) & 0xffff
    if ((unixMode & ZIP_UNIX_FILE_TYPE_MASK) === ZIP_UNIX_SYMLINK_MODE) {
      throw new Error(`Kun archive contains a symlink entry: ${entry.name}`)
    }
    const entryDestination = safeArchiveDestination(destination, entry.name)
    if (entry.directory) {
      mkdirSync(entryDestination, { recursive: true, mode: 0o755 })
      continue
    }
    const content = extractZipEntry(zip, entry)
    mkdirSync(dirname(entryDestination), { recursive: true, mode: 0o755 })
    writeFileSync(entryDestination, content, { mode: 0o644 })
  }
}

function ensureExecutableInsideInstallRoot(
  installPath: string,
  executableRelativePath: string,
): string {
  const executablePath = safeArchiveDestination(
    installPath,
    executableRelativePath,
  )
  if (!existsSync(executablePath)) {
    throw new Error("Kun managed install did not contain the expected binary.")
  }
  const stats = statSync(executablePath)
  if (!stats.isFile()) {
    throw new Error("Kun managed install expected binary is not a file.")
  }
  chmodSync(executablePath, 0o755)
  return executablePath
}

function replaceInstallDirectory(input: {
  stagingInstallPath: string
  finalInstallPath: string
}): void {
  const backupPath = `${input.finalInstallPath}.previous-${randomUUID()}`
  let movedExisting = false
  try {
    if (existsSync(input.finalInstallPath)) {
      renameSync(input.finalInstallPath, backupPath)
      movedExisting = true
    }
    renameSync(input.stagingInstallPath, input.finalInstallPath)
    if (movedExisting) {
      rmSync(backupPath, { recursive: true, force: true })
    }
  } catch (error) {
    if (movedExisting && !existsSync(input.finalInstallPath)) {
      try {
        renameSync(backupPath, input.finalInstallPath)
      } catch {
        // Keep the original error; restoration failure would be surfaced by
        // the next status check as a missing executable.
      }
    }
    throw error
  }
}

export async function installKunManagedBuild(
  options: KunManagedInstallRunOptions = {},
): Promise<KunManagedInstallResult> {
  const build = selectKunManagedInstallBuild(options)
  if (!build) {
    throw new Error(
      `No allowlisted Kun managed build for ${options.platform ?? process.platform}/${options.arch ?? process.arch}.`,
    )
  }
  const root = getKunManagedInstallRoot(options)
  if (!root) {
    throw new Error("Electron userData path is unavailable.")
  }
  const finalInstallPath = getKunManagedInstallPath(build, options)
  if (!finalInstallPath) {
    throw new Error("Kun managed install path is unavailable.")
  }

  mkdirSync(root, { recursive: true, mode: 0o700 })
  const operationPath = join(root, ".tmp", randomUUID())
  const downloadPath = join(operationPath, build.assetName)
  const stagingInstallPath = join(operationPath, "install")
  try {
    mkdirSync(operationPath, { recursive: true, mode: 0o700 })
    const bytes = await fetchAllowlistedAsset(build, options)
    writeFileSync(downloadPath, bytes, { mode: 0o600 })
    mkdirSync(stagingInstallPath, { recursive: true, mode: 0o755 })
    switch (build.archiveKind) {
      case "zip":
        extractKunZipArchive(bytes, stagingInstallPath)
        break
    }
    ensureExecutableInsideInstallRoot(
      stagingInstallPath,
      build.executableRelativePath,
    )
    replaceInstallDirectory({ stagingInstallPath, finalInstallPath })
    const finalExecutablePath = ensureExecutableInsideInstallRoot(
      finalInstallPath,
      build.executableRelativePath,
    )
    if (!isSameOrInside(finalExecutablePath, root)) {
      throw new Error("Kun managed executable resolved outside managed root.")
    }

    const current = readKunCliSettings(options)
    writeKunCliSettings(
      {
        executablePath: finalExecutablePath,
        configPath: current.configPath,
        shellApprovedExecutableHash: current.shellApprovedExecutableHash,
      },
      options,
    )
    return {
      ok: true,
      build,
      executablePath: finalExecutablePath,
      installPath: finalInstallPath,
      status: resolveKunManagedInstallStatus(options),
    }
  } catch (error) {
    throw new Error(sanitizeInstallError(error))
  } finally {
    rmSync(operationPath, { recursive: true, force: true })
  }
}
