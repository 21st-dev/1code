import { beforeEach, describe, expect, test } from "bun:test"
import type { RuntimePluginMarketplaceSnapshot } from "../src/shared/runtime-plugin-marketplace"
import {
  buildRuntimePluginWriteCommand,
  buildRuntimePluginWriteCommandEnv,
  clearPendingRuntimePluginWritePreviews,
  executeRuntimePluginWriteAction,
  previewRuntimePluginWriteAction,
  type RuntimePluginWriteActionOptions,
} from "../src/main/lib/plugins/runtime-marketplace-actions"
import type { RuntimeCommandRunner } from "../src/main/lib/plugins/runtime-marketplace"

const CODEX_SNAPSHOT: RuntimePluginMarketplaceSnapshot = {
  runtime: "codex",
  marketplaces: [{
    runtime: "codex",
    name: "debug",
    source: "owner/debug",
    sourceKind: "runtime-cli",
    trust: "external",
    status: "available",
    diagnostics: [],
  }],
  plugins: [{
    runtime: "codex",
    id: "reviewer@debug",
    marketplace: "debug",
    name: "reviewer",
    status: "not-installed",
    installed: false,
    enabled: false,
    diagnostics: [],
  }],
  diagnostics: [],
  refreshedAt: "2026-06-03T00:00:00.000Z",
}

const CLAUDE_SNAPSHOT: RuntimePluginMarketplaceSnapshot = {
  runtime: "claude",
  marketplaces: [{
    runtime: "claude",
    name: "team",
    source: "anthropic/plugins",
    sourceKind: "runtime-cli",
    trust: "external",
    status: "available",
    diagnostics: [],
  }],
  plugins: [{
    runtime: "claude",
    id: "repo-tools@team",
    marketplace: "team",
    name: "repo-tools",
    version: "1.0.0",
    status: "installed-disabled",
    installed: true,
    enabled: false,
    diagnostics: [],
  }],
  diagnostics: [],
  refreshedAt: "2026-06-03T00:00:00.000Z",
}

describe("runtime plugin write actions", () => {
  beforeEach(() => {
    clearPendingRuntimePluginWritePreviews()
  })

  test("builds exact allowlisted argv for Codex and Claude runtime actions", () => {
    expect(buildRuntimePluginWriteCommand({
      runtime: "codex",
      action: "codex.plugin.add",
      target: { pluginId: "reviewer", marketplace: "debug" },
    })).toMatchObject({
      command: "codex",
      args: ["plugin", "add", "reviewer@debug"],
      destructive: false,
    })

    expect(buildRuntimePluginWriteCommand({
      runtime: "codex",
      action: "codex.marketplace.upgrade",
      target: { marketplace: "debug" },
    }).args).toEqual(["plugin", "marketplace", "upgrade", "debug"])

    expect(buildRuntimePluginWriteCommand({
      runtime: "claude",
      action: "claude.plugin.install",
      target: { pluginId: "repo-tools", marketplace: "team", scope: "project" },
    })).toMatchObject({
      command: "claude",
      args: ["plugin", "install", "repo-tools@team", "--scope", "project"],
      reloadHint: expect.stringContaining("/reload-plugins"),
    })
  })

  test("rejects runtime mismatches, all-updates, option-like selectors, and raw unsafe targets", () => {
    expect(() => buildRuntimePluginWriteCommand({
      runtime: "claude",
      action: "codex.plugin.add",
      target: { pluginId: "reviewer" },
    })).toThrow("does not match")

    expect(() => buildRuntimePluginWriteCommand({
      runtime: "codex",
      action: "codex.marketplace.upgrade",
      target: {},
    })).toThrow("missing marketplace")

    expect(() => buildRuntimePluginWriteCommand({
      runtime: "claude",
      action: "claude.plugin.install",
      target: { pluginId: "--all" },
    })).toThrow("invalid")

    expect(() => buildRuntimePluginWriteCommand({
      runtime: "claude",
      action: "claude.marketplace.add",
      target: { source: "../plugins" },
    })).toThrow("absolute path")

    expect(() => buildRuntimePluginWriteCommand({
      runtime: "codex",
      action: "codex.plugin.remove",
      target: { pluginId: "reviewer\nrm" },
    })).toThrow("invalid")
  })

  test("previews and executes through a one-time main-owned confirmation token", async () => {
    const calls: string[] = []
    const runner: RuntimeCommandRunner = async (_command, args) => {
      calls.push(args.join(" "))
      return { stdout: "installed", stderr: "" }
    }
    const options: RuntimePluginWriteActionOptions = {
      runner,
      safeModeEnabled: false,
      snapshotProvider: async () => CODEX_SNAPSHOT,
      now: new Date("2026-06-03T00:00:00Z"),
    }

    const preview = await previewRuntimePluginWriteAction({
      runtime: "codex",
      action: "codex.plugin.add",
      target: { pluginId: "reviewer", marketplace: "debug" },
    }, options)

    expect(preview).toMatchObject({
      canExecute: true,
      command: "codex",
      args: ["plugin", "add", "reviewer@debug"],
    })
    expect(typeof preview.confirmationToken).toBe("string")

    const result = await executeRuntimePluginWriteAction({
      previewId: preview.previewId,
      confirmationToken: preview.confirmationToken ?? "",
    }, options)

    expect(result.status).toBe("success")
    expect(calls).toEqual(["plugin add reviewer@debug"])
    await expect(executeRuntimePluginWriteAction({
      previewId: preview.previewId,
      confirmationToken: preview.confirmationToken ?? "",
    }, options)).rejects.toThrow("missing or already used")
  })

  test("requires exact target confirmation for destructive actions", async () => {
    const options: RuntimePluginWriteActionOptions = {
      runner: async () => ({ stdout: "removed", stderr: "" }),
      safeModeEnabled: false,
      snapshotProvider: async () => CLAUDE_SNAPSHOT,
      now: new Date("2026-06-03T00:00:00Z"),
    }
    const preview = await previewRuntimePluginWriteAction({
      runtime: "claude",
      action: "claude.plugin.uninstall",
      target: { pluginId: "repo-tools", marketplace: "team" },
    }, options)

    expect(preview.requiresTargetConfirmation).toBe(true)
    await expect(executeRuntimePluginWriteAction({
      previewId: preview.previewId,
      confirmationToken: preview.confirmationToken ?? "",
      targetConfirmation: "wrong",
    }, options)).rejects.toThrow("target confirmation")
  })

  test("rejects stale confirmations when runtime marketplace state changes", async () => {
    let snapshot = CODEX_SNAPSHOT
    const calls: string[] = []
    const preview = await previewRuntimePluginWriteAction({
      runtime: "codex",
      action: "codex.plugin.add",
      target: { pluginId: "reviewer", marketplace: "debug" },
    }, {
      safeModeEnabled: false,
      snapshotProvider: async () => snapshot,
      now: new Date("2026-06-03T00:00:00Z"),
    })
    snapshot = {
      ...CODEX_SNAPSHOT,
      plugins: [{ ...CODEX_SNAPSHOT.plugins[0], version: "2.0.0" }],
    }

    await expect(executeRuntimePluginWriteAction({
      previewId: preview.previewId,
      confirmationToken: preview.confirmationToken ?? "",
    }, {
      runner: async (_command, args) => {
        calls.push(args.join(" "))
        return { stdout: "installed", stderr: "" }
      },
      safeModeEnabled: false,
      snapshotProvider: async () => snapshot,
      now: new Date("2026-06-03T00:00:00Z"),
    })).rejects.toThrow("stale")
    expect(calls).toEqual([])
  })

  test("safe mode blocks plugin activation writes without blocking marketplace removal previews", async () => {
    const blocked = await previewRuntimePluginWriteAction({
      runtime: "claude",
      action: "claude.plugin.enable",
      target: { pluginId: "repo-tools", marketplace: "team" },
    }, {
      safeModeEnabled: true,
      snapshotProvider: async () => CLAUDE_SNAPSHOT,
      now: new Date("2026-06-03T00:00:00Z"),
    })

    expect(blocked.canExecute).toBe(false)
    expect(blocked.confirmationToken).toBeUndefined()
    expect(blocked.blockedReason).toContain("safe mode")

    const allowed = await previewRuntimePluginWriteAction({
      runtime: "claude",
      action: "claude.marketplace.remove",
      target: { marketplace: "team" },
    }, {
      safeModeEnabled: true,
      snapshotProvider: async () => CLAUDE_SNAPSHOT,
      now: new Date("2026-06-03T00:00:00Z"),
    })
    expect(allowed.canExecute).toBe(true)
  })

  test("uses minimal non-secret write env and redacts command output", async () => {
    const env = buildRuntimePluginWriteCommandEnv({
      HOME: "/Users/me",
      PATH: "/tmp/poisoned",
      CODEX_HOME: "/tmp/codex",
      OPENAI_API_KEY: "sk-secretsecret",
      ANTHROPIC_AUTH_TOKEN: "anthropic-secret",
      GITHUB_TOKEN: "ghp_secretsecret",
    })
    expect(env).toMatchObject({
      HOME: "/Users/me",
      CODEX_HOME: "/tmp/codex",
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    })
    expect(env).not.toHaveProperty("OPENAI_API_KEY")
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN")
    expect(env).not.toHaveProperty("GITHUB_TOKEN")

    const preview = await previewRuntimePluginWriteAction({
      runtime: "claude",
      action: "claude.marketplace.add",
      target: { source: "https://example.com/plugins?token=sk-secretsecret" },
    }, {
      safeModeEnabled: false,
      snapshotProvider: async () => CLAUDE_SNAPSHOT,
      now: new Date("2026-06-03T00:00:00Z"),
    })

    const result = await executeRuntimePluginWriteAction({
      previewId: preview.previewId,
      confirmationToken: preview.confirmationToken ?? "",
    }, {
      runner: async () => {
        throw Object.assign(new Error("failed with Bearer abc.def"), {
          code: 1,
          stdout: "OPENAI_API_KEY=sk-secretsecret",
          stderr: "Bearer abc.def ghp_secretsecret",
        })
      },
      safeModeEnabled: false,
      snapshotProvider: async () => CLAUDE_SNAPSHOT,
      now: new Date("2026-06-03T00:00:00Z"),
    })

    const serialized = JSON.stringify(result)
    expect(result.status).toBe("failed")
    expect(serialized).not.toContain("sk-secretsecret")
    expect(serialized).not.toContain("Bearer abc.def")
    expect(serialized).not.toContain("ghp_secretsecret")
    expect(serialized).toContain("[redacted]")
  })
})
