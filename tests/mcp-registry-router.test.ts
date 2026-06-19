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
  const router = createMcpRegistryRouter(createMcpRegistryService({ provider }))
  return {
    calls,
    caller: router.createCaller({ getWindow: () => null }),
  }
}

describe("MCP registry tRPC router", () => {
  test("exposes browse, search, detail, and redacted preview without install mutation", async () => {
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
        { runtime: "codex", status: "codex-deferred" },
      ],
    })

    expect(calls).toEqual([
      "list:10:",
      "search:router",
      "detail:io.github.example/router-detail:latest",
      "detail:io.github.example/router-detail:latest",
    ])
  })

  test("keeps the registry router browse-only at this slice", () => {
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
