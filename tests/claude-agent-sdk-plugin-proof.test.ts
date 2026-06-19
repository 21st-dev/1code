import { describe, expect, test } from "bun:test"
import {
  assessClaudeAgentSdkPluginProof,
  summarizeClaudeAgentSdkPluginInitMessage,
} from "../src/main/lib/claude/agent-sdk-plugin-proof"

describe("Claude Agent SDK plugin proof helpers", () => {
  test("summarizes plugin-related SDK init fields without raw payloads", () => {
    const init = summarizeClaudeAgentSdkPluginInitMessage({
      type: "system",
      subtype: "init",
      claude_code_version: "2.1.177",
      cwd: "/repo",
      permissionMode: "plan",
      session_id: "session-1",
      uuid: "message-1",
      plugins: [{ name: "locus-native-proof", path: "/tmp/plugin" }],
      skills: ["locus-proof-skill"],
      agents: ["locus-proof-agent"],
      slash_commands: ["/locus-proof-command"],
      tools: ["Read", "Write"],
      mcp_servers: [{ name: "filesystem", status: "connected" }],
    })

    expect(init).toEqual({
      sawInit: true,
      claudeCodeVersion: "2.1.177",
      cwd: "/repo",
      permissionMode: "plan",
      sessionId: "session-1",
      uuid: "message-1",
      plugins: [{ name: "locus-native-proof", path: "/tmp/plugin" }],
      pluginNames: ["locus-native-proof"],
      pluginPaths: ["/tmp/plugin"],
      skills: ["locus-proof-skill"],
      agents: ["locus-proof-agent"],
      slashCommands: ["/locus-proof-command"],
      tools: ["Read", "Write"],
      mcpServerNames: ["filesystem"],
    })
  })

  test("assesses a local plugin loaded through SDK init with MCP discovery skipped", () => {
    const init = summarizeClaudeAgentSdkPluginInitMessage({
      type: "system",
      subtype: "init",
      plugins: [{ name: "locus-native-proof", path: "/tmp/plugin" }],
      skills: ["locus-proof-skill"],
      agents: ["locus-proof-agent"],
      slash_commands: ["/plugin:locus-proof-command"],
      tools: ["Read", "Write"],
      mcp_servers: [],
    })

    expect(
      assessClaudeAgentSdkPluginProof({
        init,
        expected: {
          pluginName: "locus-native-proof",
          pluginPath: "/tmp/plugin",
          skillName: "locus-proof-skill",
          agentName: "locus-proof-agent",
          commandName: "locus-proof-command",
          mcpServerName: "locus-proof-mcp",
          hookMarker: "LOCUS_CLAUDE_PLUGIN_HOOK_PROOF",
        },
        hookOutputs: ["LOCUS_CLAUDE_PLUGIN_HOOK_PROOF"],
      }),
    ).toMatchObject({
      sawInit: true,
      pluginListed: true,
      skillListed: true,
      agentListed: true,
      commandListed: true,
      hookMarkerSeen: true,
      mcpServerListed: false,
      mcpDiscoverySkipped: true,
      nonMcpComponentsAdvertised: true,
      reachedModelTurn: false,
      reasons: [],
    })
  })

  test("does not accept an MCP-bearing plugin as skipped when its MCP surfaces", () => {
    const init = summarizeClaudeAgentSdkPluginInitMessage({
      type: "system",
      subtype: "init",
      plugins: [{ name: "locus-native-proof", path: "/tmp/plugin" }],
      skills: ["locus-proof-skill"],
      agents: ["locus-proof-agent"],
      slash_commands: ["/locus-proof-command"],
      tools: ["mcp__locus-proof-mcp__read"],
      mcp_servers: [{ name: "locus-proof-mcp", status: "connected" }],
    })

    const assessment = assessClaudeAgentSdkPluginProof({
      init,
      expected: {
        pluginName: "locus-native-proof",
        pluginPath: "/tmp/plugin",
        skillName: "locus-proof-skill",
        agentName: "locus-proof-agent",
        commandName: "locus-proof-command",
        mcpServerName: "locus-proof-mcp",
      },
    })

    expect(assessment.mcpServerListed).toBe(true)
    expect(assessment.mcpDiscoverySkipped).toBe(false)
  })

  test("can assess native plugin MCP discovery when skipMcpDiscovery is disabled", () => {
    const init = summarizeClaudeAgentSdkPluginInitMessage({
      type: "system",
      subtype: "init",
      plugins: [{ name: "locus-native-proof", path: "/tmp/plugin" }],
      skills: ["locus-proof-skill"],
      agents: ["locus-proof-agent"],
      slash_commands: ["/locus-proof-command"],
      tools: ["mcp__locus-proof-mcp__probe"],
      mcp_servers: [{ name: "locus-proof-mcp", status: "connected" }],
    })

    expect(
      assessClaudeAgentSdkPluginProof({
        init,
        expectMcpDiscoverySkipped: false,
        expected: {
          pluginName: "locus-native-proof",
          pluginPath: "/tmp/plugin",
          skillName: "locus-proof-skill",
          agentName: "locus-proof-agent",
          commandName: "locus-proof-command",
          mcpServerName: "locus-proof-mcp",
        },
      }).reasons,
    ).toEqual([])
  })

  test("records blocker reasons when init never arrives", () => {
    const assessment = assessClaudeAgentSdkPluginProof({
      init: summarizeClaudeAgentSdkPluginInitMessage({ type: "assistant" }),
      expected: {
        pluginName: "locus-native-proof",
        pluginPath: "/tmp/plugin",
        skillName: "locus-proof-skill",
        agentName: "locus-proof-agent",
        commandName: "locus-proof-command",
        mcpServerName: "locus-proof-mcp",
      },
      errorMessage: "Claude Code process exited before init",
    })

    expect(assessment.sawInit).toBe(false)
    expect(assessment.nonMcpComponentsAdvertised).toBe(false)
    expect(assessment.reasons).toEqual(
      expect.arrayContaining([
        "Claude SDK did not emit a system init message",
        "MCP discovery skip cannot be assessed without SDK init",
        "Claude Code process exited before init",
      ]),
    )
  })
})
