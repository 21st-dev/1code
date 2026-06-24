import { describe, expect, test } from "bun:test"
import { buildGovernedResourceProjection } from "./governance"
import type { SharedResource } from "./types"

function resource(overrides: Partial<SharedResource> & Pick<SharedResource, "id" | "kind" | "name" | "scope">): SharedResource {
  return {
    enabled: true,
    ...overrides,
  }
}

describe("buildGovernedResourceProjection", () => {
  test("resolves same-name conflicts by scope precedence and projects only the winner", () => {
    const snapshot = buildGovernedResourceProjection({
      projectPath: "/workspace/app",
      resources: [
        resource({
          id: "agent:project:reviewer",
          kind: "agent",
          name: "Reviewer",
          scope: "project",
          path: ".claude/agents/reviewer.md",
        }),
        resource({
          id: "agent:user:reviewer",
          kind: "agent",
          name: "reviewer",
          scope: "user",
          path: "~/.claude/agents/reviewer.md",
        }),
      ],
    })

    expect(snapshot.conflicts).toHaveLength(1)
    expect(snapshot.conflicts[0]).toMatchObject({
      key: "agent:shared:reviewer",
      winnerResourceId: "agent:project:reviewer",
      resolution: "winner-by-precedence",
    })

    const userAgent = snapshot.resources.find(
      (item) => item.id === "agent:user:reviewer",
    )
    expect(userAgent?.conflict?.winnerResourceId).toBe("agent:project:reviewer")

    const claudeProjection = snapshot.projections.find(
      (projection) => projection.engineId === "claude-code",
    )
    expect(claudeProjection?.mappings.map((mapping) => mapping.resourceId)).toEqual([
      "agent:project:reviewer",
    ])

    const codexProjection = snapshot.projections.find(
      (projection) => projection.engineId === "codex",
    )
    expect(codexProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "agent:project:reviewer",
        action: "prompt-inject",
      }),
    )
    expect(codexProjection?.warnings).toContain(
      "reviewer is shadowed by a higher precedence resource.",
    )
  })

  test("tracks plugin MCP approval state and keeps unapproved resources out of projections", () => {
    const snapshot = buildGovernedResourceProjection({
      resources: [
        resource({
          id: "mcp:claude-code:plugin:demo:browser",
          kind: "mcp",
          name: "browser",
          scope: "plugin",
          engine: "claude-code",
          pluginSource: "demo",
          path: "plugins/demo/mcp/browser.json",
          metadata: { approved: false },
          enabled: false,
        }),
      ],
    })

    const pluginMcp = snapshot.resources[0]
    expect(pluginMcp?.approval).toMatchObject({
      required: true,
      approved: false,
    })
    expect(pluginMcp?.provenance).toMatchObject({
      source: "plugin",
      sourceId: "demo",
      discoveredBy: "plugin MCP manifest",
    })

    for (const projection of snapshot.projections) {
      expect(projection.mappings).toHaveLength(0)
    }
  })

  test("projects Codex-native MCP resources natively for Codex", () => {
    const snapshot = buildGovernedResourceProjection({
      resources: [
        resource({
          id: "mcp:codex:global:node_repl",
          kind: "mcp",
          name: "node_repl",
          scope: "engine",
          engine: "codex",
          path: "~/.codex/config.toml",
        }),
      ],
    })

    const codexProjection = snapshot.projections.find(
      (projection) => projection.engineId === "codex",
    )
    expect(codexProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "mcp:codex:global:node_repl",
        action: "native",
        targetPath: "~/.codex/config.toml",
      }),
    )
  })

  test("treats Moss Unified Source as canonical over legacy project files", () => {
    const snapshot = buildGovernedResourceProjection({
      projectPath: "/workspace/app",
      resources: [
        resource({
          id: "moss:instruction:moss.md",
          kind: "instruction",
          name: "AGENTS.md",
          scope: "moss",
          path: ".moss/source/moss.md",
          metadata: {
            mossRole: "source-instruction",
          },
        }),
        resource({
          id: "instruction:project:AGENTS.md",
          kind: "instruction",
          name: "AGENTS.md",
          scope: "project",
          path: "AGENTS.md",
        }),
      ],
    })

    expect(snapshot.conflicts[0]).toMatchObject({
      key: "instruction:shared:agents.md",
      winnerResourceId: "moss:instruction:moss.md",
      resolution: "winner-by-precedence",
    })

    const mossInstruction = snapshot.resources.find(
      (item) => item.id === "moss:instruction:moss.md",
    )
    expect(mossInstruction?.provenance).toMatchObject({
      source: "moss",
      discoveredBy: "Moss Unified Source",
      precedenceLabel: "Moss Unified Source is canonical",
    })
  })

  test("projects Moss resources to Claude, Codex, Hermes, and Custom ACP without duplicating source data", () => {
    const snapshot = buildGovernedResourceProjection({
      projectPath: "/workspace/app",
      resources: [
        resource({
          id: "moss:instruction:moss.md",
          kind: "instruction",
          name: "moss.md",
          scope: "moss",
          path: ".moss/source/moss.md",
          metadata: {
            mossRole: "source-instruction",
          },
        }),
        resource({
          id: "moss:skill:review",
          kind: "skill",
          name: "review",
          scope: "moss",
          path: ".moss/skills/review/SKILL.md",
          metadata: {
            mossRole: "skill",
            entryName: "review",
          },
        }),
        resource({
          id: "moss:mcp:browser",
          kind: "mcp",
          name: "browser",
          scope: "moss",
          path: ".moss/mcp/config.json",
          metadata: {
            mossRole: "mcp-config",
          },
        }),
        resource({
          id: "moss:provider:providers.yaml",
          kind: "provider",
          name: "providers.yaml",
          scope: "moss",
          path: ".moss/providers.yaml",
          metadata: {
            mossRole: "provider-config",
          },
        }),
        resource({
          id: "moss:hook:on-stop",
          kind: "hook",
          name: "on-stop",
          scope: "moss",
          path: ".moss/hooks/on-stop.md",
          metadata: {
            mossRole: "hook",
            entryName: "on-stop.md",
          },
        }),
        resource({
          id: "moss:plugin:moss-starter",
          kind: "plugin",
          name: "moss-starter",
          scope: "moss",
          path: ".moss/plugins/moss-starter.md",
          metadata: {
            mossRole: "plugin",
            entryName: "moss-starter.md",
          },
        }),
        resource({
          id: "moss:subagent:reviewer",
          kind: "subagent",
          name: "reviewer",
          scope: "moss",
          path: ".moss/subagents/reviewer.md",
          metadata: {
            mossRole: "subagent",
            entryName: "reviewer.md",
          },
        }),
      ],
    })

    const claudeProjection = snapshot.projections.find(
      (projection) => projection.engineId === "claude-code",
    )
    expect(claudeProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:instruction:moss.md",
        action: "symlink",
        targetPath: "CLAUDE.md",
      }),
    )
    expect(claudeProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:mcp:browser",
        action: "managed-bridge",
        targetPath: ".mcp.json",
      }),
    )
    expect(claudeProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:hook:on-stop",
        action: "adapter-inject",
        sourcePath: ".moss/hooks/on-stop.md",
        targetPath: ".claude/hooks",
      }),
    )

    const codexProjection = snapshot.projections.find(
      (projection) => projection.engineId === "codex",
    )
    expect(codexProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:instruction:moss.md",
        action: "symlink",
        targetPath: "AGENTS.md",
      }),
    )
    expect(codexProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:provider:providers.yaml",
        action: "managed-bridge",
        targetPath: ".codex/config.toml",
      }),
    )
    expect(codexProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:hook:on-stop",
        action: "adapter-inject",
        sourcePath: ".moss/hooks/on-stop.md",
        targetPath: ".codex/hooks",
      }),
    )
    expect(codexProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:plugin:moss-starter",
        action: "adapter-inject",
        sourcePath: ".moss/plugins/moss-starter.md",
        targetPath: ".codex/plugins",
      }),
    )
    expect(codexProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:subagent:reviewer",
        action: "symlink",
        sourcePath: ".moss/subagents/reviewer.md",
        targetPath: ".codex/agents/reviewer.md",
      }),
    )

    const hermesProjection = snapshot.projections.find(
      (projection) => projection.engineId === "hermes",
    )
    expect(hermesProjection?.status).toBe("ready")
    expect(hermesProjection?.warnings).toEqual([])
    expect(hermesProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:skill:review",
        action: "native",
        sourcePath: ".moss/skills/review",
        targetPath: ".moss/skills/review",
      }),
    )
    expect(hermesProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:hook:on-stop",
        action: "native",
        sourcePath: ".moss/hooks/on-stop.md",
        targetPath: ".moss/hooks/on-stop.md",
      }),
    )

    const customAcpProjection = snapshot.projections.find(
      (projection) => projection.engineId === "custom-acp",
    )
    expect(customAcpProjection?.status).toBe("unsupported")
    expect(customAcpProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:instruction:moss.md",
        action: "prompt-inject",
        sourcePath: ".moss/source/moss.md",
      }),
    )
    expect(customAcpProjection?.mappings).toContainEqual(
      expect.objectContaining({
        resourceId: "moss:provider:providers.yaml",
        action: "prompt-inject",
        sourcePath: ".moss/providers.yaml",
      }),
    )
  })
})
