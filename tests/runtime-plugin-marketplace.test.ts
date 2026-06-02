import { describe, expect, test } from "bun:test"
import {
  normalizeRuntimePluginStatus,
} from "../src/shared/runtime-plugin-marketplace"
import {
  buildRuntimePluginCommandEnv,
  getRuntimePluginMarketplaceSnapshot,
  parseClaudeMarketplaceList,
  parseClaudePluginJson,
  parseCodexMarketplaceList,
  parseCodexPluginList,
  redactRuntimeMarketplaceText,
  runRuntimePluginCommand,
  type RuntimeCommandRunner,
} from "../src/main/lib/plugins/runtime-marketplace"

const CODEX_MARKETPLACES = `MARKETPLACE             ROOT
openai-primary-runtime  /Users/me/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime
openai-bundled          /Users/me/.codex/.tmp/bundled-marketplaces/openai-bundled
openai-curated          /Users/me/.codex/.tmp/plugins
`

const CODEX_PLUGINS = `Marketplace \`openai-bundled\`
/Users/me/.codex/.tmp/bundled-marketplaces/openai-bundled/.agents/plugins/marketplace.json

PLUGIN                       STATUS              VERSION       PATH
browser@openai-bundled       installed, enabled  26.527.60818  /Users/me/.codex/.tmp/bundled-marketplaces/openai-bundled/plugins/browser
computer-use@openai-bundled  installed, enabled  1.0.799       /Users/me/.codex/.tmp/bundled-marketplaces/openai-bundled/plugins/computer-use
latex@openai-bundled         not installed                     /Users/me/.codex/.tmp/bundled-marketplaces/openai-bundled/plugins/latex
`

describe("runtime plugin marketplace adapters", () => {
  test("normalizes runtime plugin status text", () => {
    expect(normalizeRuntimePluginStatus("installed, enabled")).toEqual({
      status: "installed-enabled",
      installed: true,
      enabled: true,
    })
    expect(normalizeRuntimePluginStatus("installed, disabled")).toEqual({
      status: "installed-disabled",
      installed: true,
      enabled: false,
    })
    expect(normalizeRuntimePluginStatus("not installed")).toEqual({
      status: "not-installed",
      installed: false,
      enabled: false,
    })
  })

  test("parses Codex marketplace table output", () => {
    const parsed = parseCodexMarketplaceList(CODEX_MARKETPLACES)

    expect(parsed.diagnostics).toEqual([])
    expect(parsed.marketplaces).toHaveLength(3)
    expect(parsed.marketplaces[0]).toMatchObject({
      runtime: "codex",
      name: "openai-primary-runtime",
      sourceKind: "runtime-cli",
      trust: "local",
      status: "available",
      path: "/Users/me/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime",
    })
  })

  test("parses Codex empty marketplace output as a non-targetable empty state", () => {
    expect(parseCodexMarketplaceList("No plugin marketplaces in scope.\n")).toEqual({
      marketplaces: [{
        runtime: "codex",
        name: "No plugin marketplaces in scope.",
        targetable: false,
        sourceKind: "runtime-cli",
        trust: "external",
        status: "empty",
        pluginCount: 0,
        diagnostics: [],
      }],
      diagnostics: [],
    })
  })

  test("parses Codex plugin list table output with installed and available rows", () => {
    const parsed = parseCodexPluginList(CODEX_PLUGINS)

    expect(parsed.diagnostics).toEqual([])
    expect(parsed.plugins).toEqual([
      expect.objectContaining({
        runtime: "codex",
        id: "browser@openai-bundled",
        marketplace: "openai-bundled",
        name: "browser",
        status: "installed-enabled",
        installed: true,
        enabled: true,
        version: "26.527.60818",
      }),
      expect.objectContaining({
        id: "computer-use@openai-bundled",
        status: "installed-enabled",
        version: "1.0.799",
      }),
      expect.objectContaining({
        id: "latex@openai-bundled",
        status: "not-installed",
        installed: false,
        enabled: false,
        version: undefined,
        path: "/Users/me/.codex/.tmp/bundled-marketplaces/openai-bundled/plugins/latex",
      }),
    ])
  })

  test("parses Claude marketplace empty output", () => {
    expect(parseClaudeMarketplaceList("No marketplaces configured\n")).toEqual({
      marketplaces: [],
      diagnostics: [],
    })
    expect(parseClaudeMarketplaceList("[]\n")).toEqual({
      marketplaces: [],
      diagnostics: [],
    })
    expect(parseClaudeMarketplaceList(JSON.stringify([{
      name: "team",
      source: "anthropic/plugins",
      pluginCount: 2,
    }])).marketplaces[0]).toMatchObject({
      runtime: "claude",
      name: "team",
      source: "anthropic/plugins",
      sourceKind: "runtime-cli",
      trust: "external",
      pluginCount: 2,
    })
  })

  test("treats Codex empty marketplace output as a successful empty listing", () => {
    expect(parseCodexPluginList("No plugins found in marketplace debug\n")).toEqual({
      plugins: [],
      diagnostics: [],
    })
  })

  test("parses Claude plugin JSON arrays and object buckets", () => {
    const installed = parseClaudePluginJson(JSON.stringify([{
      name: "repo-tools",
      marketplace: "team",
      version: "1.0.0",
      status: "installed, enabled",
      enabled: true,
      scope: "user",
      path: "/Users/me/.claude/plugins/repo-tools",
      skillCount: 2,
      mcpServerCount: 1,
      hookCount: 3,
    }]), "installed")
    const available = parseClaudePluginJson(JSON.stringify({
      available: [{
        name: "review-tools",
        marketplace: "team",
        version: "1.1.0",
        source: "team/review-tools",
      }],
    }), "available")

    expect(installed.diagnostics).toEqual([])
    expect(installed.plugins[0]).toMatchObject({
      runtime: "claude",
      id: "repo-tools@team",
      status: "installed-enabled",
      installed: true,
      enabled: true,
      scope: "user",
      componentSummary: {
        skills: 2,
        mcpServers: 1,
        hooks: 3,
      },
    })
    expect(available.plugins[0]).toMatchObject({
      runtime: "claude",
      id: "review-tools@team",
      status: "not-installed",
      installed: false,
      source: "team/review-tools",
    })
  })

  test("reports parse diagnostics for unsupported Claude JSON", () => {
    const parsed = parseClaudePluginJson("{not json", "available")

    expect(parsed.plugins).toEqual([])
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: "runtime-cli-parse-failed",
      severity: "warning",
      runtime: "claude",
    }))
  })

  test("reports CLI unavailable and timeout diagnostics without throwing", async () => {
    const missing = await runRuntimePluginCommand("codex", ["plugin", "list"], {
      runner: async () => {
        const error = Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" })
        throw error
      },
    })
    const timeout = await runRuntimePluginCommand("claude", ["plugin", "list", "--json"], {
      runner: async () => {
        const error = Object.assign(new Error("Command timed out"), {
          killed: true,
          signal: "SIGTERM",
        })
        throw error
      },
    })

    expect(missing.diagnostics).toContainEqual(expect.objectContaining({
      code: "runtime-cli-unavailable",
      runtime: "codex",
      command: "codex plugin list",
    }))
    expect(timeout.diagnostics).toContainEqual(expect.objectContaining({
      code: "runtime-cli-timeout",
      runtime: "claude",
      command: "claude plugin list --json",
    }))
  })

  test("passes only a minimal non-secret environment to runtime plugin reads", () => {
    const env = buildRuntimePluginCommandEnv({
      HOME: "/Users/me",
      PATH: "/usr/bin",
      CODEX_HOME: "/Users/me/.codex",
      OPENAI_API_KEY: "sk-secretsecret",
      ANTHROPIC_AUTH_TOKEN: "secret-token",
      GITHUB_TOKEN: "ghp_secret",
      FORCE_COLOR: "1",
    })

    expect(env).toMatchObject({
      HOME: "/Users/me",
      PATH: "/usr/bin",
      CODEX_HOME: "/Users/me/.codex",
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    })
    expect(env).not.toHaveProperty("OPENAI_API_KEY")
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN")
    expect(env).not.toHaveProperty("GITHUB_TOKEN")
  })

  test("redacts runtime output and returns generic command failure diagnostics", async () => {
    expect(redactRuntimeMarketplaceText(
      "https://user:password@example.com/plugins?token=sk-secretsecret Bearer abc.def OPENAI_API_KEY=sk-secretsecret ghp_secretsecret",
    )).not.toContain("password")
    expect(redactRuntimeMarketplaceText("ghp_secretsecret")).not.toContain("ghp_secretsecret")

    const parsed = parseClaudePluginJson(JSON.stringify([{
      name: "secret-source",
      marketplace: "team",
      source: "https://user:password@example.com/plugins?access_token=sk-secretsecret",
    }]), "available")
    expect(JSON.stringify(parsed)).not.toContain("password")
    expect(JSON.stringify(parsed)).not.toContain("sk-secretsecret")

    const failed = await runRuntimePluginCommand("codex", ["plugin", "list"], {
      runner: async () => {
        throw new Error("failed with OPENAI_API_KEY=sk-secretsecret and Bearer abc.def")
      },
    })
    expect(failed.diagnostics).toContainEqual(expect.objectContaining({
      code: "runtime-cli-error",
      message: "Runtime CLI marketplace read failed.",
    }))
    expect(JSON.stringify(failed)).not.toContain("sk-secretsecret")
    expect(JSON.stringify(failed)).not.toContain("Bearer abc.def")
  })

  test("builds a Codex snapshot through injected read-only commands", async () => {
    const runner: RuntimeCommandRunner = async (_command, args) => {
      const text = args.join(" ")
      if (text === "plugin marketplace list") {
        return { stdout: CODEX_MARKETPLACES, stderr: "" }
      }
      if (text === "plugin list") {
        return { stdout: CODEX_PLUGINS, stderr: "" }
      }
      throw new Error(`unexpected command: ${text}`)
    }

    const snapshot = await getRuntimePluginMarketplaceSnapshot("codex", {
      runner,
      now: new Date("2026-06-03T00:00:00Z"),
    })

    expect(snapshot).toMatchObject({
      runtime: "codex",
      refreshedAt: "2026-06-03T00:00:00.000Z",
    })
    expect(snapshot.marketplaces).toHaveLength(3)
    expect(snapshot.plugins).toHaveLength(3)
    expect(snapshot.diagnostics).toEqual([])
  })

  test("builds a Claude snapshot through injected JSON commands", async () => {
    const runner: RuntimeCommandRunner = async (_command, args) => {
      const text = args.join(" ")
      if (text === "plugin marketplace list --json") {
        return {
          stdout: JSON.stringify([{ name: "team", source: "anthropic/plugins" }]),
          stderr: "",
        }
      }
      if (text === "plugin list --json") {
        return {
          stdout: JSON.stringify([{
            name: "repo-tools",
            marketplace: "team",
            version: "1.0.0",
            status: "installed, enabled",
            enabled: true,
          }]),
          stderr: "",
        }
      }
      if (text === "plugin list --available --json") {
        return {
          stdout: JSON.stringify({
            available: [{ name: "review-tools", marketplace: "team" }],
          }),
          stderr: "",
        }
      }
      throw new Error(`unexpected command: ${text}`)
    }

    const snapshot = await getRuntimePluginMarketplaceSnapshot("claude", {
      runner,
      now: new Date("2026-06-03T00:00:00Z"),
    })

    expect(snapshot.marketplaces).toHaveLength(1)
    expect(snapshot.plugins).toEqual([
      expect.objectContaining({
        id: "repo-tools@team",
        status: "installed-enabled",
      }),
      expect.objectContaining({
        id: "review-tools@team",
        status: "not-installed",
      }),
    ])
    expect(snapshot.diagnostics).toEqual([])
  })
})
