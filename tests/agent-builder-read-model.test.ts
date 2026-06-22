import { describe, expect, test } from "bun:test"
import { buildAgentBuilderEntries } from "../src/main/lib/agent-builder/read-model"
import type { AppAgentDTO } from "../src/main/lib/app-agents/shared"
import type { FileAgent } from "../src/main/lib/trpc/routers/agent-utils"

const locusAgent: AppAgentDTO = {
  id: "agent-1",
  name: "reviewer",
  description: "Reviews code",
  prompt: "Review carefully",
  tools: ["Read"],
  disallowedTools: [],
  source: "app",
  path: "Locus Agents",
  createdAt: null,
  updatedAt: null,
}

const userClaudeAgent: FileAgent = {
  name: "legacy-reviewer",
  description: "Claude file agent",
  prompt: "Review through Claude native file",
  tools: ["Read"],
  source: "user",
  path: "~/.claude/agents/legacy-reviewer.md",
}

const pluginAgent: FileAgent = {
  name: "plugin-reviewer",
  description: "Plugin file agent",
  prompt: "Review through plugin",
  disallowedTools: ["Write"],
  source: "plugin",
  pluginName: "trusted-plugin",
  path: "/plugins/trusted-plugin/agents/plugin-reviewer.md",
}

describe("Agent Builder read model", () => {
  test("keeps Locus Agents editable and runtime-native/plugin agents read-only", () => {
    const entries = buildAgentBuilderEntries({
      locusAgents: [locusAgent],
      claudeNativeAgents: [pluginAgent, userClaudeAgent],
    })

    expect(entries.map((entry) => entry.id)).toEqual([
      "locus:agent-1",
      "claude:user:local:~/.claude/agents/legacy-reviewer.md:legacy-reviewer",
      "plugin:plugin:trusted-plugin:/plugins/trusted-plugin/agents/plugin-reviewer.md:plugin-reviewer",
    ])

    const [locus, claudeNative, pluginProvided] = entries
    expect(locus).toBeDefined()
    expect(claudeNative).toBeDefined()
    expect(pluginProvided).toBeDefined()
    if (!locus || !claudeNative || !pluginProvided) {
      throw new Error("Expected all Agent Builder entries to be present")
    }

    expect(locus).toMatchObject({
      source: "locus",
      owner: "Locus",
      mutability: "editable",
      invocationMode: "prompt-context",
      locusAgent,
    })
    expect(locus.runtimeSupport).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtimeId: "claude",
          status: "prompt-only",
          projectionMode: "prompt-context",
        }),
        expect.objectContaining({
          runtimeId: "codex",
          status: "prompt-only",
          projectionMode: "prompt-context",
        }),
      ]),
    )

    expect(claudeNative).toMatchObject({
      source: "claude-native",
      owner: "Claude user",
      mutability: "read-only",
      invocationMode: "native-discovered",
      locusAgent: null,
    })
    expect(claudeNative.runtimeSupport).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtimeId: "claude",
          status: "native-discovered",
        }),
        expect.objectContaining({
          runtimeId: "codex",
          status: "unsupported",
        }),
      ]),
    )
    expect(claudeNative.diagnostics.join("\n")).not.toContain(
      userClaudeAgent.path,
    )

    expect(pluginProvided).toMatchObject({
      source: "plugin-provided",
      owner: "trusted-plugin",
      mutability: "read-only",
      invocationMode: "plugin-provided",
      pluginName: "trusted-plugin",
      locusAgent: null,
    })
    expect(pluginProvided.runtimeSupport).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtimeId: "claude",
          status: "read-only",
          projectionMode: "plugin-provided",
        }),
      ]),
    )
    expect(pluginProvided.diagnostics.join("\n")).not.toContain(
      pluginAgent.path,
    )
  })
})
