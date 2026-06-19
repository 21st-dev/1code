import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import * as realOs from "node:os"
import { join, resolve } from "node:path"
import * as dbSchema from "../src/main/lib/db/schema"

type MockMcpServerConfig = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  authType?: "oauth" | "bearer" | "none"
  headers?: Record<string, string>
  _oauth?: {
    accessToken: string
    refreshToken?: string
    clientId?: string
    expiresAt?: number
  }
  _locusPluginMcp?: {
    pluginSource: string
    pluginReviewKey: string
    serverName: string
    approvalIdentifier: string
  }
  [key: string]: unknown
}

type MockClaudeConfig = {
  mcpServers?: Record<string, MockMcpServerConfig>
  projects?: Record<
    string,
    { mcpServers?: Record<string, MockMcpServerConfig> }
  >
}

type CodexCliCall = {
  args: string[]
  options?: { cwd?: string }
}

type McpOAuthCall = {
  serverName: string
  projectPath: string
}

const GLOBAL_MCP_PATH = "__global__"
const originalHome = process.env.HOME

let claudeConfig: MockClaudeConfig = {}
let claudeDirConfig: MockClaudeConfig = {}
let projectMcpJsonByPath: Record<
  string,
  Record<string, MockMcpServerConfig>
> = {}
let registeredProjectPaths: string[] = []
let codexMcpListStdout = "[]"
let codexCliCalls: CodexCliCall[] = []
let mcpOAuthCalls: McpOAuthCall[] = []
let tempDirs: string[] = []
let mockHome = originalHome || realOs.tmpdir()
let enabledPluginSources: string[] = []
let approvedPluginMcpServers: string[] = []
let pluginMcpConfigs: Array<{
  pluginSource: string
  pluginReviewKey: string
  reviewGate: { canUseMcp: boolean; status: string; reasons: string[] }
  mcpServers: Record<string, MockMcpServerConfig>
  approvalIdentifiers: Record<string, string>
}> = []

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

function getProjectServers(
  config: MockClaudeConfig,
  projectPath: string,
): Record<string, MockMcpServerConfig> {
  config.projects ??= {}
  config.projects[projectPath] ??= {}
  config.projects[projectPath].mcpServers ??= {}
  return config.projects[projectPath].mcpServers
}

function updateMcpServerConfig(
  config: MockClaudeConfig,
  projectPath: string | null,
  serverName: string,
  update: Partial<MockMcpServerConfig>,
): MockClaudeConfig {
  if (!projectPath || projectPath === GLOBAL_MCP_PATH) {
    config.mcpServers ??= {}
    config.mcpServers[serverName] = {
      ...config.mcpServers[serverName],
      ...update,
    }
    return config
  }

  const servers = getProjectServers(config, projectPath)
  servers[serverName] = {
    ...servers[serverName],
    ...update,
  }
  return config
}

function removeMcpServerConfig(
  config: MockClaudeConfig,
  projectPath: string | null,
  serverName: string,
): MockClaudeConfig {
  if (!projectPath || projectPath === GLOBAL_MCP_PATH) {
    delete config.mcpServers?.[serverName]
    return config
  }

  delete config.projects?.[projectPath]?.mcpServers?.[serverName]
  return config
}

const runCodexCliCheckedMock = mock(
  async (args: string[], options?: { cwd?: string }) => {
    codexCliCalls.push({ args, options })
    return { stdout: codexMcpListStdout, stderr: "" }
  },
)

mock.module("node:os", () => ({
  ...realOs,
  homedir: () => mockHome,
}))

mock.module("../src/main/lib/claude-config", () => ({
  GLOBAL_MCP_PATH,
  readClaudeConfig: async () => clone(claudeConfig),
  readClaudeDirConfig: async () => clone(claudeDirConfig),
  readProjectMcpJson: async (projectPath: string) =>
    clone(projectMcpJsonByPath[projectPath] || {}),
  updateClaudeConfigAtomic: async (
    updater: (
      config: MockClaudeConfig,
    ) => MockClaudeConfig | Promise<MockClaudeConfig>,
  ) => {
    claudeConfig = await updater(clone(claudeConfig))
    return clone(claudeConfig)
  },
  updateMcpServerConfig,
  removeMcpServerConfig,
  resolveProjectPathFromWorktree: (pathToResolve: string) => pathToResolve,
  getMergedGlobalMcpServers: async (
    config: MockClaudeConfig = claudeConfig,
    dirConfig: MockClaudeConfig = claudeDirConfig,
  ) => ({
    ...(dirConfig.mcpServers || {}),
    ...(config.mcpServers || {}),
  }),
  getMergedLocalProjectMcpServers: async (
    projectPath: string,
    config: MockClaudeConfig = claudeConfig,
    dirConfig: MockClaudeConfig = claudeDirConfig,
  ) => ({
    ...(dirConfig.projects?.[projectPath]?.mcpServers || {}),
    ...(config.projects?.[projectPath]?.mcpServers || {}),
  }),
  getMatchingLocusPluginMcpServerConfig: (input: {
    servers: Record<string, MockMcpServerConfig> | undefined
    serverName: string
    pluginSource: string
    pluginReviewKey: string
    approvalIdentifier: string
  }) => {
    const server = input.servers?.[input.serverName]
    const provenance = server?._locusPluginMcp
    if (
      provenance?.pluginSource === input.pluginSource &&
      provenance.pluginReviewKey === input.pluginReviewKey &&
      provenance.serverName === input.serverName &&
      provenance.approvalIdentifier === input.approvalIdentifier
    ) {
      return server
    }
    return undefined
  },
}))

mock.module("../src/main/lib/db", () => ({
  ...dbSchema,
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        all: () => registeredProjectPaths.map((path) => ({ path })),
        where: () => ({
          get: () =>
            registeredProjectPaths.length > 0
              ? { path: registeredProjectPaths[0] }
              : undefined,
        }),
      }),
    }),
  }),
}))

mock.module("../src/main/lib/mcp-auth", () => ({
  ensureMcpTokensFresh: async (servers: Record<string, MockMcpServerConfig>) =>
    servers,
  fetchMcpTools: async (url: string) =>
    url.includes("needs-auth") ? [] : [{ name: "remote_tool" }],
  fetchMcpToolsStdio: async () => [{ name: "stdio_tool" }],
  getMcpAuthStatus: async () => ({ status: "connected" }),
  startMcpOAuth: async (serverName: string, projectPath: string) => {
    mcpOAuthCalls.push({ serverName, projectPath })
    return { success: true }
  },
}))

mock.module("../src/main/lib/oauth", () => ({
  fetchOAuthMetadata: async (baseUrl: string) =>
    baseUrl.includes("needs-auth")
      ? { authorization_endpoint: `${baseUrl}/authorize` }
      : null,
  getMcpBaseUrl: (url: string) => url,
}))

mock.module("../src/main/lib/plugins", () => ({
  discoverPluginMcpServers: async () => clone(pluginMcpConfigs),
}))

mock.module("../src/main/lib/trpc/routers/claude-settings", () => ({
  getApprovedPluginMcpServers: async () => clone(approvedPluginMcpServers),
  getEnabledPlugins: async () => clone(enabledPluginSources),
}))

mock.module("../src/main/lib/claude/agent-sdk-config-dir", () => ({
  clearClaudeAgentSdkIsolatedConfigDirCache: () => {},
}))

mock.module("../src/main/lib/claude/agent-sdk-query-loader", () => ({
  clearClaudeAgentSdkQueryCache: () => {},
}))

mock.module("../src/main/lib/codex/cli-runner", () => ({
  runCodexCliChecked: runCodexCliCheckedMock,
}))

const claudeMcpConfig = await import(
  "../src/main/lib/runtime-mcp-config/claude"
)
const codexMcpConfig = await import("../src/main/lib/runtime-mcp-config/codex")

function makeTempDir(): string {
  const dir = mkdtempSync(join(realOs.tmpdir(), "locus-runtime-mcp-test-"))
  tempDirs.push(dir)
  return dir
}

beforeEach(() => {
  claudeConfig = {}
  claudeDirConfig = {}
  projectMcpJsonByPath = {}
  registeredProjectPaths = []
  codexMcpListStdout = "[]"
  codexCliCalls = []
  mcpOAuthCalls = []
  enabledPluginSources = []
  approvedPluginMcpServers = []
  pluginMcpConfigs = []
  runCodexCliCheckedMock.mockClear()
  claudeMcpConfig.refreshClaudeMcpConfig()
  codexMcpConfig.clearCodexMcpConfigCache()
  mockHome = originalHome || realOs.tmpdir()
  delete process.env.CODEX_REMOTE_TOKEN
  delete process.env.CODEX_MISSING_ENV
})

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
  if (originalHome) {
    process.env.HOME = originalHome
  } else {
    delete process.env.HOME
  }
})

afterAll(() => {
  mock.restore()
})

describe("Runtime MCP config service behavior", () => {
  test("preserves Claude global and project add/remove/list/status behavior", async () => {
    const projectPath = makeTempDir()
    writeFileSync(join(projectPath, ".mcp.json"), "{}")
    registeredProjectPaths = [projectPath]
    claudeDirConfig = {
      mcpServers: {
        dir_global: { command: "dir-tool" },
      },
    }
    claudeConfig = {
      mcpServers: {
        global_existing: { command: "node", args: ["server.js"] },
      },
      projects: {
        [projectPath]: {
          mcpServers: {
            project_existing: {
              url: "https://needs-auth.example.com/mcp",
              authType: "oauth",
            },
          },
        },
      },
    }
    projectMcpJsonByPath[projectPath] = {
      project_json: { command: "json-tool" },
    }

    const before = await claudeMcpConfig.getClaudeMcpConfig({ projectPath })
    expect(before.mcpServers.map((server) => server.name).sort()).toEqual([
      "dir_global",
      "global_existing",
      "project_existing",
      "project_json",
    ])
    expect(
      before.mcpServers.find((server) => server.name === "project_existing")
        ?.status,
    ).toBe("needs-auth")

    await claudeMcpConfig.addClaudeMcpServer({
      name: " global_added ",
      scope: "global",
      transport: "http",
      url: "https://api.example.com/mcp",
      authType: "bearer",
      bearerToken: "secret-token",
    })
    await claudeMcpConfig.addClaudeMcpServer({
      name: "project_added",
      scope: "project",
      projectPath,
      transport: "stdio",
      command: "node",
      args: ["project.js"],
      env: { MCP_ENV: "1" },
    })
    await claudeMcpConfig.writeClaudeMcpServerConfig({
      name: "registry_remote",
      scope: "global",
      config: {
        url: "https://registry.example.com/mcp",
        authType: "oauth",
        headers: { "X-Registry": "present" },
      },
    })
    await claudeMcpConfig.removeClaudeMcpServer({
      name: "project_existing",
      scope: "project",
      projectPath,
    })

    expect(claudeConfig.mcpServers?.global_added).toEqual({
      url: "https://api.example.com/mcp",
      authType: "bearer",
      headers: { Authorization: "Bearer secret-token" },
    })
    expect(
      claudeConfig.projects?.[projectPath]?.mcpServers?.project_added,
    ).toEqual({
      command: "node",
      args: ["project.js"],
      env: { MCP_ENV: "1" },
    })
    expect(claudeConfig.mcpServers?.registry_remote).toEqual({
      url: "https://registry.example.com/mcp",
      authType: "oauth",
      headers: { "X-Registry": "present" },
    })
    expect(
      claudeConfig.projects?.[projectPath]?.mcpServers?.project_existing,
    ).toBeUndefined()

    await expect(
      claudeMcpConfig.addClaudeMcpServer({
        name: "bad name",
        scope: "global",
        transport: "stdio",
        command: "node",
      }),
    ).rejects.toThrow("MCP server name")
    await expect(
      claudeMcpConfig.addClaudeMcpServer({
        name: "unregistered_project",
        scope: "project",
        projectPath: join(projectPath, "missing"),
        transport: "stdio",
        command: "node",
      }),
    ).rejects.toThrow("registered project path")
  })

  test("displays plugin-sourced MCP servers under plugin ownership", async () => {
    enabledPluginSources = ["market:demo"]
    approvedPluginMcpServers = ["approved-demo-server"]
    pluginMcpConfigs = [
      {
        pluginSource: "market:demo",
        pluginReviewKey: "sha256:review",
        reviewGate: { canUseMcp: true, status: "trusted", reasons: [] },
        mcpServers: {
          approved_tool: { command: "approved-plugin-tool" },
          pending_tool: { command: "pending-plugin-tool" },
        },
        approvalIdentifiers: {
          approved_tool: "approved-demo-server",
          pending_tool: "pending-demo-server",
        },
      },
    ]

    const settings = await claudeMcpConfig.getAllMcpConfigHandler()
    const pluginGroup = settings.groups.find(
      (group) => group.groupName === "Plugin: market:demo",
    )

    expect(pluginGroup).toMatchObject({
      projectPath: null,
      mcpServers: expect.arrayContaining([
        expect.objectContaining({
          name: "approved_tool",
          isApproved: true,
        }),
        expect.objectContaining({
          name: "pending_tool",
          status: "pending-approval",
          isApproved: false,
        }),
      ]),
    })

    const runtime = await claudeMcpConfig.resolveClaudeMcpServersForSdk({
      isolatedConfigReady: true,
      runtimeCwd: process.cwd(),
    })

    expect(runtime.mcpServersForSdk).toHaveProperty("approved_tool")
    expect(runtime.mcpServersForSdk).not.toHaveProperty("pending_tool")
  })

  test("preserves Codex list/status/auth commands and current global-only writes", async () => {
    codexMcpListStdout = JSON.stringify([
      {
        name: "local_stdio",
        enabled: true,
        transport: {
          type: "stdio",
          command: "node",
          args: ["stdio.js"],
          env: { LOCAL: "1" },
        },
        auth_status: "unsupported",
      },
      {
        name: "remote_needs_auth",
        enabled: true,
        transport: {
          type: "streamable_http",
          url: "https://needs-auth.example.com/mcp",
        },
        auth_status: "not_logged_in",
      },
    ])

    const allConfig = await codexMcpConfig.getAllCodexMcpConfigHandler()
    const globalServers = allConfig.groups[0]?.mcpServers || []
    expect(
      globalServers.find((server) => server.name === "local_stdio"),
    ).toMatchObject({
      status: "connected",
      needsAuth: false,
    })
    expect(
      globalServers.find((server) => server.name === "remote_needs_auth"),
    ).toMatchObject({
      status: "needs-auth",
      needsAuth: true,
    })

    await codexMcpConfig.addCodexMcpServer({
      name: "added_http",
      scope: "global",
      transport: "http",
      url: "https://api.example.com/mcp",
    })
    await codexMcpConfig.addCodexMcpServer({
      name: "added_stdio",
      scope: "global",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    })
    await codexMcpConfig.removeCodexMcpServer({
      name: "added_http",
      scope: "global",
    })
    await codexMcpConfig.startCodexMcpOAuth({ serverName: "remote_needs_auth" })
    await codexMcpConfig.logoutCodexMcpServer({
      serverName: "remote_needs_auth",
    })

    expect(codexCliCalls.map((call) => call.args)).toEqual([
      ["mcp", "list", "--json"],
      ["mcp", "add", "added_http", "--url", "https://api.example.com/mcp"],
      ["mcp", "add", "added_stdio", "--", "node", "server.js"],
      ["mcp", "remove", "added_http"],
      ["mcp", "login", "remote_needs_auth"],
      ["mcp", "logout", "remote_needs_auth"],
    ])
    await expect(
      codexMcpConfig.addCodexMcpServer({
        name: "project_server",
        scope: "project",
        transport: "stdio",
        command: "node",
      }),
    ).rejects.toThrow("global scope only")
  })

  test("materializes Codex registry-relevant fields without claiming full install writes", async () => {
    const projectPath = makeTempDir()
    process.env.CODEX_REMOTE_TOKEN = "runtime-secret"
    codexMcpListStdout = JSON.stringify([
      {
        name: "disabled_stdio",
        enabled: false,
        disabled_reason: "missing setup",
        transport: {
          type: "stdio",
          command: "./server.js",
          args: ["--mode", "disabled"],
          env: { INLINE_SECRET: "inline-secret" },
          env_vars: ["CODEX_REMOTE_TOKEN", "CODEX_MISSING_ENV"],
          cwd: projectPath,
        },
        auth_status: "unsupported",
      },
      {
        name: "active_stdio",
        enabled: true,
        transport: {
          type: "stdio",
          command: "./server.js",
          args: ["--mode", "active"],
          env: { INLINE_SECRET: "inline-secret" },
          env_vars: ["CODEX_REMOTE_TOKEN", "CODEX_MISSING_ENV"],
          cwd: projectPath,
        },
        auth_status: "unsupported",
      },
      {
        name: "remote_sse",
        enabled: true,
        transport: {
          type: "sse",
          url: "https://api.example.com/mcp",
          http_headers: { "X-Inline": "inline-header" },
          env_http_headers: {
            "X-Env": "CODEX_REMOTE_TOKEN",
            "X-Missing": "CODEX_MISSING_ENV",
          },
          bearer_token_env_var: "CODEX_REMOTE_TOKEN",
        },
        auth_status: "bearer_token",
      },
    ])

    const snapshot = await codexMcpConfig.resolveCodexMcpSnapshot({
      lookupPath: projectPath,
    })

    expect(codexCliCalls.at(-1)).toEqual({
      args: ["mcp", "list", "--json"],
      options: { cwd: projectPath },
    })
    expect(snapshot.mcpServersForSession).toContainEqual({
      name: "active_stdio",
      type: "stdio",
      command: resolve(projectPath, "server.js"),
      args: ["--mode", "active"],
      env: [
        { name: "INLINE_SECRET", value: "inline-secret" },
        { name: "CODEX_REMOTE_TOKEN", value: "runtime-secret" },
      ],
    })
    expect(snapshot.mcpServersForSession).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "disabled_stdio" }),
      ]),
    )
    expect(snapshot.mcpServersForSession).toContainEqual({
      name: "remote_sse",
      type: "http",
      url: "https://api.example.com/mcp",
      headers: expect.arrayContaining([
        { name: "X-Inline", value: "inline-header" },
        { name: "X-Env", value: "runtime-secret" },
        { name: "Authorization", value: "Bearer runtime-secret" },
      ]),
    })

    const servers = snapshot.groups[0]?.mcpServers || []
    expect(
      servers.find((server) => server.name === "disabled_stdio"),
    ).toMatchObject({
      status: "failed",
      config: {
        enabled: false,
        disabledReason: "missing setup",
        command: resolve(projectPath, "server.js"),
        cwd: projectPath,
        env: { INLINE_SECRET: "<redacted>" },
        envVars: ["CODEX_REMOTE_TOKEN", "CODEX_MISSING_ENV"],
      },
    })
    expect(
      servers.find((server) => server.name === "remote_sse"),
    ).toMatchObject({
      config: {
        transportType: "sse",
        url: "https://api.example.com/mcp",
        headers: { "X-Inline": "<redacted>" },
        envHttpHeaders: {
          "X-Env": "CODEX_REMOTE_TOKEN",
          "X-Missing": "CODEX_MISSING_ENV",
        },
        bearerTokenEnvVar: "CODEX_REMOTE_TOKEN",
      },
    })

    await codexMcpConfig.addCodexMcpServer({
      name: "complex_stdio",
      scope: "global",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    })

    expect(codexCliCalls.at(-1)?.args).toEqual([
      "mcp",
      "add",
      "complex_stdio",
      "--",
      "node",
      "server.js",
    ])
  })

  test("starts Claude OAuth for global and registered project MCP servers", async () => {
    const projectPath = makeTempDir()
    registeredProjectPaths = [projectPath]

    await claudeMcpConfig.startClaudeMcpOAuth({
      serverName: " global_oauth ",
      projectPath: GLOBAL_MCP_PATH,
    })
    await claudeMcpConfig.startClaudeMcpOAuth({
      serverName: "project_oauth",
      projectPath,
    })

    expect(mcpOAuthCalls).toEqual([
      { serverName: "global_oauth", projectPath: GLOBAL_MCP_PATH },
      { serverName: "project_oauth", projectPath },
    ])

    await expect(
      claudeMcpConfig.startClaudeMcpOAuth({
        serverName: "missing_project",
        projectPath: join(projectPath, "missing"),
      }),
    ).rejects.toThrow("registered project path")
  })

  test("materializes Claude and Codex desktop-run MCP inputs through the service", async () => {
    const projectPath = makeTempDir()
    writeFileSync(join(projectPath, ".mcp.json"), "{}")
    const tempHome = makeTempDir()
    mockHome = tempHome
    process.env.HOME = tempHome
    const claudeRuntimeConfig: MockClaudeConfig = {
      mcpServers: {
        global_stdio: { command: "global-tool", args: ["--global"] },
        disabled_global: { command: "disabled-tool", disabled: true },
        registry_needs_setup: {
          command: "registry-tool",
          disabled: true,
          _locusMcpRegistry: {
            providerId: "official-mcp-registry",
            entryId: "io.github.example/needs-setup",
            targetId: "package:@example/needs-setup:0",
            runtime: "claude-code",
            status: "installed-needs-setup",
            missingSetupKeys: ["env:REQUIRED_TOKEN"],
            entryFingerprint: "sha256:entry",
            configFingerprint: "sha256:config",
            installedAt: "2026-06-20T00:00:00.000Z",
          },
        },
        registry_ready_to_verify: {
          command: "registry-ready-tool",
          _locusMcpRegistry: {
            providerId: "official-mcp-registry",
            entryId: "io.github.example/ready",
            targetId: "package:@example/ready:0",
            runtime: "claude-code",
            status: "installed-needs-setup",
            missingSetupKeys: [],
            entryFingerprint: "sha256:entry",
            configFingerprint: "sha256:config",
            installedAt: "2026-06-20T00:00:00.000Z",
          },
        },
      },
      projects: {
        [projectPath]: {
          mcpServers: {
            project_http: {
              url: "https://project.example.com/mcp",
              authType: "none",
            },
          },
        },
      },
    }
    writeFileSync(
      join(tempHome, ".claude.json"),
      JSON.stringify(claudeRuntimeConfig),
    )
    claudeConfig = claudeRuntimeConfig
    projectMcpJsonByPath[projectPath] = {
      project_json: { command: "json-tool" },
    }

    const claudeRuntime = await claudeMcpConfig.resolveClaudeMcpServersForSdk({
      isolatedConfigReady: true,
      projectPath,
      runtimeCwd: projectPath,
    })
    expect(claudeRuntime.mcpReadinessStatus).toBe("ready")
    expect(claudeRuntime.mcpServersForSdk).toMatchObject({
      global_stdio: { command: "global-tool", args: ["--global"] },
      registry_ready_to_verify: { command: "registry-ready-tool" },
      project_http: {
        url: "https://project.example.com/mcp",
        authType: "none",
      },
      project_json: { command: "json-tool" },
    })
    expect(claudeRuntime.mcpServersForSdk).not.toHaveProperty("disabled_global")
    expect(claudeRuntime.mcpServersForSdk).not.toHaveProperty(
      "registry_needs_setup",
    )

    const claudeSettings = await claudeMcpConfig.getClaudeMcpConfig({
      projectPath,
    })
    expect(
      claudeSettings.mcpServers.find(
        (server) => server.name === "disabled_global",
      )?.status,
    ).toBe("disabled")
    expect(
      claudeSettings.mcpServers.find(
        (server) => server.name === "registry_needs_setup",
      )?.status,
    ).toBe("disabled")
    expect(
      claudeSettings.mcpServers.find(
        (server) => server.name === "registry_ready_to_verify",
      )?.status,
    ).toBe("ready-to-verify")

    process.env.CODEX_REMOTE_TOKEN = "runtime-token"
    codexMcpConfig.clearCodexMcpConfigCache()
    codexMcpListStdout = JSON.stringify([
      {
        name: "local_stdio",
        enabled: true,
        transport: {
          type: "stdio",
          command: "node",
          args: ["stdio.js"],
          env: { LOCAL: "1" },
        },
        auth_status: "unsupported",
      },
      {
        name: "remote_http",
        enabled: true,
        transport: {
          type: "streamable_http",
          url: "https://api.example.com/mcp",
          bearer_token_env_var: "CODEX_REMOTE_TOKEN",
        },
        auth_status: "bearer_token",
      },
    ])

    const codexRuntime =
      await codexMcpConfig.resolveCodexMcpSnapshotForDesktopRun({
        projectPath,
        runtimeCwd: projectPath,
      })
    expect(codexCliCalls.at(-1)).toEqual({
      args: ["mcp", "list", "--json"],
      options: { cwd: projectPath },
    })
    expect(codexRuntime.mcpServersForSession).toContainEqual({
      name: "local_stdio",
      type: "stdio",
      command: "node",
      args: ["stdio.js"],
      env: [{ name: "LOCAL", value: "1" }],
    })
    expect(codexRuntime.mcpServersForSession).toContainEqual({
      name: "remote_http",
      type: "http",
      url: "https://api.example.com/mcp",
      headers: [{ name: "Authorization", value: "Bearer runtime-token" }],
    })
  })
})
