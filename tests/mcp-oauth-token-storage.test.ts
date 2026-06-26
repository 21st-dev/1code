import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let userDataDir = ""
let claudeHome = ""
let refreshedAccessToken = "fresh-access-token"
let refreshedRefreshToken = "fresh-refresh-token"
let refreshCalls: Array<{ refreshToken: string; clientId: string }> = []

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return userDataDir
    },
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString(value: string) {
      return Buffer.from(
        `sealed:${Buffer.from(value, "utf-8").toString("base64")}`,
        "utf-8",
      )
    },
    decryptString(value: Buffer) {
      const raw = value.toString("utf-8")
      if (!raw.startsWith("sealed:")) {
        throw new Error("not sealed")
      }
      return Buffer.from(raw.slice("sealed:".length), "base64").toString(
        "utf-8",
      )
    },
  },
}))

mock.module("../src/main/lib/local-only", () => ({
  assertOfficialCloudAllowed: () => {},
  openExternalUrl: async () => {},
}))

mock.module("../src/main/lib/window", () => ({
  bringToFront: () => {},
}))

mock.module("../src/main/lib/plugins", () => ({
  discoverPluginMcpServers: async () => [],
}))

mock.module("../src/main/lib/trpc/routers/claude-settings", () => ({
  getApprovedPluginMcpServers: async () => [],
  getEnabledPlugins: async () => [],
}))

mock.module("../src/main/lib/oauth", () => ({
  CraftOAuth: class {
    refreshAccessToken = async (refreshToken: string, clientId: string) => {
      refreshCalls.push({ refreshToken, clientId })
      return {
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken,
        expiresAt: Date.now() + 60 * 60 * 1000,
        tokenType: "Bearer",
      }
    }
  },
  fetchOAuthMetadata: async () => null,
  getMcpBaseUrl: (url: string) => url,
}))

const mcpAuth = await import("../src/main/lib/mcp-auth")
const tokenStore = await import("../src/main/lib/mcp-oauth-token-store")
const claudeConfig = await import("../src/main/lib/claude-config")

describe("MCP OAuth token storage", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-mcp-oauth-user-data-"))
    claudeHome = await mkdtemp(join(tmpdir(), "locus-mcp-oauth-home-"))
    process.env.LOCUS_CLAUDE_CONFIG_HOME = claudeHome
    refreshCalls = []
    refreshedAccessToken = "fresh-access-token"
    refreshedRefreshToken = "fresh-refresh-token"
  })

  afterEach(async () => {
    delete process.env.LOCUS_CLAUDE_CONFIG_HOME
    await rm(userDataDir, { force: true, recursive: true })
    await rm(claudeHome, { force: true, recursive: true })
    userDataDir = ""
    claudeHome = ""
  })

  test("migrates legacy plaintext OAuth tokens out of Claude config", async () => {
    const expiresAt = Date.now() + 60 * 60 * 1000
    mkdirSync(claudeHome, { recursive: true })
    writeFileSync(
      join(claudeHome, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          secure_mcp: {
            url: "https://mcp.example.com/mcp",
            authType: "oauth",
            headers: {
              Authorization: "Bearer legacy-access-token",
              "X-Keep": "present",
            },
            _oauth: {
              accessToken: "legacy-access-token",
              refreshToken: "legacy-refresh-token",
              clientId: "client-1",
              expiresAt,
            },
          },
        },
      }),
    )

    const freshServers = await mcpAuth.ensureMcpTokensFresh(
      {
        secure_mcp: {
          url: "https://mcp.example.com/mcp",
          authType: "oauth",
          headers: {
            Authorization: "Bearer legacy-access-token",
            "X-Keep": "present",
          },
          _oauth: {
            accessToken: "legacy-access-token",
            refreshToken: "legacy-refresh-token",
            clientId: "client-1",
            expiresAt,
          },
        },
      },
      claudeConfig.GLOBAL_MCP_PATH,
    )

    expect(freshServers.secure_mcp.headers.Authorization).toBe(
      "Bearer legacy-access-token",
    )

    const rawClaudeConfig = readFileSync(
      join(claudeHome, ".claude.json"),
      "utf-8",
    )
    expect(rawClaudeConfig).not.toContain("legacy-access-token")
    expect(rawClaudeConfig).not.toContain("legacy-refresh-token")
    expect(rawClaudeConfig).not.toContain("Authorization")

    const parsedClaudeConfig = JSON.parse(rawClaudeConfig)
    expect(parsedClaudeConfig.mcpServers.secure_mcp.headers).toEqual({
      "X-Keep": "present",
    })
    expect(parsedClaudeConfig.mcpServers.secure_mcp._oauth).toMatchObject({
      hasTokens: true,
      clientId: "client-1",
      expiresAt,
    })
    expect(
      parsedClaudeConfig.mcpServers.secure_mcp._oauth.accessToken,
    ).toBeUndefined()
    expect(
      parsedClaudeConfig.mcpServers.secure_mcp._oauth.refreshToken,
    ).toBeUndefined()

    const rawTokenStore = readFileSync(
      tokenStore.getMcpOAuthTokenStorePath({ userDataPath: userDataDir }),
      "utf-8",
    )
    expect(rawTokenStore).not.toContain("legacy-access-token")
    expect(rawTokenStore).not.toContain("legacy-refresh-token")
    expect(
      tokenStore.readMcpOAuthTokens({
        serverName: "secure_mcp",
        projectPath: claudeConfig.GLOBAL_MCP_PATH,
        options: { userDataPath: userDataDir },
      }),
    ).toMatchObject({
      accessToken: "legacy-access-token",
      refreshToken: "legacy-refresh-token",
      clientId: "client-1",
      expiresAt,
    })
  })

  test("refresh writes new OAuth tokens only to encrypted app storage", async () => {
    mkdirSync(claudeHome, { recursive: true })
    writeFileSync(
      join(claudeHome, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          secure_mcp: {
            url: "https://mcp.example.com/mcp",
            authType: "oauth",
            _oauth: {
              hasTokens: true,
              clientId: "client-1",
              expiresAt: Date.now() - 1000,
            },
          },
        },
      }),
    )
    await tokenStore.saveMcpOAuthTokens({
      serverName: "secure_mcp",
      projectPath: claudeConfig.GLOBAL_MCP_PATH,
      tokens: {
        accessToken: "old-access-token",
        refreshToken: "old-refresh-token",
        clientId: "client-1",
        expiresAt: Date.now() - 1000,
        tokenType: "Bearer",
      },
      options: { userDataPath: userDataDir },
    })

    const refreshed = await mcpAuth.refreshMcpToken(
      "secure_mcp",
      claudeConfig.GLOBAL_MCP_PATH,
    )

    expect(refreshed).toBe("fresh-access-token")
    expect(refreshCalls).toEqual([
      { refreshToken: "old-refresh-token", clientId: "client-1" },
    ])

    const rawClaudeConfig = readFileSync(
      join(claudeHome, ".claude.json"),
      "utf-8",
    )
    expect(rawClaudeConfig).not.toContain("old-access-token")
    expect(rawClaudeConfig).not.toContain("old-refresh-token")
    expect(rawClaudeConfig).not.toContain("fresh-access-token")
    expect(rawClaudeConfig).not.toContain("fresh-refresh-token")
    expect(rawClaudeConfig).not.toContain("Authorization")

    const rawTokenStore = readFileSync(
      tokenStore.getMcpOAuthTokenStorePath({ userDataPath: userDataDir }),
      "utf-8",
    )
    expect(rawTokenStore).not.toContain("old-access-token")
    expect(rawTokenStore).not.toContain("old-refresh-token")
    expect(rawTokenStore).not.toContain("fresh-access-token")
    expect(rawTokenStore).not.toContain("fresh-refresh-token")

    expect(
      tokenStore.readMcpOAuthTokens({
        serverName: "secure_mcp",
        projectPath: claudeConfig.GLOBAL_MCP_PATH,
        options: { userDataPath: userDataDir },
      }),
    ).toMatchObject({
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
      clientId: "client-1",
      tokenType: "Bearer",
    })
  })
})
