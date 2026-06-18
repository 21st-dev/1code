import { describe, expect, test } from "bun:test"
import {
  buildCodexAppServerPluginConfigOverrides,
  getCodexAppServerPluginId,
} from "../src/main/lib/codex/app-server-plugin-config"

describe("Codex app-server plugin config", () => {
  test("maps Locus Codex plugin sources to app-server plugin ids", () => {
    expect(
      getCodexAppServerPluginId({
        runtime: "codex",
        marketplace: "openai-curated",
        source: "openai-curated:figma@7118aaa3",
      }),
    ).toBe("figma@openai-curated")

    expect(
      getCodexAppServerPluginId({
        runtime: "codex",
        marketplace: "openai-primary-runtime",
        source: "openai-primary-runtime:spreadsheets@26.614.11602",
      }),
    ).toBe("spreadsheets@openai-primary-runtime")

    expect(
      getCodexAppServerPluginId({
        runtime: "claude",
        marketplace: "team",
        source: "team:figma",
      }),
    ).toBeUndefined()
  })

  test("builds deterministic per-thread allowlist overrides for known Codex plugins", () => {
    const result = buildCodexAppServerPluginConfigOverrides({
      plugins: [
        {
          runtime: "codex",
          marketplace: "openai-curated",
          source: "openai-curated:figma@7118aaa3",
        },
        {
          runtime: "codex",
          marketplace: "openai-curated",
          source: "openai-curated:github@7118aaa3",
        },
        {
          runtime: "claude",
          marketplace: "team",
          source: "team:figma",
        },
      ],
      allowedPluginSources: ["openai-curated:figma@7118aaa3"],
    })

    expect(result).toEqual({
      entries: [
        {
          pluginId: "figma@openai-curated",
          pluginSource: "openai-curated:figma@7118aaa3",
          enabled: true,
        },
        {
          pluginId: "github@openai-curated",
          pluginSource: "openai-curated:github@7118aaa3",
          enabled: false,
        },
      ],
      config: {
        "plugins.figma@openai-curated.enabled": true,
        "plugins.github@openai-curated.enabled": false,
      },
    })
  })

  test("keeps duplicate plugin ids enabled when any discovered source is allowed", () => {
    const result = buildCodexAppServerPluginConfigOverrides({
      plugins: [
        {
          runtime: "codex",
          marketplace: "openai-curated",
          source: "openai-curated:figma@old",
        },
        {
          runtime: "codex",
          marketplace: "openai-curated",
          source: "openai-curated:figma@new",
        },
      ],
      allowedPluginSources: ["openai-curated:figma@new"],
    })

    expect(result.config).toEqual({
      "plugins.figma@openai-curated.enabled": true,
    })
    expect(result.entries).toEqual([
      {
        pluginId: "figma@openai-curated",
        pluginSource: "openai-curated:figma@new",
        enabled: true,
      },
    ])
  })
})
