import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { McpServerConfig } from "../src/main/lib/claude-config"
import type {
  OfficialMcpRegistryProvider,
  OfficialMcpRegistryServerListResponse,
  OfficialMcpRegistryServerResponse,
} from "../src/main/lib/mcp-registry/official-provider"
import { materializeMcpRegistryServerConfigForRuntime } from "../src/main/lib/mcp-registry/secrets"
import { createMcpRegistryService } from "../src/main/lib/mcp-registry/service"
import {
  setElectronSafeStorageForTest,
  setSecureStorageMacKeychainPreflightForTest,
} from "../src/main/lib/secure-storage"

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

function requiredSetupDetailResponse(): OfficialMcpRegistryServerResponse {
  return {
    server: {
      name: "io.github.example/needs-setup",
      version: "1.0.0",
      compatibility: { runtimes: ["claude-code"] },
      packages: [
        {
          registryType: "npm",
          identifier: "@example/needs-setup",
          runtimeHint: "npx",
          transport: { type: "stdio" },
          environmentVariables: [
            {
              name: "REQUIRED_TOKEN",
              isRequired: true,
              isSecret: true,
            },
          ],
        },
      ],
    },
  }
}

function requiredRemoteSetupDetailResponse(): OfficialMcpRegistryServerResponse {
  return {
    server: {
      name: "io.github.example/remote-setup",
      version: "1.0.0",
      compatibility: { runtimes: ["claude-code"] },
      remotes: [
        {
          type: "streamable-http",
          url: "https://{tenant}.example.com/mcp",
          headers: [
            {
              name: "Authorization",
              isRequired: true,
              isSecret: true,
            },
          ],
          variables: [
            {
              name: "tenant",
              isRequired: true,
            },
          ],
        },
      ],
    },
  }
}

function oauthRemoteSetupDetailResponse(): OfficialMcpRegistryServerResponse {
  return {
    server: {
      name: "io.github.example/oauth-remote",
      version: "1.0.0",
      compatibility: { runtimes: ["claude-code"] },
      remotes: [
        {
          type: "streamable-http",
          url: "https://oauth.example.com/mcp",
          authType: "oauth",
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
  beforeEach(() => {
    setSecureStorageMacKeychainPreflightForTest(true)
    setElectronSafeStorageForTest({
      isEncryptionAvailable() {
        return true
      },
      encryptString(value: string) {
        return Buffer.from(`encrypted:${value}`, "utf-8")
      },
      decryptString(value: Buffer) {
        const raw = value.toString("utf-8")
        if (!raw.startsWith("encrypted:")) {
          throw new Error("not encrypted")
        }
        return raw.slice("encrypted:".length)
      },
    })
  })

  afterEach(() => {
    setSecureStorageMacKeychainPreflightForTest(null)
    setElectronSafeStorageForTest(null)
  })

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
    expect((writes[0] as { config: McpServerConfig }).config).not.toHaveProperty(
      "_locusPluginMcp",
    )

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

  test("saves inactive needs-setup config when required setup is missing", async () => {
    const writes: unknown[] = []
    const calls: string[] = []
    const provider: OfficialMcpRegistryProvider = {
      providerId: "official-mcp-registry",
      async listServers() {
        throw new Error("not used")
      },
      async searchServers() {
        throw new Error("not used")
      },
      async getServerDetail(input) {
        calls.push(`detail:${input.serverName}`)
        return requiredSetupDetailResponse()
      },
    }
    const service = createMcpRegistryService({
      provider,
      async writeClaudeConfig(input) {
        writes.push(input)
        return { success: true, name: input.name.trim() }
      },
    })

    await expect(
      service.installEntry({
        serverName: "io.github.example/needs-setup",
        targetId: "package:@example/needs-setup:0",
        runtime: "claude-code",
        scope: "global",
      }),
    ).resolves.toMatchObject({
      success: true,
      status: "installed-needs-setup",
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      config: {
        command: "npx",
        disabled: true,
        disabledReason: expect.stringContaining("env:REQUIRED_TOKEN"),
        _locusMcpRegistry: {
          status: "installed-needs-setup",
        },
      },
    })
    expect((writes[0] as { config: McpServerConfig }).config).not.toHaveProperty(
      "_locusPluginMcp",
    )
    expect(calls).toEqual(["detail:io.github.example/needs-setup"])
  })

  test("saves oauth registry targets inactive until runtime auth is completed", async () => {
    const writes: unknown[] = []
    const provider: OfficialMcpRegistryProvider = {
      providerId: "official-mcp-registry",
      async listServers() {
        throw new Error("not used")
      },
      async searchServers() {
        throw new Error("not used")
      },
      async getServerDetail() {
        return oauthRemoteSetupDetailResponse()
      },
    }
    const service = createMcpRegistryService({
      provider,
      async writeClaudeConfig(input) {
        writes.push(input)
        return { success: true, name: input.name.trim() }
      },
    })

    await expect(
      service.installEntry({
        serverName: "io.github.example/oauth-remote",
        targetId: "remote:streamable_http:0",
        runtime: "claude-code",
        scope: "global",
      }),
    ).resolves.toMatchObject({
      success: true,
      status: "installed-needs-setup",
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      config: {
        url: "https://oauth.example.com/mcp",
        authType: "oauth",
        disabled: true,
        disabledReason: expect.stringContaining("oauth"),
        _locusMcpRegistry: {
          status: "installed-needs-setup",
        },
      },
    })
  })

  test("installs resolved package setup with encrypted env values", async () => {
    const writes: Array<{
      config: McpServerConfig
    }> = []
    const provider: OfficialMcpRegistryProvider = {
      providerId: "official-mcp-registry",
      async listServers() {
        throw new Error("not used")
      },
      async searchServers() {
        throw new Error("not used")
      },
      async getServerDetail() {
        return requiredSetupDetailResponse()
      },
    }
    const service = createMcpRegistryService({
      provider,
      async writeClaudeConfig(input) {
        writes.push({ config: input.config })
        return { success: true, name: input.name.trim() }
      },
    })

    await expect(
      service.installEntry({
        serverName: "io.github.example/needs-setup",
        targetId: "package:@example/needs-setup:0",
        runtime: "claude-code",
        scope: "global",
        resolvedSetup: {
          env: { REQUIRED_TOKEN: "env-secret-value" },
          localDependencies: {
            "package:npm:@example/needs-setup": true,
          },
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      status: "installed-unverified",
    })

    expect(writes).toHaveLength(1)
    const rawConfig = writes[0]?.config
    if (!rawConfig) throw new Error("Expected config write")
    expect(JSON.stringify(rawConfig)).not.toContain("env-secret-value")
    expect(rawConfig.env).toEqual({
      REQUIRED_TOKEN: "locus:mcp-registry-secret:v1:env:REQUIRED_TOKEN",
    })
    expect(rawConfig._locusMcpRegistry).toMatchObject({
      encryptedSetup: {
        version: 1,
        env: {
          REQUIRED_TOKEN: Buffer.from(
            "encrypted:env-secret-value",
            "utf-8",
          ).toString("base64"),
        },
      },
    })

    expect(
      materializeMcpRegistryServerConfigForRuntime(rawConfig, {
        stripMetadata: true,
      }),
    ).toMatchObject({
      env: { REQUIRED_TOKEN: "env-secret-value" },
    })
  })

  test("installs resolved package setup with env var references", async () => {
    const writes: Array<{
      config: McpServerConfig
    }> = []
    const provider: OfficialMcpRegistryProvider = {
      providerId: "official-mcp-registry",
      async listServers() {
        throw new Error("not used")
      },
      async searchServers() {
        throw new Error("not used")
      },
      async getServerDetail() {
        return requiredSetupDetailResponse()
      },
    }
    const service = createMcpRegistryService({
      provider,
      async writeClaudeConfig(input) {
        writes.push({ config: input.config })
        return { success: true, name: input.name.trim() }
      },
    })

    await expect(
      service.installEntry({
        serverName: "io.github.example/needs-setup",
        targetId: "package:@example/needs-setup:0",
        runtime: "claude-code",
        scope: "global",
        resolvedSetup: {
          env: { REQUIRED_TOKEN: { envVar: "MCP_REQUIRED_TOKEN" } },
          localDependencies: {
            "package:npm:@example/needs-setup": true,
          },
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      status: "installed-unverified",
    })

    const rawConfig = writes[0]?.config
    if (!rawConfig) throw new Error("Expected config write")
    expect(rawConfig).toMatchObject({
      env: {
        REQUIRED_TOKEN: "locus:mcp-registry-env-ref:v1:env:REQUIRED_TOKEN",
      },
      _locusMcpRegistry: {
        envVarRefs: {
          env: { REQUIRED_TOKEN: "MCP_REQUIRED_TOKEN" },
        },
      },
    })
    expect(rawConfig._locusMcpRegistry).not.toHaveProperty("encryptedSetup")

    expect(
      materializeMcpRegistryServerConfigForRuntime(rawConfig, {
        env: { MCP_REQUIRED_TOKEN: "runtime-secret" },
        stripMetadata: true,
      }),
    ).toMatchObject({
      env: { REQUIRED_TOKEN: "runtime-secret" },
    })
  })

  test("installs resolved remote setup with encrypted headers and variables", async () => {
    const writes: Array<{
      config: McpServerConfig
    }> = []
    const provider: OfficialMcpRegistryProvider = {
      providerId: "official-mcp-registry",
      async listServers() {
        throw new Error("not used")
      },
      async searchServers() {
        throw new Error("not used")
      },
      async getServerDetail() {
        return requiredRemoteSetupDetailResponse()
      },
    }
    const service = createMcpRegistryService({
      provider,
      async writeClaudeConfig(input) {
        writes.push({ config: input.config })
        return { success: true, name: input.name.trim() }
      },
    })

    const result = await service.installEntry({
      serverName: "io.github.example/remote-setup",
      targetId: "remote:streamable_http:0",
      runtime: "claude-code",
      scope: "global",
      resolvedSetup: {
        headers: { Authorization: "Bearer remote-secret" },
        variables: { tenant: "acme" },
      },
    })

    expect(JSON.stringify(result)).not.toContain("remote-secret")
    expect(writes).toHaveLength(1)
    const rawConfig = writes[0]?.config
    if (!rawConfig) throw new Error("Expected config write")
    expect(JSON.stringify(rawConfig)).not.toContain("remote-secret")
    expect(rawConfig).toMatchObject({
      url: "https://acme.example.com/mcp",
      authType: "bearer",
      headers: {
        Authorization: "locus:mcp-registry-secret:v1:header:Authorization",
      },
      _locusMcpRegistry: {
        encryptedSetup: {
          version: 1,
          headers: {
            Authorization: Buffer.from(
              "encrypted:Bearer remote-secret",
              "utf-8",
            ).toString("base64"),
          },
        },
      },
    })

    expect(
      materializeMcpRegistryServerConfigForRuntime(rawConfig, {
        stripMetadata: true,
      }),
    ).toMatchObject({
      url: "https://acme.example.com/mcp",
      headers: { Authorization: "Bearer remote-secret" },
    })
  })

  test("installs resolved remote setup with variable env references", async () => {
    const writes: Array<{
      config: McpServerConfig
    }> = []
    const provider: OfficialMcpRegistryProvider = {
      providerId: "official-mcp-registry",
      async listServers() {
        throw new Error("not used")
      },
      async searchServers() {
        throw new Error("not used")
      },
      async getServerDetail() {
        return requiredRemoteSetupDetailResponse()
      },
    }
    const service = createMcpRegistryService({
      provider,
      async writeClaudeConfig(input) {
        writes.push({ config: input.config })
        return { success: true, name: input.name.trim() }
      },
    })

    await expect(
      service.installEntry({
        serverName: "io.github.example/remote-setup",
        targetId: "remote:streamable_http:0",
        runtime: "claude-code",
        scope: "global",
        resolvedSetup: {
          headers: { Authorization: "Bearer remote-secret" },
          variables: { tenant: { envVar: "MCP_TENANT" } },
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      status: "installed-unverified",
    })

    const rawConfig = writes[0]?.config
    if (!rawConfig) throw new Error("Expected config write")
    expect(rawConfig).toMatchObject({
      url: "https://{tenant}.example.com/mcp",
      _locusMcpRegistry: {
        envVarRefs: {
          variables: { tenant: "MCP_TENANT" },
        },
        templates: {
          url: "https://{tenant}.example.com/mcp",
        },
      },
    })

    expect(
      materializeMcpRegistryServerConfigForRuntime(rawConfig, {
        env: { MCP_TENANT: "acme" },
        stripMetadata: true,
      }),
    ).toMatchObject({
      url: "https://acme.example.com/mcp",
      headers: { Authorization: "Bearer remote-secret" },
    })
  })
})
