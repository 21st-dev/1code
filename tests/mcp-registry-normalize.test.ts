import { describe, expect, test } from "bun:test"
import { normalizeOfficialMcpRegistryEntry } from "../src/main/lib/mcp-registry/normalize"
import { OFFICIAL_MCP_REGISTRY_PROVIDER_ID } from "../src/main/lib/mcp-registry/official-provider"

describe("MCP registry normalization", () => {
  test("normalizes official registry package and remote targets", () => {
    const entry = normalizeOfficialMcpRegistryEntry({
      server: {
        name: "io.github.example/demo",
        title: "Demo MCP",
        description: "Demo server",
        version: "1.2.3",
        websiteUrl: "https://example.com/demo",
        repository: {
          url: "https://github.com/example/demo",
          source: "github",
          id: "example/demo",
          subfolder: "mcp",
        },
        compatibility: {
          runtimes: ["claude-code", "codex"],
        },
        packages: [
          {
            registryType: "npm",
            registryBaseUrl: "https://registry.npmjs.org",
            identifier: "@example/demo-mcp",
            version: "1.2.3",
            fileSha256: "abc123",
            runtimeHint: "npx",
            transport: { type: "stdio" },
            runtimeArguments: ["-y"],
            packageArguments: [{ value: "--project" }, "demo"],
            environmentVariables: [
              {
                name: "DEMO_TOKEN",
                description: "Demo API token",
                isRequired: true,
                isSecret: true,
                placeholder: "token",
              },
            ],
          },
        ],
        remotes: [
          {
            type: "streamable-http",
            url: "https://demo.example.com/mcp",
            headers: [
              {
                name: "Authorization",
                description: "Bearer token",
                isRequired: true,
                isSecret: true,
              },
            ],
            variables: [
              {
                name: "tenant",
                description: "Tenant slug",
                isRequired: false,
                choices: ["acme", "demo"],
              },
            ],
          },
        ],
        _meta: {
          "io.modelcontextprotocol.registry/publisher-provided": {
            publisherField: "publisher-value",
          },
        },
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          isLatest: true,
        },
      },
    })

    expect(entry).toMatchObject({
      providerId: OFFICIAL_MCP_REGISTRY_PROVIDER_ID,
      entryId: "io.github.example/demo",
      name: "io.github.example/demo",
      title: "Demo MCP",
      description: "Demo server",
      versionRef: "1.2.3",
      sourceUrl: "https://github.com/example/demo",
      websiteUrl: "https://example.com/demo",
      repository: {
        url: "https://github.com/example/demo",
        source: "github",
        id: "example/demo",
        subfolder: "mcp",
      },
      declaredRuntimeSupport: ["claude-code", "codex"],
      officialMetadata: { status: "active", isLatest: true },
      publisherMetadata: { publisherField: "publisher-value" },
    })

    expect(entry.installTargets).toHaveLength(2)
    expect(entry.installTargets[0]).toMatchObject({
      id: "package:@example/demo-mcp:0",
      source: "package",
      transport: "stdio",
      commandTemplate: "npx",
      args: ["-y", "--project", "demo"],
      runtimeArguments: ["-y"],
      packageArguments: ["--project", "demo"],
      packageDistribution: {
        registryType: "npm",
        registryBaseUrl: "https://registry.npmjs.org",
        identifier: "@example/demo-mcp",
        version: "1.2.3",
        fileSha256: "abc123",
        runtimeHint: "npx",
      },
      envSchema: [
        {
          name: "DEMO_TOKEN",
          source: "env",
          description: "Demo API token",
          required: true,
          secret: true,
          placeholder: "token",
          choices: [],
        },
      ],
      headerSchema: [],
      variableSchema: [],
      authMetadata: {
        kind: "unknown",
        required: true,
        headerNames: [],
        envNames: ["DEMO_TOKEN"],
      },
      declaredRuntimeSupport: ["claude-code", "codex"],
    })
    expect(entry.installTargets[1]).toMatchObject({
      id: "remote:https://demo.example.com/mcp:0",
      source: "remote",
      transport: "streamable_http",
      urlTemplate: "https://demo.example.com/mcp",
      args: [],
      envSchema: [],
      headerSchema: [
        {
          name: "Authorization",
          source: "header",
          description: "Bearer token",
          required: true,
          secret: true,
          choices: [],
        },
      ],
      variableSchema: [
        {
          name: "tenant",
          source: "variable",
          description: "Tenant slug",
          required: false,
          secret: false,
          choices: ["acme", "demo"],
        },
      ],
      authMetadata: {
        kind: "bearer",
        required: true,
        headerNames: ["Authorization"],
        envNames: [],
      },
      declaredRuntimeSupport: ["claude-code", "codex"],
    })
  })

  test("keeps unknown runtime support and rejects nameless entries", () => {
    const minimal = normalizeOfficialMcpRegistryEntry({
      server: {
        name: "io.github.example/minimal",
        version: "latest",
      },
    })

    expect(minimal).toMatchObject({
      entryId: "io.github.example/minimal",
      versionRef: "latest",
      declaredRuntimeSupport: ["unknown"],
      installTargets: [],
    })
    expect(() =>
      normalizeOfficialMcpRegistryEntry({ server: { version: "1.0.0" } }),
    ).toThrow("missing server.name")
  })
})
