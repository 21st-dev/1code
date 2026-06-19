import { describe, expect, test } from "bun:test"
import {
  createOfficialMcpRegistryProvider,
  type McpRegistryFetch,
  OFFICIAL_MCP_REGISTRY_PROVIDER_ID,
} from "../src/main/lib/mcp-registry/official-provider"

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

function createFetchStub(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
): {
  fetchImpl: McpRegistryFetch
  calls: Array<{ url: URL; init?: RequestInit }>
} {
  const calls: Array<{ url: URL; init?: RequestInit }> = []
  return {
    calls,
    fetchImpl: async (input, init) => {
      const url = new URL(input.toString())
      calls.push({ url, init })
      return await handler(url, init)
    },
  }
}

describe("official MCP registry provider", () => {
  test("lists and searches official registry servers with bounded query params", async () => {
    const fetch = createFetchStub((url) => {
      expect(url.pathname).toBe("/v0.1/servers")
      expect(url.searchParams.get("limit")).toBe("25")
      expect(url.searchParams.get("search")).toBe("filesystem")
      expect(url.searchParams.get("cursor")).toBe("next-cursor")
      expect(url.searchParams.get("updated_since")).toBe("2026-06-20T00:00:00Z")
      expect(url.searchParams.get("version")).toBe("latest")
      expect(url.searchParams.get("include_deleted")).toBe("true")
      return jsonResponse({
        servers: [
          {
            server: {
              name: "io.github.example/filesystem",
              version: "1.2.3",
            },
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "active",
              },
            },
          },
        ],
        metadata: {
          nextCursor: "after-this",
          count: 1,
        },
      })
    })
    const provider = createOfficialMcpRegistryProvider({
      fetchImpl: fetch.fetchImpl,
    })

    expect(provider.providerId).toBe(OFFICIAL_MCP_REGISTRY_PROVIDER_ID)
    const result = await provider.searchServers({
      search: " filesystem ",
      cursor: " next-cursor ",
      updatedSince: " 2026-06-20T00:00:00Z ",
      version: " latest ",
      includeDeleted: true,
      limit: 25,
    })

    expect(result).toEqual({
      servers: [
        {
          server: {
            name: "io.github.example/filesystem",
            version: "1.2.3",
          },
          _meta: {
            "io.modelcontextprotocol.registry/official": {
              status: "active",
            },
          },
        },
      ],
      metadata: {
        nextCursor: "after-this",
        count: 1,
      },
    })
    expect(fetch.calls[0]?.init?.headers).toEqual({
      Accept: "application/json",
    })
  })

  test("clamps list limit to the official registry page maximum", async () => {
    const fetch = createFetchStub((url) => {
      expect(url.searchParams.get("limit")).toBe("100")
      return jsonResponse({ servers: [], metadata: { count: 0 } })
    })
    const provider = createOfficialMcpRegistryProvider({
      fetchImpl: fetch.fetchImpl,
    })

    await provider.listServers({ limit: 500 })
  })

  test("fetches version detail with encoded server name and version", async () => {
    const fetch = createFetchStub((url) => {
      expect(url.pathname).toBe(
        "/v0.1/servers/io.github.example%2Fserver/versions/1.0.0%2Bbuild.1",
      )
      expect(url.searchParams.get("include_deleted")).toBeNull()
      return jsonResponse({
        server: {
          name: "io.github.example/server",
          version: "1.0.0+build.1",
          remotes: [
            { type: "streamable-http", url: "https://mcp.example/mcp" },
          ],
        },
      })
    })
    const provider = createOfficialMcpRegistryProvider({
      fetchImpl: fetch.fetchImpl,
    })

    expect(
      await provider.getServerDetail({
        serverName: "io.github.example/server",
        version: "1.0.0+build.1",
      }),
    ).toEqual({
      server: {
        name: "io.github.example/server",
        version: "1.0.0+build.1",
        remotes: [{ type: "streamable-http", url: "https://mcp.example/mcp" }],
      },
    })
  })

  test("rejects non-HTTPS provider base URLs before fetching", async () => {
    const fetch = createFetchStub(() => {
      throw new Error("fetch should not be called")
    })
    const provider = createOfficialMcpRegistryProvider({
      baseUrl: "http://registry.modelcontextprotocol.io",
      fetchImpl: fetch.fetchImpl,
    })

    await expect(provider.listServers()).rejects.toThrow(
      "requires an HTTPS base URL",
    )
    expect(fetch.calls).toHaveLength(0)
  })

  test("rejects oversized and invalid official registry responses", async () => {
    const oversized = createFetchStub(() =>
      jsonResponse(
        { servers: [], metadata: { count: 0 } },
        { headers: { "content-length": "1024" } },
      ),
    )
    const provider = createOfficialMcpRegistryProvider({
      fetchImpl: oversized.fetchImpl,
      maxResponseBytes: 10,
    })
    await expect(provider.listServers()).rejects.toThrow("size limit")

    const invalid = createFetchStub(() => jsonResponse({ nope: true }))
    const invalidProvider = createOfficialMcpRegistryProvider({
      fetchImpl: invalid.fetchImpl,
    })
    await expect(invalidProvider.listServers()).rejects.toThrow(
      "Invalid official MCP registry list response",
    )
  })
})
