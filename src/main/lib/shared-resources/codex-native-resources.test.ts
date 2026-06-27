import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { collectCodexNativeResources } from "./codex-native-resources"
import { buildGovernedResourceProjection } from "./governance"

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "onecode-codex-resources-"))
}

function writeFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, "utf-8")
}

describe("collectCodexNativeResources", () => {
  test("discovers Codex user skills, plugin manifests, and plugin skills as native resources", async () => {
    const root = makeTempRoot()
    try {
      const codexRoot = path.join(root, ".codex")
      const pluginRoot = path.join(
        codexRoot,
        "plugins",
        "cache",
        "openai-bundled",
        "record-and-replay",
        "1.0.829",
      )
      const inlinePluginRoot = path.join(
        codexRoot,
        "plugins",
        "cache",
        "personal",
        "inline-mcp",
        "0.1.0",
      )
      const codexCacheRoot = path.join(codexRoot, "cache")

      writeFile(
        path.join(codexRoot, "skills", ".system", "imagegen", "SKILL.md"),
        `---\nname: imagegen\ndescription: Generate images.\n---\n\n# Imagegen\n`,
      )
      writeFile(path.join(codexRoot, "config.toml"), `model = "gpt-5.5"\n`)
      writeFile(path.join(codexRoot, "browser", "config.toml"), `enabled = true\n`)
      writeFile(path.join(codexRoot, "auth.json"), JSON.stringify({ redacted: true }))
      writeFile(path.join(codexRoot, "hooks.json"), JSON.stringify({ Stop: [] }))
      writeFile(
        path.join(codexRoot, "automations", "parity-loop", "automation.toml"),
        [
          `version = 1`,
          `id = "parity-loop"`,
          `kind = "cron"`,
          `name = "Parity Loop"`,
          `prompt = "Check parity"`,
          `status = "ACTIVE"`,
          `rrule = "FREQ=HOURLY;INTERVAL=1"`,
          `model = "moss-default"`,
          `engine = "hermes"`,
          `reasoning_effort = "high"`,
          `execution_environment = "worktree"`,
          `updated_at = 1800000000000`,
        ].join("\n"),
      )
      writeFile(
        path.join(pluginRoot, ".codex-plugin", "plugin.json"),
        JSON.stringify(
          {
            name: "record-and-replay",
            version: "1.0.829",
            description: "Record what I'm doing on my Mac",
            skills: "./skills/",
            mcpServers: "./.mcp.json",
            apps: "./.app.json",
            interface: {
              displayName: "Record & Replay",
              shortDescription: "Record workflows",
              category: "Productivity",
              capabilities: ["Read", "Write"],
            },
          },
          null,
          2,
        ),
      )
      writeFile(
        path.join(pluginRoot, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            event_stream: {
              command: "event-stream",
              args: ["mcp"],
              cwd: ".",
              env: { RECORD_TOKEN: "redacted" },
              approved: true,
            },
          },
        }),
      )
      writeFile(
        path.join(pluginRoot, ".app.json"),
        JSON.stringify({ apps: { replay: { id: "connector_replay", required: true } } }),
      )
      writeFile(
        path.join(pluginRoot, "skills", "record-workflow", "SKILL.md"),
        `---\nname: record-workflow\ndescription: Turn recordings into skills.\n---\n\n# Record\n`,
      )
      writeFile(
        path.join(pluginRoot, "skills", "nested", "review", "SKILL.md"),
        `# Nested review\n`,
      )
      writeFile(
        path.join(inlinePluginRoot, ".codex-plugin", "plugin.json"),
        JSON.stringify(
          {
            name: "inline-mcp",
            version: "0.1.0",
            mcpServers: {
              inline_server: {
                url: "http://127.0.0.1:1234/mcp",
                description: "Inline MCP server",
                approved: true,
              },
            },
            interface: {
              displayName: "Inline MCP",
              shortDescription: "Inline plugin MCP server",
            },
          },
          null,
          2,
        ),
      )
      writeFile(
        path.join(codexCacheRoot, "codex_app_directory", "directory.json"),
        JSON.stringify({
          schema_version: 1,
          connectors: [
            {
              id: "connector_demo",
              name: "Demo Connector",
              description: "Use the demo connector.",
              distributionChannel: "ECOSYSTEM_DIRECTORY",
              labels: { interactive: "true", consequential: "false" },
              installUrl: "https://chatgpt.com/apps/demo/connector_demo",
              isAccessible: true,
              isEnabled: true,
              pluginDisplayNames: ["Demo Plugin"],
              appMetadata: {
                review: { status: "APPROVED" },
                categories: ["DEVELOPER_TOOLS"],
                developer: "Demo Inc",
                version: "1.2.3",
              },
            },
          ],
        }),
      )
      writeFile(
        path.join(codexCacheRoot, "codex_apps_server_info", "server.json"),
        JSON.stringify({
          schema_version: 1,
          server_info: {
            name: "codex-connectors-mcp",
            version: "0.1.0",
          },
        }),
      )
      writeFile(
        path.join(codexCacheRoot, "codex_apps_tools", "tools.json"),
        JSON.stringify({
          schema_version: 3,
          tools: [
            {
              server_name: "codex_apps",
              supports_parallel_tool_calls: false,
              tool_name: "search_demo",
              tool_namespace: "codex_apps__demo",
              namespace_description: "Demo tools",
              connector_id: "connector_demo",
              connector_name: "Demo Connector",
              plugin_display_names: ["Demo Plugin"],
              tool: {
                title: "search_demo",
                description: "Search demo data.",
                annotations: { readOnlyHint: true },
                _meta: {
                  resource_name: "Demo_search_demo",
                  connector_id: "connector_demo",
                  connector_name: "Demo Connector",
                  connector_description: "Use the demo connector.",
                  link_id: "link_demo",
                  _codex_apps: {
                    resource_uri: "/connector_demo/search_demo",
                    contains_mcp_source: false,
                  },
                },
              },
            },
          ],
        }),
      )
      writeFile(
        path.join(codexCacheRoot, "remote_plugin_catalog", "catalog.json"),
        JSON.stringify({
          schema_version: 1,
          plugins: [
            {
              id: "plugin_demo",
              name: "demo",
              discoverability: "LISTED",
              installation_policy: "AVAILABLE",
              authentication_policy: "ON_INSTALL",
              status: "AVAILABLE",
              release: {
                version: "1.0.0",
                display_name: "Demo Plugin",
                description: "Demo app plugin.",
                app_manifest: {
                  apps: {
                    demo: { id: "asdk_demo", required: true },
                  },
                },
                interface: {
                  short_description: "Demo app",
                  category: "Developer Tools",
                  developer_name: "Demo Inc",
                  default_prompt: "Search demo data.",
                },
              },
            },
          ],
        }),
      )

      const resources = await collectCodexNativeResources({
        codexRoot,
        pluginCacheRoot: path.join(codexRoot, "plugins", "cache"),
        codexCacheRoot,
      })

      expect(resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "skill:codex:user:.system/imagegen",
            kind: "skill",
            name: "imagegen",
            scope: "user",
            engine: "codex",
            metadata: expect.objectContaining({
              codexResourceRole: "user-skill",
              relativeDir: ".system/imagegen",
            }),
          }),
          expect.objectContaining({
            id: "codex:config:config",
            kind: "config",
            name: "Codex config.toml",
            scope: "engine",
            engine: "codex",
            metadata: expect.objectContaining({
              codexResourceRole: "config",
            }),
          }),
          expect.objectContaining({
            id: "codex:provider:auth",
            kind: "provider",
            name: "Codex auth.json",
            metadata: expect.objectContaining({
              codexResourceRole: "auth",
              containsSecrets: true,
            }),
          }),
          expect.objectContaining({
            id: "codex:hook:hooks",
            kind: "hook",
            name: "Codex hooks.json",
            metadata: expect.objectContaining({
              codexResourceRole: "hooks",
            }),
          }),
          expect.objectContaining({
            id: "codex:automation:parity-loop",
            kind: "automation",
            name: "Parity Loop",
            metadata: expect.objectContaining({
              codexResourceRole: "automation",
              rrule: "FREQ=HOURLY;INTERVAL=1",
              updatedAt: 1800000000000,
            }),
          }),
          expect.objectContaining({
            id: "codex:connector:connector_demo",
            kind: "connector",
            name: "Demo Connector",
            metadata: expect.objectContaining({
              codexResourceRole: "connector",
              isAccessible: true,
              labels: { interactive: "true", consequential: "false" },
            }),
          }),
          expect.objectContaining({
            id: "codex:tool:codex_apps__demo:search_demo:connector_demo",
            kind: "tool",
            name: "search_demo",
            metadata: expect.objectContaining({
              codexResourceRole: "codex-app-tool",
              connectorId: "connector_demo",
              resourceUri: "/connector_demo/search_demo",
            }),
          }),
          expect.objectContaining({
            id: "codex:app:asdk_demo",
            kind: "app",
            name: "Demo Plugin / demo",
            metadata: expect.objectContaining({
              codexResourceRole: "remote-plugin-app",
              authenticationPolicy: "ON_INSTALL",
            }),
          }),
          expect.objectContaining({
            id: "codex:app:plugin:codex:openai-bundled:record-and-replay:replay",
            kind: "app",
            name: "replay",
            scope: "plugin",
            pluginSource: "codex:openai-bundled:record-and-replay",
            metadata: expect.objectContaining({
              codexResourceRole: "plugin-app",
              appId: "connector_replay",
              required: true,
            }),
          }),
          expect.objectContaining({
            id: "codex:mcp:plugin:codex:openai-bundled:record-and-replay:event_stream",
            kind: "mcp",
            name: "event_stream",
            scope: "plugin",
            engine: "codex",
            pluginSource: "codex:openai-bundled:record-and-replay",
            path: path.join(pluginRoot, ".mcp.json"),
            metadata: expect.objectContaining({
              codexResourceRole: "plugin-mcp-server",
              serverName: "event_stream",
              pluginName: "Record & Replay",
              pluginVersion: "1.0.829",
              transport: "stdio",
              command: "event-stream",
              args: ["mcp"],
              cwd: ".",
              hasEnv: true,
              envKeys: ["RECORD_TOKEN"],
              approved: true,
              manifestPath: path.join(pluginRoot, ".mcp.json"),
            }),
          }),
          expect.objectContaining({
            id: "codex:mcp:plugin:codex:personal:inline-mcp:inline_server",
            kind: "mcp",
            name: "inline_server",
            scope: "plugin",
            engine: "codex",
            pluginSource: "codex:personal:inline-mcp",
            path: path.join(inlinePluginRoot, ".codex-plugin", "plugin.json"),
            metadata: expect.objectContaining({
              codexResourceRole: "plugin-mcp-server",
              pluginName: "Inline MCP",
              pluginVersion: "0.1.0",
              transport: "http",
              url: "http://127.0.0.1:1234/mcp",
              approved: true,
              manifestPath: path.join(inlinePluginRoot, ".codex-plugin", "plugin.json"),
            }),
          }),
          expect.objectContaining({
            id: "plugin:codex:openai-bundled:record-and-replay",
            kind: "plugin",
            name: "Record & Replay",
            scope: "plugin",
            engine: "codex",
            metadata: expect.objectContaining({
              codexResourceRole: "plugin-manifest",
              mcpManifestPath: path.join(pluginRoot, ".mcp.json"),
            }),
          }),
          expect.objectContaining({
            id: "skill:codex:plugin:codex:openai-bundled:record-and-replay:record-workflow",
            kind: "skill",
            name: "record-workflow",
            scope: "plugin",
            engine: "codex",
            pluginSource: "codex:openai-bundled:record-and-replay",
            metadata: expect.objectContaining({
              codexResourceRole: "plugin-skill",
              pluginName: "Record & Replay",
            }),
          }),
          expect.objectContaining({
            id: "skill:codex:plugin:codex:openai-bundled:record-and-replay:nested/review",
            name: "nested/review",
          }),
        ]),
      )

      const governed = buildGovernedResourceProjection({ resources })
      const codexProjection = governed.projections.find(
        (projection) => projection.engineId === "codex",
      )
      expect(codexProjection?.mappings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            resourceId: "skill:codex:user:.system/imagegen",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "plugin:codex:openai-bundled:record-and-replay",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:config:config",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:provider:auth",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:hook:hooks",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:automation:parity-loop",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:connector:connector_demo",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:tool:codex_apps__demo:search_demo:connector_demo",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:app:asdk_demo",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:app:plugin:codex:openai-bundled:record-and-replay:replay",
            action: "native",
          }),
          expect.objectContaining({
            resourceId: "codex:mcp:plugin:codex:openai-bundled:record-and-replay:event_stream",
            action: "native",
            targetPath: path.join(pluginRoot, ".mcp.json"),
          }),
          expect.objectContaining({
            resourceId: "codex:mcp:plugin:codex:personal:inline-mcp:inline_server",
            action: "native",
            targetPath: path.join(inlinePluginRoot, ".codex-plugin", "plugin.json"),
          }),
          expect.objectContaining({
            resourceId:
              "skill:codex:plugin:codex:openai-bundled:record-and-replay:record-workflow",
            action: "native",
          }),
        ]),
      )
      expect(
        governed.resources.find(
          (resource) =>
            resource.id ===
            "skill:codex:plugin:codex:openai-bundled:record-and-replay:record-workflow",
        )?.provenance?.discoveredBy,
      ).toBe("Codex plugin cache skill")
      const governedPluginMcp = governed.resources.find(
        (resource) =>
          resource.id ===
          "codex:mcp:plugin:codex:openai-bundled:record-and-replay:event_stream",
      )
      expect(governedPluginMcp?.approval).toMatchObject({
        required: true,
        approved: true,
      })
      expect(governedPluginMcp?.provenance).toMatchObject({
        source: "plugin",
        sourceId: "codex:openai-bundled:record-and-replay",
        engine: "codex",
        displayPath: path.join(pluginRoot, ".mcp.json"),
        discoveredBy: "Codex plugin MCP manifest",
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
