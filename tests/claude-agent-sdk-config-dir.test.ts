import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  clearClaudeAgentSdkIsolatedConfigDirCache,
  ensureClaudeAgentSdkIsolatedConfigDir,
  resolveClaudeAgentSdkIsolatedConfig,
} from "../src/main/lib/claude/agent-sdk-config-dir"
import {
  clearClaudeNativePluginStagingFailures,
  getClaudeNativePluginStagingFailure,
} from "../src/main/lib/claude/plugin-staging-state"

const roots: string[] = []

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "locus-claude-config-dir-"))
  roots.push(root)
  return root
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path)
    .then(() => true)
    .catch(() => false)
}

async function createHomeClaudeDir(root: string): Promise<string> {
  const homeDir = join(root, "home")
  const homeClaudeDir = join(homeDir, ".claude")
  await mkdir(join(homeClaudeDir, "skills"), { recursive: true })
  await mkdir(join(homeClaudeDir, "commands"), { recursive: true })
  await mkdir(join(homeClaudeDir, "agents"), { recursive: true })
  await mkdir(join(homeClaudeDir, "plugins"), { recursive: true })
  await writeFile(
    join(homeClaudeDir, "settings.json"),
    JSON.stringify(
      {
        includeCoAuthoredBy: false,
        enabledPlugins: ["market:allowed", "market:blocked"],
        approvedPluginMcpServers: [
          "market:allowed:server#mcp-sha256:allowed",
          "market:blocked:server#mcp-sha256:blocked",
        ],
        mcpServers: {
          plain: {
            type: "stdio",
            command: "node",
            args: ["plain-mcp.js"],
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  )
  return homeDir
}

beforeEach(() => {
  clearClaudeAgentSdkIsolatedConfigDirCache()
  clearClaudeNativePluginStagingFailures()
})

afterEach(async () => {
  clearClaudeAgentSdkIsolatedConfigDirCache()
  clearClaudeNativePluginStagingFailures()
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("Claude Agent SDK isolated config dir", () => {
  test("resolves normal runs by sub-chat and Ollama runs by chat", async () => {
    const userDataDir = join(await createRoot(), "user-data")

    expect(
      resolveClaudeAgentSdkIsolatedConfig({
        userDataDir,
        chatId: "chat-1",
        subChatId: "sub-1",
        isUsingOllama: false,
      }),
    ).toEqual({
      isolatedConfigDir: join(userDataDir, "claude-sessions", "sub-1"),
      cacheKey: "sub-1",
    })

    expect(
      resolveClaudeAgentSdkIsolatedConfig({
        userDataDir,
        chatId: "chat-1",
        subChatId: "sub-1",
        isUsingOllama: true,
      }),
    ).toEqual({
      isolatedConfigDir: join(userDataDir, "claude-sessions", "chat-1"),
      cacheKey: "chat-1",
    })
  })

  test("stages non-plugin Claude assets and writes empty plugin settings in safe mode", async () => {
    const root = await createRoot()
    const userDataDir = join(root, "user-data")
    const homeDir = await createHomeClaudeDir(root)
    const homeClaudeDir = join(homeDir, ".claude")
    await mkdir(join(homeClaudeDir, "skills", "regular-skill"), {
      recursive: true,
    })
    await writeFile(
      join(homeClaudeDir, "skills", "regular-skill", "SKILL.md"),
      "---\nname: regular-skill\ndescription: Regular skill.\n---\n",
      "utf-8",
    )
    await mkdir(
      join(homeClaudeDir, "skills", "unreviewed-plugin", ".claude-plugin"),
      { recursive: true },
    )
    await writeFile(
      join(
        homeClaudeDir,
        "skills",
        "unreviewed-plugin",
        ".claude-plugin",
        "plugin.json",
      ),
      JSON.stringify({
        name: "unreviewed-plugin",
        version: "0.0.0",
        skills: ["./"],
      }),
      "utf-8",
    )
    await writeFile(
      join(homeClaudeDir, "commands", "debug.md"),
      "---\ndescription: Debug command.\n---\n",
      "utf-8",
    )
    const isolatedConfig = resolveClaudeAgentSdkIsolatedConfig({
      userDataDir,
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
    })

    await mkdir(isolatedConfig.isolatedConfigDir, { recursive: true })
    await symlink(
      join(homeClaudeDir, "plugins"),
      join(isolatedConfig.isolatedConfigDir, "plugins"),
      "dir",
    )

    const result = await ensureClaudeAgentSdkIsolatedConfigDir({
      ...isolatedConfig,
      dependencies: {
        homeDir: () => homeDir,
        getPluginSafeModeState: async () => ({ enabled: true }),
        logger: { warn() {} },
      },
    })
    expect(result.nativePluginConfigs).toEqual([])

    await expect(
      readlink(
        join(isolatedConfig.isolatedConfigDir, "skills", "regular-skill"),
      ),
    ).resolves.toBe(join(homeClaudeDir, "skills", "regular-skill"))
    expect(
      await pathExists(
        join(isolatedConfig.isolatedConfigDir, "skills", "unreviewed-plugin"),
      ),
    ).toBe(false)
    await expect(
      readlink(join(isolatedConfig.isolatedConfigDir, "commands", "debug.md")),
    ).resolves.toBe(join(homeClaudeDir, "commands", "debug.md"))
    expect(await pathExists(join(isolatedConfig.isolatedConfigDir, "agents"))).toBe(
      true,
    )
    expect(
      await pathExists(join(isolatedConfig.isolatedConfigDir, "plugins")),
    ).toBe(false)
    await expect(
      readlink(join(isolatedConfig.isolatedConfigDir, "settings.json")),
    ).rejects.toThrow()
    await expect(
      readFile(
        join(isolatedConfig.isolatedConfigDir, "settings.json"),
        "utf-8",
      ).then((content) => JSON.parse(content)),
    ).resolves.toMatchObject({
      includeCoAuthoredBy: false,
      enabledPlugins: [],
      mcpServers: {
        plain: {
          type: "stdio",
          command: "node",
          args: ["plain-mcp.js"],
        },
      },
    })
  })

  test("stages only reviewed Claude plugins into isolated config", async () => {
    const root = await createRoot()
    const userDataDir = join(root, "user-data")
    const homeDir = await createHomeClaudeDir(root)
    const pluginSourcePath = join(root, "source-plugin")
    await mkdir(pluginSourcePath, { recursive: true })
    await writeFile(join(pluginSourcePath, "README.md"), "plugin\n", "utf-8")
    const isolatedConfig = resolveClaudeAgentSdkIsolatedConfig({
      userDataDir,
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
    })

    const result = await ensureClaudeAgentSdkIsolatedConfigDir({
      ...isolatedConfig,
      dependencies: {
        homeDir: () => homeDir,
        getPluginSafeModeState: async () => ({ enabled: false }),
        getClaudePluginStagingEntries: async () => [
          {
            pluginSource: "market:allowed",
            marketplace: "market",
            name: "allowed",
            version: "1.2.3",
            path: pluginSourcePath,
            description: "Allowed plugin",
            category: "test",
            homepage: "https://example.test",
            tags: ["one", "two"],
          },
        ],
        logger: { warn() {} },
      },
    })

    const settings = JSON.parse(
      await readFile(
        join(isolatedConfig.isolatedConfigDir, "settings.json"),
        "utf-8",
      ),
    )
    expect(settings).toMatchObject({
      includeCoAuthoredBy: false,
      enabledPlugins: ["market:allowed"],
      approvedPluginMcpServers: ["market:allowed:server#mcp-sha256:allowed"],
    })

    const stagedMarketplacePath = join(
      isolatedConfig.isolatedConfigDir,
      "plugins",
      "marketplaces",
      "market",
    )
    const marketplace = JSON.parse(
      await readFile(
        join(stagedMarketplacePath, ".claude-plugin", "marketplace.json"),
        "utf-8",
      ),
    )
    expect(marketplace).toEqual({
      name: "market",
      plugins: [
        {
          name: "allowed",
          version: "1.2.3",
          description: "Allowed plugin",
          source: join("plugins", "allowed"),
          category: "test",
          homepage: "https://example.test",
          tags: ["one", "two"],
        },
      ],
    })
    await expect(
      readlink(join(stagedMarketplacePath, "plugins", "allowed")),
    ).resolves.toBe(pluginSourcePath)
    expect(result.nativePluginConfigs).toEqual([
      {
        type: "local",
        path: join(stagedMarketplacePath, "plugins", "allowed"),
        skipMcpDiscovery: true,
      },
    ])
  })

  test("passes plugin scope context into Claude plugin staging", async () => {
    const root = await createRoot()
    const userDataDir = join(root, "user-data")
    const homeDir = await createHomeClaudeDir(root)
    const calls: unknown[] = []
    const isolatedConfig = resolveClaudeAgentSdkIsolatedConfig({
      userDataDir,
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
    })

    await ensureClaudeAgentSdkIsolatedConfigDir({
      ...isolatedConfig,
      pluginScopeContext: {
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-1",
      },
      dependencies: {
        homeDir: () => homeDir,
        getPluginSafeModeState: async () => ({ enabled: false }),
        getClaudePluginStagingEntries: async (scopeContext) => {
          calls.push(scopeContext)
          return []
        },
        logger: { warn() {} },
      },
    })

    expect(calls).toEqual([
      {
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-1",
      },
    ])
  })

  test("drops failed Claude plugin staging entries from isolated activation", async () => {
    const root = await createRoot()
    const userDataDir = join(root, "user-data")
    const homeDir = await createHomeClaudeDir(root)
    const pluginSourcePath = join(root, "source-plugin")
    await mkdir(pluginSourcePath, { recursive: true })
    const missingPluginSourcePath = join(root, "missing-plugin")
    const isolatedConfig = resolveClaudeAgentSdkIsolatedConfig({
      userDataDir,
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
    })

    const result = await ensureClaudeAgentSdkIsolatedConfigDir({
      ...isolatedConfig,
      dependencies: {
        homeDir: () => homeDir,
        getPluginSafeModeState: async () => ({ enabled: false }),
        getClaudePluginStagingEntries: async () => [
          {
            pluginSource: "market:allowed",
            marketplace: "market",
            name: "allowed",
            version: "1.2.3",
            path: pluginSourcePath,
          },
          {
            pluginSource: "market:blocked",
            marketplace: "market",
            name: "blocked",
            version: "1.2.3",
            path: missingPluginSourcePath,
          },
        ],
        logger: { warn() {} },
      },
    })

    const settings = JSON.parse(
      await readFile(
        join(isolatedConfig.isolatedConfigDir, "settings.json"),
        "utf-8",
      ),
    )
    expect(settings).toMatchObject({
      includeCoAuthoredBy: false,
      enabledPlugins: ["market:allowed"],
      approvedPluginMcpServers: ["market:allowed:server#mcp-sha256:allowed"],
    })

    const stagedMarketplacePath = join(
      isolatedConfig.isolatedConfigDir,
      "plugins",
      "marketplaces",
      "market",
    )
    const marketplace = JSON.parse(
      await readFile(
        join(stagedMarketplacePath, ".claude-plugin", "marketplace.json"),
        "utf-8",
      ),
    )
    expect(marketplace.plugins.map((plugin: { name: string }) => plugin.name)).toEqual([
      "allowed",
    ])
    await expect(
      readlink(join(stagedMarketplacePath, "plugins", "allowed")),
    ).resolves.toBe(pluginSourcePath)
    expect(
      await pathExists(join(stagedMarketplacePath, "plugins", "blocked")),
    ).toBe(false)
    expect(result.nativePluginConfigs).toEqual([
      {
        type: "local",
        path: join(stagedMarketplacePath, "plugins", "allowed"),
        skipMcpDiscovery: true,
      },
    ])
    expect(getClaudeNativePluginStagingFailure("market:allowed")).toBeUndefined()
    expect(getClaudeNativePluginStagingFailure("market:blocked")).toMatchObject({
      pluginSource: "market:blocked",
      marketplace: "market",
      name: "blocked",
      path: missingPluginSourcePath,
      reason: "source-missing",
    })
  })

  test("fails closed for sanitized Claude plugin staging path collisions", async () => {
    const root = await createRoot()
    const userDataDir = join(root, "user-data")
    const homeDir = await createHomeClaudeDir(root)
    const firstPluginSourcePath = join(root, "source-plugin-one")
    const secondPluginSourcePath = join(root, "source-plugin-two")
    await mkdir(firstPluginSourcePath, { recursive: true })
    await mkdir(secondPluginSourcePath, { recursive: true })
    const isolatedConfig = resolveClaudeAgentSdkIsolatedConfig({
      userDataDir,
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
    })

    const result = await ensureClaudeAgentSdkIsolatedConfigDir({
      ...isolatedConfig,
      dependencies: {
        homeDir: () => homeDir,
        getPluginSafeModeState: async () => ({ enabled: false }),
        getClaudePluginStagingEntries: async () => [
          {
            pluginSource: "market:allowed/a",
            marketplace: "market",
            name: "allowed/a",
            version: "1.2.3",
            path: firstPluginSourcePath,
          },
          {
            pluginSource: "market:allowed_a",
            marketplace: "market",
            name: "allowed_a",
            version: "1.2.3",
            path: secondPluginSourcePath,
          },
        ],
        logger: { warn() {} },
      },
    })

    const settings = JSON.parse(
      await readFile(
        join(isolatedConfig.isolatedConfigDir, "settings.json"),
        "utf-8",
      ),
    )
    expect(settings).toMatchObject({
      includeCoAuthoredBy: false,
      enabledPlugins: [],
    })
    expect(
      await pathExists(
        join(
          isolatedConfig.isolatedConfigDir,
          "plugins",
          "marketplaces",
          "market",
          ".claude-plugin",
          "marketplace.json",
        ),
      ),
    ).toBe(false)
    expect(result.nativePluginConfigs).toEqual([])
    expect(getClaudeNativePluginStagingFailure("market:allowed/a")).toMatchObject(
      {
        pluginSource: "market:allowed/a",
        reason: "stage-failed",
      },
    )
    expect(getClaudeNativePluginStagingFailure("market:allowed_a")).toMatchObject(
      {
        pluginSource: "market:allowed_a",
        reason: "stage-failed",
      },
    )
  })

  test("fails closed when previous Claude plugin staging cannot be removed", async () => {
    const root = await createRoot()
    const userDataDir = join(root, "user-data")
    const homeDir = await createHomeClaudeDir(root)
    const pluginSourcePath = join(root, "source-plugin")
    await mkdir(pluginSourcePath, { recursive: true })
    const isolatedConfig = resolveClaudeAgentSdkIsolatedConfig({
      userDataDir,
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
    })
    const pluginsTarget = join(isolatedConfig.isolatedConfigDir, "plugins")

    const result = await ensureClaudeAgentSdkIsolatedConfigDir({
      ...isolatedConfig,
      dependencies: {
        homeDir: () => homeDir,
        getPluginSafeModeState: async () => ({ enabled: false }),
        getClaudePluginStagingEntries: async () => [
          {
            pluginSource: "market:allowed",
            marketplace: "market",
            name: "allowed",
            version: "1.2.3",
            path: pluginSourcePath,
          },
        ],
        fs: {
          rm: async (targetPath, options) => {
            if (String(targetPath) === pluginsTarget) {
              throw new Error("locked plugin staging directory")
            }
            return rm(targetPath, options)
          },
        },
        logger: { warn() {} },
      },
    })

    const settings = JSON.parse(
      await readFile(
        join(isolatedConfig.isolatedConfigDir, "settings.json"),
        "utf-8",
      ),
    )
    expect(settings).toMatchObject({
      includeCoAuthoredBy: false,
      enabledPlugins: [],
    })
    expect(result.nativePluginConfigs).toEqual([])
    expect(getClaudeNativePluginStagingFailure("market:allowed")).toMatchObject({
      pluginSource: "market:allowed",
      reason: "stage-failed",
    })
  })
})
