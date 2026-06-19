import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("runtime plugin write router guards", () => {
  const pluginsRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/plugins.ts"),
    "utf8",
  )
  const runtimeWriteSource = readFileSync(
    join(process.cwd(), "src/main/lib/plugins/runtime-marketplace-actions.ts"),
    "utf8",
  )

  test("router accepts semantic action targets instead of renderer-provided commands", () => {
    const routerBlock = pluginsRouterSource.slice(
      pluginsRouterSource.indexOf("const runtimePluginWriteActionRequestSchema"),
      pluginsRouterSource.indexOf("previewStoreCandidate: publicProcedure"),
    )

    expect(routerBlock).toContain("previewRuntimePluginWriteAction")
    expect(routerBlock).toContain("executeRuntimePluginWriteAction")
    expect(routerBlock).toContain("runtime: z.enum([\"claude\", \"codex\"])")
    expect(routerBlock).toContain("action: z.enum(runtimePluginWriteActionIds)")
    expect(routerBlock).toContain("pluginId: z.string().optional()")
    expect(routerBlock).toContain("marketplace: z.string().optional()")
    expect(routerBlock).toContain("source: z.string().optional()")
    expect(routerBlock).toContain("scope: z.enum(runtimePluginWriteScopes).optional()")
    expect(routerBlock.match(/\.strict\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(routerBlock).not.toContain("command:")
    expect(routerBlock).not.toContain("args:")
    expect(routerBlock).not.toContain("cwd:")
    expect(routerBlock).not.toContain("env:")
    expect(routerBlock).not.toContain("executable")
    expect(routerBlock).not.toContain("raw")
  })

  test("runtime write adapter owns allowlisted argv, confirmation, and execFile safety", () => {
    expect(runtimeWriteSource).toContain("buildRuntimePluginWriteCommand")
    expect(runtimeWriteSource).toContain("pendingRuntimePluginWritePreviews")
    expect(runtimeWriteSource).toContain("operationFingerprint")
    expect(runtimeWriteSource).toContain("confirmationToken")
    expect(runtimeWriteSource).toContain("targetConfirmation")
    expect(runtimeWriteSource).toContain("resolveBundledRuntimeCommandPath")
    expect(runtimeWriteSource).toContain("execFileAsync")
    expect(runtimeWriteSource).toContain("shell: false")
    expect(runtimeWriteSource).toContain("windowsHide: true")
    expect(runtimeWriteSource).toContain("buildRuntimePluginWriteCommandEnv")
    expect(runtimeWriteSource).toContain("timingSafeEqual")
    expect(runtimeWriteSource).toContain("redactRuntimeMarketplaceText")
    expect(runtimeWriteSource).not.toContain("shell: true")
    expect(runtimeWriteSource).not.toContain("\"--all\"")
    expect(runtimeWriteSource).not.toContain("\"--prune\"")
    expect(runtimeWriteSource).not.toContain("\"--config\"")
    expect(runtimeWriteSource).not.toContain("disable\", \"--all")
  })
})
