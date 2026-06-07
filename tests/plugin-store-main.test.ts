import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginStoreCatalogEntry } from "../src/shared/plugin-store-pins"

let userDataDir = ""

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return userDataDir
    },
  },
}))

const storePins = await import("../src/main/lib/plugins/store-pins")
const reviewState = await import("../src/main/lib/plugins/update-review-state")
const { setElectronUserDataPathProviderForTest } = await import(
  "../src/main/lib/electron-app"
)

const COMMIT_A = "0123456789abcdef0123456789abcdef01234567"
const COMMIT_B = "abcdef0123456789abcdef0123456789abcdef01"

describe("main plugin store commit pin workflow", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-store-main-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
  })

  afterEach(async () => {
    setElectronUserDataPathProviderForTest(null)
    await rm(userDataDir, { recursive: true, force: true })
    userDataDir = ""
  })

  test("previews, approves, installs, updates, and records backup metadata", async () => {
    const packageA = await createPackage("store-package-a", {
      "package.json": "{\"name\":\"example\"}",
      "commands/review.md": "---\nname: Review\n---\n",
    })
    const hashA = await storePins.hashPluginStorePackageDirectory(packageA)
    await writeCatalog([catalogEntry({
      package: {
        sha256: hashA.sha256,
        sizeBytes: hashA.sizeBytes,
        localPath: packageA,
      },
    })])

    const preview = await storePins.previewPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
    })
    expect(preview.review.status).toBe("review-required")
    expect(preview.review.approvalStatus).toBe("missing")
    expect(preview.entry.package).not.toHaveProperty("localPath")

    const approval = await storePins.approveCurrentPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
      now: new Date("2026-06-02T00:00:00Z"),
    })
    expect(approval.approval.packageHash).toBe(hashA.sha256)

    const installed = await storePins.installOrUpdateApprovedPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
      now: new Date("2026-06-02T00:01:00Z"),
    })
    expect(installed.installed).toMatchObject({
      storeEntryId: "example.plugin",
      commit: COMMIT_A,
      packageHash: hashA.sha256,
      targetMode: "manifest-only",
    })
    expect(readFileSync(join(installed.targetPath, "package.json"), "utf-8")).toContain("example")
    expect(installed.backup).toBeUndefined()

    const packageB = await createPackage("store-package-b", {
      "package.json": "{\"name\":\"example\",\"version\":\"2\"}",
      "commands/review.md": "---\nname: Review v2\n---\n",
    })
    const hashB = await storePins.hashPluginStorePackageDirectory(packageB)
    await writeCatalog([catalogEntry({
      version: "2.0.0",
      source: {
        type: "git",
        repo: "example/plugins",
        commit: COMMIT_B,
        path: "plugins/example",
      },
      package: {
        sha256: hashB.sha256,
        sizeBytes: hashB.sizeBytes,
        localPath: packageB,
      },
    })])

    const updatePreview = await storePins.previewPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
    })
    expect(updatePreview.review.status).toBe("pin-changed")
    expect(updatePreview.review.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "version" }),
      expect.objectContaining({ field: "source.commit" }),
      expect.objectContaining({ field: "package.sha256" }),
    ]))

    await storePins.approveCurrentPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
      now: new Date("2026-06-02T00:02:00Z"),
    })
    const updated = await storePins.installOrUpdateApprovedPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
      now: new Date("2026-06-02T00:03:00Z"),
    })
    expect(updated.backup?.storeEntryId).toBe("example.plugin")
    expect(updated.backup?.previousCommit).toBe(COMMIT_A)
    expect(existsSync(updated.backup?.backupPath ?? "")).toBe(true)

    const snapshot = await reviewState.getPluginStoreStateSnapshot()
    expect(snapshot.installedPackages["example.plugin"].commit).toBe(COMMIT_B)
    expect(snapshot.backupRecords[0]).toMatchObject({
      storeEntryId: "example.plugin",
      previousCommit: COMMIT_A,
      previousPackageHash: hashA.sha256,
    })
  })

  test("requires a package hash and rejects mutable refs before approval", async () => {
    const packagePath = await createPackage("store-package-nohash", {
      "package.json": "{\"name\":\"example\"}",
    })
    await writeCatalog([catalogEntry({
      source: {
        type: "git",
        repo: "example/plugins",
        commit: "latest",
      },
      package: {
        localPath: packagePath,
      },
    })])

    const preview = await storePins.previewPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
      requirePackageHashForWrite: true,
    })
    expect(preview.review.status).toBe("blocked-missing-package-hash")
    expect(preview.review.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "immutable-commit-required" }),
      expect.objectContaining({ code: "missing-package-hash" }),
    ]))
    await expect(
      storePins.approveCurrentPluginStoreCandidate("example.plugin", { userDataPath: userDataDir }),
    ).rejects.toThrow("blocked review issues")
  })

  test("stale package contents and symlink escapes block install writes", async () => {
    const packagePath = await createPackage("store-package-stale", {
      "package.json": "{\"name\":\"example\"}",
    })
    const hash = await storePins.hashPluginStorePackageDirectory(packagePath)
    await writeCatalog([catalogEntry({
      package: {
        sha256: hash.sha256,
        sizeBytes: hash.sizeBytes,
        localPath: packagePath,
      },
    })])
    await storePins.approveCurrentPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
    })
    await writeFile(join(packagePath, "package.json"), "{\"name\":\"changed\"}", "utf-8")
    await expect(
      storePins.installOrUpdateApprovedPluginStoreCandidate("example.plugin", { userDataPath: userDataDir }),
    ).rejects.toThrow("blocked review issues")

    const symlinkPackage = await createPackage("store-package-symlink", {
      "package.json": "{\"name\":\"example\"}",
    })
    await symlink(join(userDataDir, "outside-secret"), join(symlinkPackage, "escape-link"))
    await writeCatalog([catalogEntry({
      package: {
        sha256: hash.sha256,
        localPath: symlinkPackage,
      },
    })])
    const preview = await storePins.previewPluginStoreCandidate("example.plugin", {
      userDataPath: userDataDir,
      requirePackageHashForWrite: true,
    })
    expect(preview.review.issues).toContainEqual(expect.objectContaining({
      code: "package-containment-failed",
    }))
  })
})

async function createPackage(
  prefix: string,
  files: Record<string, string>,
): Promise<string> {
  const packagePath = await mkdtemp(join(tmpdir(), `${prefix}-`))
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(packagePath, relativePath)
    await mkdir(join(filePath, ".."), { recursive: true })
    await writeFile(filePath, content, "utf-8")
  }
  return packagePath
}

function catalogEntry(overrides: Partial<PluginStoreCatalogEntry> = {}): PluginStoreCatalogEntry {
  return {
    schemaVersion: 1,
    id: overrides.id ?? "example.plugin",
    runtime: overrides.runtime ?? "claude",
    name: overrides.name ?? "Example Plugin",
    version: overrides.version ?? "1.0.0",
    source: overrides.source ?? {
      type: "git",
      repo: "example/plugins",
      commit: COMMIT_A,
      path: "plugins/example",
    },
    package: Object.prototype.hasOwnProperty.call(overrides, "package")
      ? overrides.package
      : undefined,
    targetMode: overrides.targetMode ?? "manifest-only",
    declaredPermissions: overrides.declaredPermissions ?? ["workspace.read"],
    declaredMcpServers: overrides.declaredMcpServers ?? [],
    controlledUi: overrides.controlledUi,
  }
}

async function writeCatalog(entries: PluginStoreCatalogEntry[]) {
  await writeFile(
    storePins.getPluginStoreCatalogPath(userDataDir),
    `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
    "utf-8",
  )
}
