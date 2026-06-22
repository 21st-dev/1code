import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import type {
  OfficialMcpRegistryProvider,
  OfficialMcpRegistryServerListResponse,
  OfficialMcpRegistryServerResponse,
} from "../src/main/lib/mcp-registry/official-provider"
import { createMcpRegistryService } from "../src/main/lib/mcp-registry/service"
import { createMcpRegistryRouter } from "../src/main/lib/trpc/routers/mcp-registry"

function listResponse(): OfficialMcpRegistryServerListResponse {
  return {
    servers: [
      {
        server: {
          name: "io.github.example/router-listed",
          version: "1.0.0",
          packages: [
            {
              registryType: "npm",
              identifier: "@example/router-listed",
              runtimeHint: "npx",
              transport: { type: "stdio" },
            },
          ],
        },
      },
    ],
    metadata: { nextCursor: "next", count: 1 },
  }
}

function detailResponse(): OfficialMcpRegistryServerResponse {
  return {
    server: {
      name: "io.github.example/router-detail",
      version: "1.0.0",
      compatibility: { runtimes: ["claude-code"] },
      remotes: [
        {
          type: "streamable-http",
          url: "https://mcp.example.com/mcp",
        },
      ],
    },
  }
}

function createCallerStub() {
  const calls: string[] = []
  const writes: unknown[] = []
  const checks: unknown[] = []
  const provider: OfficialMcpRegistryProvider = {
    providerId: "official-mcp-registry",
    async listServers(input) {
      calls.push(`list:${input?.limit ?? ""}:${input?.search ?? ""}`)
      return listResponse()
    },
    async searchServers(input) {
      calls.push(`search:${input.search}`)
      return listResponse()
    },
    async getServerDetail(input) {
      calls.push(`detail:${input.serverName}:${input.version ?? "latest"}`)
      return detailResponse()
    },
  }
  const router = createMcpRegistryRouter(
    createMcpRegistryService({
      provider,
      resolveCodexRuntimeAuthenticated: () => true,
      async writeClaudeConfig(input) {
        writes.push(input)
        return { success: true, name: input.name.trim() }
      },
    }),
    {
      async checkInstalled(input) {
        checks.push(input)
        if (input.runtime !== "claude-code") {
          throw new Error("Codex MCP registry check is deferred.")
        }
        return {
          success: true,
          runtime: "claude-code",
          serverName: input.serverName,
          status: "ready-to-verify",
          toolCount: 1,
          toolNames: ["router_tool"],
        }
      },
    },
  )
  return {
    calls,
    writes,
    checks,
    caller: router.createCaller({ getWindow: () => null }),
  }
}

describe("MCP registry tRPC router", () => {
  test("exposes browse, search, detail, and redacted preview", async () => {
    const { caller, calls } = createCallerStub()

    await expect(caller.list({ limit: 10 })).resolves.toMatchObject({
      entries: [{ entryId: "io.github.example/router-listed" }],
      metadata: { nextCursor: "next", count: 1 },
    })
    await expect(caller.list({ search: " router " })).resolves.toMatchObject({
      entries: [{ entryId: "io.github.example/router-listed" }],
    })
    await expect(
      caller.detail({ serverName: "io.github.example/router-detail" }),
    ).resolves.toMatchObject({
      entry: { entryId: "io.github.example/router-detail" },
      previews: [{ targetId: "remote:streamable_http:0" }],
    })
    await expect(
      caller.previewInstall({
        serverName: "io.github.example/router-detail",
        targetId: "remote:streamable_http:0",
      }),
    ).resolves.toMatchObject({
      kind: "mcp-registry-install-preview",
      targetId: "remote:streamable_http:0",
      runtimeInstallability: [
        { runtime: "claude-code", status: "installable-config" },
        { runtime: "codex", status: "installable-config" },
      ],
    })

    expect(calls).toEqual([
      "list:10:",
      "search:router",
      "detail:io.github.example/router-detail:latest",
      "detail:io.github.example/router-detail:latest",
    ])
  })

  test("exposes explicit install mutation through the registry service", async () => {
    const { caller, calls, writes } = createCallerStub()

    await expect(
      caller.install({
        serverName: "io.github.example/router-detail",
        targetId: "remote:streamable_http:0",
        runtime: "claude-code",
        scope: "global",
        installName: "router_registry",
      }),
    ).resolves.toMatchObject({
      success: true,
      runtime: "claude-code",
      serverName: "router_registry",
      status: "installed-unverified",
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      name: "router_registry",
      scope: "global",
      config: {
        url: "https://mcp.example.com/mcp",
        transportType: "streamable_http",
        _locusMcpRegistry: {
          runtime: "claude-code",
          status: "installed-unverified",
        },
      },
    })
    expect(calls).toEqual(["detail:io.github.example/router-detail:latest"])
  })

  test("exposes explicit connect/list check without Codex fake support", async () => {
    const { caller, checks } = createCallerStub()

    await expect(
      caller.checkInstalled({
        runtime: "claude-code",
        serverName: "router_registry",
        scope: "global",
      }),
    ).resolves.toMatchObject({
      success: true,
      runtime: "claude-code",
      serverName: "router_registry",
      status: "ready-to-verify",
      toolNames: ["router_tool"],
    })

    await expect(
      caller.checkInstalled({
        runtime: "codex",
        serverName: "router_registry",
        scope: "global",
      }),
    ).rejects.toThrow("Codex MCP registry check is deferred")

    expect(checks).toEqual([
      {
        runtime: "claude-code",
        serverName: "router_registry",
        scope: "global",
      },
      {
        runtime: "codex",
        serverName: "router_registry",
        scope: "global",
      },
    ])
  })

  test("keeps registry writes out of route-local runtime helpers", () => {
    const source = readFileSync(
      "src/main/lib/trpc/routers/mcp-registry.ts",
      "utf8",
    )
    expect(source).not.toContain("addMcpServer")
    expect(source).not.toContain("removeMcpServer")
    expect(source).not.toContain("startMcpOAuth")
    expect(source).not.toContain("logoutMcpServer")
    expect(source).not.toMatch(/from ["']node:child_process["']/)
    expect(source).not.toMatch(/\bspawn\s*\(/)
    expect(source).not.toMatch(/\bexecFile\s*\(/)
    expect(source).not.toMatch(/\bexec\s*\(/)
  })
})
