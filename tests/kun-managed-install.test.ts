import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  readKunCliSettings,
  writeKunCliSettings,
} from "../src/main/lib/kun/kun-cli-settings"
import {
  approveKunShellExecutableHash,
  resolveKunCliSetupStatus,
} from "../src/main/lib/kun/kun-cli-status"
import {
  installKunManagedBuild,
  type KunManagedInstallBuild,
  resolveKunManagedInstallStatus,
} from "../src/main/lib/kun/kun-managed-install"

const tempRoots: string[] = []
const KUN_ENTRY = "Kun.app/Contents/MacOS/Kun"

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "locus-kun-managed-"))
  tempRoots.push(root)
  return root
}

function executableFile(root: string, name = "previous-kun"): string {
  const filePath = join(root, name)
  writeFileSync(filePath, "#!/bin/sh\necho previous kun\n", "utf8")
  chmodSync(filePath, 0o755)
  return filePath
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

function createStoredZip(
  entries: Array<{ name: string; content?: Buffer | string; mode?: number }>,
): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content ?? "")
    const isDirectory = entry.name.endsWith("/")
    const mode = entry.mode ?? (isDirectory ? 0o040755 : 0o100644)
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      name,
    ])
    localParts.push(localHeader, content)

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(0x031e),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(mode << 16),
      uint32(offset),
      name,
    ])
    centralParts.push(centralHeader)
    offset += localHeader.length + content.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  return Buffer.concat([
    ...localParts,
    centralDirectory,
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ])
}

function managedBuildForZip(
  zip: Buffer,
  version = "0.1.0",
): KunManagedInstallBuild {
  return {
    version,
    platform: "darwin",
    arch: "arm64",
    assetUrl: `https://example.invalid/kun-${version}.zip`,
    assetName: `kun-${version}.zip`,
    sha256: createHash("sha256").update(zip).digest("hex"),
    sizeBytes: zip.length,
    archiveKind: "zip",
    executableRelativePath: KUN_ENTRY,
  }
}

function fetchZip(
  expectedUrl: string,
  zip: Buffer,
): NonNullable<Parameters<typeof installKunManagedBuild>[0]>["fetchImpl"] {
  return async (url) => {
    expect(url).toBe(expectedUrl)
    return new Response(zip, {
      status: 200,
      headers: { "content-length": String(zip.length) },
    })
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("Kun managed install", () => {
  test("installs an allowlisted zip into the app-managed runtime directory", async () => {
    const userDataPath = tempRoot()
    const zip = createStoredZip([
      {
        name: KUN_ENTRY,
        content: "#!/bin/sh\necho managed kun\n",
      },
    ])
    const build = managedBuildForZip(zip)

    const result = await installKunManagedBuild({
      userDataPath,
      platform: "darwin",
      arch: "arm64",
      builds: [build],
      fetchImpl: fetchZip(build.assetUrl, zip),
    })

    const expectedExecutablePath = join(
      userDataPath,
      "runtimes",
      "kun",
      build.version,
      KUN_ENTRY,
    )
    expect(result.executablePath).toBe(expectedExecutablePath)
    expect(existsSync(expectedExecutablePath)).toBe(true)
    expect(statSync(expectedExecutablePath).mode & 0o111).not.toBe(0)
    expect(readKunCliSettings({ userDataPath })).toMatchObject({
      executablePath: expectedExecutablePath,
      shellApprovedExecutableHash: null,
    })
    expect(
      resolveKunManagedInstallStatus({
        userDataPath,
        platform: "darwin",
        arch: "arm64",
        builds: [build],
      }),
    ).toMatchObject({
      state: "installed",
      installed: true,
      updateAvailable: false,
      installedVersion: build.version,
      executablePath: expectedExecutablePath,
    })
  })

  test("checksum mismatch fails closed and leaves previous executable settings untouched", async () => {
    const userDataPath = tempRoot()
    const previousRoot = tempRoot()
    const previousExecutable = executableFile(previousRoot)
    writeKunCliSettings(
      {
        executablePath: previousExecutable,
        configPath: null,
        shellApprovedExecutableHash: "a".repeat(64),
      },
      { userDataPath },
    )

    const zip = createStoredZip([
      {
        name: KUN_ENTRY,
        content: "#!/bin/sh\necho managed kun\n",
      },
    ])
    const build = {
      ...managedBuildForZip(zip),
      sha256: "b".repeat(64),
    }

    await expect(
      installKunManagedBuild({
        userDataPath,
        platform: "darwin",
        arch: "arm64",
        builds: [build],
        fetchImpl: fetchZip(build.assetUrl, zip),
      }),
    ).rejects.toThrow("checksum mismatch")
    expect(readKunCliSettings({ userDataPath })).toMatchObject({
      executablePath: previousExecutable,
      shellApprovedExecutableHash: "a".repeat(64),
    })
    const tmpRoot = join(userDataPath, "runtimes", "kun", ".tmp")
    expect(existsSync(tmpRoot) ? readdirSync(tmpRoot) : []).toEqual([])
  })

  test("rejects zip entries that traverse or use absolute paths", async () => {
    const userDataPath = tempRoot()
    const evilParent = dirname(userDataPath)
    const absoluteOutside = join(tempRoot(), "absolute-evil")
    const cases = [
      { name: "../evil", outside: join(evilParent, "evil") },
      { name: absoluteOutside, outside: absoluteOutside },
    ]

    for (const entry of cases) {
      const zip = createStoredZip([
        {
          name: entry.name,
          content: "pwned",
        },
        {
          name: KUN_ENTRY,
          content: "#!/bin/sh\necho managed kun\n",
        },
      ])
      const build = managedBuildForZip(zip, `0.1.${cases.indexOf(entry) + 1}`)
      await expect(
        installKunManagedBuild({
          userDataPath,
          platform: "darwin",
          arch: "arm64",
          builds: [build],
          fetchImpl: fetchZip(build.assetUrl, zip),
        }),
      ).rejects.toThrow(/archive entry|escapes|absolute/)
      expect(existsSync(entry.outside)).toBe(false)
    }
    expect(readKunCliSettings({ userDataPath }).executablePath).toBeNull()
  })

  test("managed update preserves prior shell hash so a new binary is hash-mismatched", async () => {
    const userDataPath = tempRoot()
    const firstZip = createStoredZip([
      {
        name: KUN_ENTRY,
        content: "#!/bin/sh\necho managed kun one\n",
      },
    ])
    const firstBuild = managedBuildForZip(firstZip, "0.2.15")
    await installKunManagedBuild({
      userDataPath,
      platform: "darwin",
      arch: "arm64",
      builds: [firstBuild],
      fetchImpl: fetchZip(firstBuild.assetUrl, firstZip),
    })

    const probeVersion = async () => ({
      ok: true as const,
      value: "kun managed test",
      error: null,
    })
    const approved = await approveKunShellExecutableHash({
      userDataPath,
      probeVersion,
    })
    const approvedHash = approved.status.shell.approvedHash
    expect(approvedHash).toMatch(/^[a-f0-9]{64}$/)

    const secondZip = createStoredZip([
      {
        name: KUN_ENTRY,
        content: "#!/bin/sh\necho managed kun two\n",
      },
    ])
    const secondBuild = managedBuildForZip(secondZip, "0.2.16")
    await installKunManagedBuild({
      userDataPath,
      platform: "darwin",
      arch: "arm64",
      builds: [secondBuild],
      fetchImpl: fetchZip(secondBuild.assetUrl, secondZip),
    })

    const resolved = await resolveKunCliSetupStatus({
      userDataPath,
      probeVersion,
    })
    expect(resolved.status.source).toBe("managed")
    expect(resolved.status.managedInstall).toMatchObject({
      state: "installed",
      installedVersion: "0.2.16",
    })
    expect(resolved.status.shell).toMatchObject({
      approved: false,
      approvedHash,
      reason: "hash-mismatch",
    })
    expect(resolved.status.shell.currentHash).not.toBe(approvedHash)
  })

  test("renderer routes and Settings UI do not accept managed install source injection or imply shell support", () => {
    const runtimeRouter = readFileSync(
      "src/main/lib/trpc/routers/agent-runtime.ts",
      "utf8",
    )
    const settingsTab = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx",
      "utf8",
    )

    expect(runtimeRouter).toContain(
      "installKunManagedBuild: publicProcedure.mutation",
    )
    expect(runtimeRouter).toContain(
      "updateKunManagedBuild: publicProcedure.mutation",
    )
    expect(runtimeRouter).not.toMatch(
      /installKunManagedBuild:[\s\S]{0,160}\.input\(/,
    )
    expect(runtimeRouter).not.toMatch(
      /updateKunManagedBuild:[\s\S]{0,160}\.input\(/,
    )
    expect(runtimeRouter).not.toContain("downloadUrl")
    expect(runtimeRouter).not.toContain("destinationPath")
    expect(runtimeRouter).not.toContain("archivePath")
    expect(settingsTab).toContain("Install Kun")
    expect(settingsTab).toContain("Update Kun")
    expect(settingsTab).toContain("Config needed")
    expect(settingsTab).toContain("Hash mismatch")
    expect(settingsTab).toContain("Approve current build")
    expect(settingsTab).not.toContain("shell supported")
  })
})
