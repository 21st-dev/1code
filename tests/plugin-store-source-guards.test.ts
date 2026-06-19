import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("plugin store source guards", () => {
  const pluginsRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/plugins.ts"),
    "utf8",
  )
  const storePinsSource = readFileSync(
    join(process.cwd(), "src/main/lib/plugins/store-pins.ts"),
    "utf8",
  )
  const sharedStorePinsSource = readFileSync(
    join(process.cwd(), "src/shared/plugin-store-pins.ts"),
    "utf8",
  )

  test("store router accepts only entry ids, not renderer-provided candidate metadata", () => {
    const storeRouterBlock = pluginsRouterSource.slice(
      pluginsRouterSource.indexOf("storeCatalog: publicProcedure"),
      pluginsRouterSource.indexOf("loadDeveloperPlugin: publicProcedure"),
    )

    expect(storeRouterBlock).toContain("storeEntryId: z.string().min(1)")
    expect(storeRouterBlock).toContain("previewPluginStoreCandidate(input.storeEntryId)")
    expect(storeRouterBlock).toContain("approveCurrentPluginStoreCandidate(input.storeEntryId)")
    expect(storeRouterBlock).toMatch(
      /installOrUpdateApprovedPluginStoreCandidate\(\s*input\.storeEntryId,\s*\)/,
    )
    expect(storeRouterBlock).not.toContain("candidateFingerprint:")
    expect(storeRouterBlock).not.toContain("packageHash:")
    expect(storeRouterBlock).not.toContain("localPath:")
    expect(storeRouterBlock).not.toContain("document:")
    expect(storeRouterBlock).not.toContain("sourceCommit:")
  })

  test("store preview, approval, and install recompute in main without executing plugin code", () => {
    expect(storePinsSource).toContain("hashPluginStoreCandidateReviewDocument")
    expect(storePinsSource).toContain("buildPluginStoreCandidateReviewDocument(entry)")
    expect(storePinsSource).toContain("requirePackageHashForWrite: true")
    expect(storePinsSource).toContain("hashPluginStorePackageDirectory")
    expect(storePinsSource).toContain("fs.lstat")
    expect(storePinsSource).toContain("stat.isSymbolicLink()")
    expect(storePinsSource).toContain("stat.nlink > 1")
    expect(storePinsSource).toContain("assertPathInside")
    expect(storePinsSource).not.toContain("scanPluginReviewDocument")
    expect(storePinsSource).not.toContain("loadDeveloperTrustedPlugin")
    expect(storePinsSource).not.toContain("grantControlledUiPermission")
    expect(storePinsSource).not.toContain("setControlledUiSettingValue")
    expect(storePinsSource).not.toContain("approvedPluginMcpServers")
    expect(storePinsSource).not.toContain("child_process")
    expect(storePinsSource).not.toContain("new Function")
    expect(storePinsSource).not.toContain("require(")
    expect(storePinsSource).not.toContain("import(")
  })

  test("store policy blocks mutable refs and remote developer trusted code", () => {
    expect(sharedStorePinsSource).toContain("immutable-commit-required")
    expect(sharedStorePinsSource).toContain("Mutable refs such as latest, main, branches")
    expect(sharedStorePinsSource).toContain("remote-developer-trusted-code")
    expect(sharedStorePinsSource).toContain("Remote store entries cannot request developer trusted-code mode.")
    expect(sharedStorePinsSource).toContain("missing-package-hash")
    expect(sharedStorePinsSource).toContain("package-containment-failed")
  })
})
