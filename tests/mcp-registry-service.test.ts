import { describe, expect, test } from "bun:test"
import type {
  OfficialMcpRegistryProvider,
  OfficialMcpRegistryServerListResponse,
  OfficialMcpRegistryServerResponse,
} from "../src/main/lib/mcp-registry/official-provider"
import { createMcpRegistryService } from "../src/main/lib/mcp-registry/service"

function listResponse(): OfficialMcpRegistryServerListResponse {
  return {
    servers: [
      {
        server: {
          name: "io.github.example/listed",
          version: "1.0.0",
          packages: [
            {
              registryType: "npm",
              identifier: "@example/listed",
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
      name: "io.github.example/detail",
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

function createProviderStub(): {
  provider: OfficialMcpRegistryProvider
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    provider: {
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
    },
  }
}

describe("MCP registry service", () => {
  test("normalizes list and search results from the provider", async () => {
    const { provider, calls } = createProviderStub()
    const service = createMcpRegistryService({ provider })

    await expect(service.listEntries({ limit: 10 })).resolves.toMatchObject({
      entries: [
        {
          entryId: "io.github.example/listed",
          installTargets: [
            {
              id: "package:@example/listed:0",
              commandTemplate: "npx",
            },
          ],
        },
      ],
      metadata: { nextCursor: "next", count: 1 },
    })
    await expect(
      service.searchEntries({ search: "listed" }),
    ).resolves.toMatchObject({
      entries: [{ entryId: "io.github.example/listed" }],
    })
    expect(calls).toEqual(["list:10:", "search:listed"])
  })

  test("returns detail previews and can preview a selected target", async () => {
    const { provider, calls } = createProviderStub()
    const service = createMcpRegistryService({ provider })

    const detail = await service.getEntryDetail({
      serverName: "io.github.example/detail",
    })
    expect(detail).toMatchObject({
      entry: {
        entryId: "io.github.example/detail",
        declaredRuntimeSupport: ["claude-code"],
      },
      previews: [
        {
          kind: "mcp-registry-install-preview",
          targetId: "remote:streamable_http:0",
          runtimeInstallability: [
            {
              runtime: "claude-code",
              status: "installable-config",
            },
            {
              runtime: "codex",
              status: "codex-deferred",
            },
          ],
        },
      ],
    })

    await expect(
      service.previewEntryInstall({
        serverName: "io.github.example/detail",
        targetId: "remote:streamable_http:0",
      }),
    ).resolves.toMatchObject({
      kind: "mcp-registry-install-preview",
      targetId: "remote:streamable_http:0",
    })
    await expect(
      service.previewEntryInstall({
        serverName: "io.github.example/detail",
        targetId: "missing",
      }),
    ).rejects.toThrow("install target was not found")
    expect(calls).toEqual([
      "detail:io.github.example/detail:latest",
      "detail:io.github.example/detail:latest",
      "detail:io.github.example/detail:latest",
    ])
  })

  test("installs setup-free registry targets through the injected Claude writer", async () => {
    const { provider, calls } = createProviderStub()
    const writes: unknown[] = []
    const service = createMcpRegistryService({
      provider,
      async writeClaudeConfig(input) {
        writes.push(input)
        return { success: true, name: input.name.trim() }
      },
    })

    await expect(
      service.installEntry({
        serverName: "io.github.example/detail",
        targetId: "remote:streamable_http:0",
        runtime: "claude-code",
        scope: "global",
        installName: "registry_remote",
      }),
    ).resolves.toMatchObject({
      success: true,
      runtime: "claude-code",
      serverName: "registry_remote",
      status: "installed-unverified",
      entryFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      configFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      name: "registry_remote",
      scope: "global",
      config: {
        url: "https://mcp.example.com/mcp",
        transportType: "streamable_http",
        _locusMcpRegistry: {
          providerId: "official-mcp-registry",
          entryId: "io.github.example/detail",
          targetId: "remote:streamable_http:0",
          runtime: "claude-code",
          status: "installed-unverified",
          entryFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          configFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          installedAt: expect.any(String),
        },
      },
    })

    await expect(
      service.installEntry({
        serverName: "io.github.example/detail",
        targetId: "remote:streamable_http:0",
        runtime: "codex",
        scope: "global",
      }),
    ).rejects.toThrow("Codex MCP registry install is deferred")

    expect(calls).toEqual([
      "detail:io.github.example/detail:latest",
      "detail:io.github.example/detail:latest",
    ])
  })
})
