import { describe, expect, test } from "bun:test"
import {
  buildPluginStoreCandidateApproval,
  buildPluginStoreCandidateReview,
  buildPluginStoreCandidateReviewDocument,
  buildPluginStoreSourcePins,
  diffPluginStoreCandidateDocuments,
  getPluginStoreApprovalStatus,
  isImmutableGitCommitPin,
  isSafeRelativePath,
  isSha256PackageHash,
  validatePluginStoreCatalogEntry,
  type PluginStoreCatalogEntry,
  type PluginStoreInstalledPackageRecord,
} from "../src/shared/plugin-store-pins"

const COMMIT_A = "0123456789abcdef0123456789abcdef01234567"
const COMMIT_B = "abcdef0123456789abcdef0123456789abcdef01"
const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)

function catalogEntry(overrides: Partial<PluginStoreCatalogEntry> = {}): PluginStoreCatalogEntry {
  return {
    schemaVersion: 1,
    id: overrides.id ?? "example.plugin",
    runtime: overrides.runtime ?? "claude",
    name: overrides.name ?? "Example Plugin",
    version: overrides.version ?? "1.2.3",
    source: overrides.source ?? {
      type: "git",
      repo: "example/plugins",
      commit: COMMIT_A,
      path: "plugins/example",
    },
    package: Object.prototype.hasOwnProperty.call(overrides, "package")
      ? overrides.package
      : {
          sha256: HASH_A,
          sizeBytes: 12345,
        },
    targetMode: overrides.targetMode ?? "manifest-only",
    declaredPermissions: overrides.declaredPermissions ?? ["workspace.read"],
    declaredMcpServers: overrides.declaredMcpServers ?? ["context"],
    controlledUi: overrides.controlledUi,
  }
}

describe("plugin store commit pins", () => {
  test("accepts full commit pins and sha256 package hashes", () => {
    expect(isImmutableGitCommitPin(COMMIT_A)).toBe(true)
    expect(isImmutableGitCommitPin("main")).toBe(false)
    expect(isImmutableGitCommitPin("latest")).toBe(false)
    expect(isSha256PackageHash(HASH_A)).toBe(true)
    expect(isSha256PackageHash("not-a-hash")).toBe(false)
    expect(isSafeRelativePath("plugins/example")).toBe(true)
    expect(isSafeRelativePath("../escape")).toBe(false)
    expect(isSafeRelativePath("/absolute")).toBe(false)
  })

  test("builds normalized candidate review documents and source pins", () => {
    const entry = catalogEntry({
      declaredPermissions: ["workspace.write", "workspace.read"],
      declaredMcpServers: ["zeta", "context"],
    })
    const document = buildPluginStoreCandidateReviewDocument(entry)

    expect(document).toMatchObject({
      schemaVersion: 1,
      storeEntryId: "example.plugin",
      source: {
        repo: "example/plugins",
        commit: COMMIT_A,
        path: "plugins/example",
      },
      package: {
        sha256: HASH_A,
        sizeBytes: 12345,
      },
      targetMode: "manifest-only",
      declaredPermissions: ["workspace.read", "workspace.write"],
      declaredMcpServers: ["context", "zeta"],
    })
    expect(buildPluginStoreSourcePins(entry)).toEqual([
      {
        kind: "store-git-commit",
        label: "Store reviewed commit",
        value: COMMIT_A,
        repo: "example/plugins",
        path: "plugins/example",
      },
      {
        kind: "store-package-sha256",
        label: "Store package sha256",
        value: HASH_A,
        repo: "example/plugins",
        path: "plugins/example",
      },
    ])
  })

  test("rejects mutable refs, bad hashes, traversal, missing write hashes, and remote trusted code", () => {
    const issues = validatePluginStoreCatalogEntry(catalogEntry({
      source: {
        type: "git",
        repo: "example/plugins",
        commit: "latest",
        path: "../escape",
      },
      package: {
        sha256: "bad",
      },
      targetMode: "developer-trusted-code",
    }), { requirePackageHashForWrite: true })

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "immutable-commit-required", field: "source.commit" }),
      expect.objectContaining({ code: "invalid-source-path", field: "source.path" }),
      expect.objectContaining({ code: "invalid-package-hash", field: "package.sha256" }),
      expect.objectContaining({ code: "remote-developer-trusted-code", field: "targetMode" }),
    ]))

    const missingHashIssues = validatePluginStoreCatalogEntry(catalogEntry({
      package: undefined,
    }), { requirePackageHashForWrite: true })
    expect(missingHashIssues).toContainEqual(expect.objectContaining({
      code: "missing-package-hash",
      field: "package.sha256",
    }))
  })

  test("diffs hash, target mode, MCP, permission, and controlled UI changes", () => {
    const previous = buildPluginStoreCandidateReviewDocument(catalogEntry())
    const current = buildPluginStoreCandidateReviewDocument(catalogEntry({
      version: "1.2.4",
      source: {
        type: "git",
        repo: "example/plugins",
        commit: COMMIT_B,
        path: "plugins/example",
      },
      package: {
        sha256: HASH_B,
        sizeBytes: 456,
      },
      targetMode: "controlled-ui",
      declaredPermissions: ["workspace.read", "workspace.write"],
      declaredMcpServers: ["context", "planner"],
      controlledUi: {
        manifestPresent: true,
        surfaces: [{
          id: "settings",
          type: "settings-section",
          title: "Settings",
          fieldIds: ["mode"],
        }],
        diagnostics: [],
        ignoredUnknownFields: [],
      },
    }))

    expect(diffPluginStoreCandidateDocuments(previous, current)).toEqual([
      { field: "version", previous: "1.2.3", current: "1.2.4" },
      { field: "source.commit", previous: COMMIT_A, current: COMMIT_B },
      { field: "package.sha256", previous: HASH_A, current: HASH_B },
      { field: "package.sizeBytes", previous: "12345", current: "456" },
      { field: "targetMode", previous: "manifest-only", current: "controlled-ui" },
      {
        field: "declaredPermissions",
        previous: "workspace.read",
        current: "workspace.read, workspace.write",
      },
      {
        field: "declaredMcpServers",
        previous: "context",
        current: "context, planner",
      },
      expect.objectContaining({ field: "controlledUi" }),
    ])
  })

  test("binds approval to exact commit, package hash, and candidate fingerprint", () => {
    const document = buildPluginStoreCandidateReviewDocument(catalogEntry())
    const approval = buildPluginStoreCandidateApproval({
      document,
      candidateFingerprint: "fingerprint-a",
      approvedAt: "2026-06-02T00:00:00.000Z",
    })

    expect(getPluginStoreApprovalStatus(approval, {
      document,
      candidateFingerprint: "fingerprint-a",
    })).toBe("current")
    expect(getPluginStoreApprovalStatus(approval, {
      document: buildPluginStoreCandidateReviewDocument(catalogEntry({
        source: {
          type: "git",
          repo: "example/plugins",
          commit: COMMIT_B,
          path: "plugins/example",
        },
      })),
      candidateFingerprint: "fingerprint-a",
    })).toBe("stale")
    expect(getPluginStoreApprovalStatus(approval, {
      document: buildPluginStoreCandidateReviewDocument(catalogEntry({
        package: { sha256: HASH_B },
      })),
      candidateFingerprint: "fingerprint-a",
    })).toBe("stale")
    expect(getPluginStoreApprovalStatus(approval, {
      document,
      candidateFingerprint: "fingerprint-b",
    })).toBe("stale")
  })

  test("classifies blocked and stale candidate statuses", () => {
    const entry = catalogEntry()
    const document = buildPluginStoreCandidateReviewDocument(entry)
    const installed: PluginStoreInstalledPackageRecord = {
      schemaVersion: 1,
      pluginReviewKey: "claude:example.plugin",
      storeEntryId: "example.plugin",
      commit: COMMIT_A,
      packageHash: HASH_A,
      candidateFingerprint: "fingerprint-a",
      installedAt: "2026-06-02T00:00:00.000Z",
      targetMode: "manifest-only",
    }
    const approval = buildPluginStoreCandidateApproval({
      document,
      candidateFingerprint: "fingerprint-a",
    })

    expect(buildPluginStoreCandidateReview({
      entry,
      approval,
      installed,
      candidateFingerprint: "fingerprint-a",
    }).status).toBe("installed-current")
    expect(buildPluginStoreCandidateReview({
      entry,
      approval,
      candidateFingerprint: "fingerprint-a",
    }).status).toBe("not-installed")
    expect(buildPluginStoreCandidateReview({
      entry: catalogEntry({ source: { type: "git", repo: "example/plugins", commit: "main" } }),
      candidateFingerprint: "fingerprint-a",
    }).status).toBe("blocked-invalid-pin")
    expect(buildPluginStoreCandidateReview({
      entry: catalogEntry({ package: undefined }),
      candidateFingerprint: "fingerprint-a",
      requirePackageHashForWrite: true,
    }).status).toBe("blocked-missing-package-hash")
    expect(buildPluginStoreCandidateReview({
      entry: catalogEntry({ targetMode: "developer-trusted-code" }),
      candidateFingerprint: "fingerprint-a",
    }).status).toBe("blocked-target-mode")
    expect(buildPluginStoreCandidateReview({
      entry: catalogEntry({
        source: {
          type: "git",
          repo: "example/plugins",
          commit: COMMIT_B,
          path: "plugins/example",
        },
      }),
      installed,
      approval,
      candidateFingerprint: "fingerprint-a",
    }).status).toBe("pin-changed")
    expect(buildPluginStoreCandidateReview({
      entry: catalogEntry({ package: { sha256: HASH_B } }),
      installed,
      approval,
      candidateFingerprint: "fingerprint-a",
    }).status).toBe("package-hash-changed")
  })
})
