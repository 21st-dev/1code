import { afterEach, describe, expect, test } from "bun:test"
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildCodexAppServerPluginConfigToml,
  prepareCodexAppServerIsolatedPluginHome,
  resolveCodexAppServerIsolatedPluginHome,
} from "../src/main/lib/codex/app-server-plugin-home"
import type { CodexAppServerResolvedPluginConfigEntry } from "../src/main/lib/codex/app-server-plugin-config"

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "locus-codex-plugin-home-"))
  tempRoots.push(root)
  return root
}

function allowedEntry(input: {
  pluginId: string
  pluginSource: string
  pluginPath: string
  marketplace: string
  name: string
  version: string
}): CodexAppServerResolvedPluginConfigEntry {
  return {
    pluginId: input.pluginId,
    pluginSource: input.pluginSource,
    enabled: true,
    pluginPath: input.pluginPath,
    cacheCoordinates: {
      marketplace: input.marketplace,
      name: input.name,
      version: input.version,
    },
    nativeActivationPolicy: {
      status: "allowed",
      canActivateNative: true,
      identityStatus: "reviewed",
      reasons: [],
    },
  }
}

function blockedEntry(input: {
  pluginId: string
  pluginSource: string
  pluginPath?: string
}): CodexAppServerResolvedPluginConfigEntry {
  return {
    pluginId: input.pluginId,
    pluginSource: input.pluginSource,
    enabled: false,
    pluginPath: input.pluginPath,
    nativeActivationPolicy: {
      status: "blocked",
      canActivateNative: false,
      identityStatus: "reviewed",
      reasons: ["plugin-disabled"],
    },
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false)
}

describe("Codex app-server isolated plugin home", () => {
  test("stages only enabled reviewed plugins into an isolated CODEX_HOME", async () => {
    const root = await createTempRoot()
    const userDataDir = join(root, "user-data")
    const sourceCodexHome = join(root, "source-codex-home")
    const pluginSource = join(
      root,
      "global-cache",
      "openai-curated",
      "figma",
      "7118aaa3",
    )
    await mkdir(join(pluginSource, ".codex-plugin"), { recursive: true })
    await writeFile(
      join(pluginSource, ".codex-plugin", "plugin.json"),
      "{}",
      "utf-8",
    )
    await mkdir(sourceCodexHome, { recursive: true })
    await writeFile(
      join(sourceCodexHome, "auth.json"),
      '{"account":"test"}\n',
      "utf-8",
    )
    await writeFile(
      join(sourceCodexHome, "config.toml"),
      '[plugins."global@openai-curated"]\nenabled = true\n',
      "utf-8",
    )

    const isolated = resolveCodexAppServerIsolatedPluginHome({
      userDataDir,
      chatId: "chat-1",
      subChatId: "sub-1",
    })
    const stalePlugin = join(
      isolated.codexHome,
      "plugins",
      "cache",
      "stale-market",
      "stale",
      "old",
    )
    await mkdir(stalePlugin, { recursive: true })

    const result = await prepareCodexAppServerIsolatedPluginHome({
      chatId: "chat-1",
      subChatId: "sub-1",
      runtimeEnv: { CODEX_HOME: sourceCodexHome, HOME: root },
      pluginConfig: {
        config: {
          "plugins.figma@openai-curated.enabled": true,
          "plugins.github@openai-curated.enabled": false,
        },
        entries: [
          allowedEntry({
            pluginId: "figma@openai-curated",
            pluginSource: "openai-curated:figma@7118aaa3",
            pluginPath: pluginSource,
            marketplace: "openai-curated",
            name: "figma",
            version: "7118aaa3",
          }),
          blockedEntry({
            pluginId: "github@openai-curated",
            pluginSource: "openai-curated:github@7118aaa3",
          }),
        ],
      },
      dependencies: {
        userDataDir: () => userDataDir,
        logger: { warn: () => {} },
      },
    })

    const stagedPath = join(
      result.codexHome,
      "plugins",
      "cache",
      "openai-curated",
      "figma",
      "7118aaa3",
    )
    expect(result.runtimeEnv.CODEX_HOME).toBe(isolated.codexHome)
    expect(result.pluginConfigOverrides).toEqual({
      "plugins.figma@openai-curated.enabled": true,
      "plugins.github@openai-curated.enabled": false,
    })
    expect(result.stagedEntries).toEqual([
      {
        pluginId: "figma@openai-curated",
        pluginSource: "openai-curated:figma@7118aaa3",
        sourcePath: pluginSource,
        stagedPath,
      },
    ])
    expect(await lstat(stagedPath).then((entry) => entry.isSymbolicLink())).toBe(
      true,
    )
    expect(await readlink(stagedPath)).toBe(pluginSource)
    expect(await exists(stalePlugin)).toBe(false)
    expect(await readFile(join(result.codexHome, "auth.json"), "utf-8")).toBe(
      '{"account":"test"}\n',
    )
    const configToml = await readFile(
      join(result.codexHome, "config.toml"),
      "utf-8",
    )
    expect(configToml).toContain('[plugins."figma@openai-curated"]')
    expect(configToml).toContain('[plugins."github@openai-curated"]')
    expect(configToml).not.toContain("global@openai-curated")
  })

  test("fails closed when an enabled plugin has no safe cache coordinates", async () => {
    const root = await createTempRoot()
    const result = await prepareCodexAppServerIsolatedPluginHome({
      chatId: "chat/unsafe",
      runtimeEnv: { HOME: root },
      pluginConfig: {
        config: {
          "plugins.bad@openai-curated.enabled": true,
        },
        entries: [
          {
            ...allowedEntry({
              pluginId: "bad@openai-curated",
              pluginSource: "openai-curated:bad@7118aaa3",
              pluginPath: join(root, "bad"),
              marketplace: "openai-curated",
              name: "bad",
              version: "7118aaa3",
            }),
            cacheCoordinates: undefined,
          },
        ],
      },
      dependencies: {
        userDataDir: () => join(root, "user-data"),
        logger: { warn: () => {} },
      },
    })

    expect(result.runtimeEnv.CODEX_HOME).toContain("chat_unsafe")
    expect(result.pluginConfigOverrides).toEqual({
      "plugins.bad@openai-curated.enabled": false,
    })
    expect(result.stagedEntries).toEqual([])
    expect(result.blockedEntries).toEqual([
      {
        pluginId: "bad@openai-curated",
        pluginSource: "openai-curated:bad@7118aaa3",
        reason: "invalid-source",
      },
    ])
  })

  test("writes deterministic TOML plugin enablement", () => {
    expect(
      buildCodexAppServerPluginConfigToml({
        "plugins.zed@openai-curated.enabled": false,
        'plugins.fig"ma@openai-curated.enabled': true,
      }),
    ).toBe(
      [
        "# Managed by Locus. This file is rebuilt before each run.",
        "",
        '[plugins."fig\\"ma@openai-curated"]',
        "enabled = true",
        "",
        '[plugins."zed@openai-curated"]',
        "enabled = false",
        "",
      ].join("\n"),
    )
  })
})
