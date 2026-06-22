import { asc } from "drizzle-orm"
import { type AppAgentDTO, toAppAgentDTO } from "../app-agents/shared"
import { appAgents, getDatabase } from "../db"
import type { FileAgent } from "../trpc/routers/agent-utils"
import { listClaudeNativeAgents } from "./claude-native-agents"

export type AgentBuilderSource =
  | "locus"
  | "claude-native"
  | "plugin-provided"
  | "codex-native"

export type AgentBuilderMutability = "editable" | "read-only"

export type AgentBuilderInvocationMode =
  | "prompt-context"
  | "native-discovered"
  | "plugin-provided"
  | "unsupported"

export type AgentBuilderRuntimeStatus =
  | "prompt-only"
  | "native-discovered"
  | "read-only"
  | "unsupported"

export type AgentBuilderRuntimeSupport = {
  runtimeId: "claude" | "codex"
  runtimeLabel: string
  status: AgentBuilderRuntimeStatus
  projectionMode: AgentBuilderInvocationMode
  reason: string
}

export type AgentBuilderEntry = {
  id: string
  name: string
  description: string
  prompt: string
  tools: string[]
  disallowedTools: string[]
  source: AgentBuilderSource
  owner: string
  mutability: AgentBuilderMutability
  invocationMode: AgentBuilderInvocationMode
  path: string | null
  pluginName: string | null
  diagnostics: string[]
  runtimeSupport: AgentBuilderRuntimeSupport[]
  locusAgent: AppAgentDTO | null
}

function locusRuntimeSupport(): AgentBuilderRuntimeSupport[] {
  return [
    {
      runtimeId: "claude",
      runtimeLabel: "Claude Code",
      status: "prompt-only",
      projectionMode: "prompt-context",
      reason:
        "Locus applies this Agent as prompt context before Claude provider work starts; native Claude agent execution is not claimed.",
    },
    {
      runtimeId: "codex",
      runtimeLabel: "Codex",
      status: "prompt-only",
      projectionMode: "prompt-context",
      reason:
        "Locus applies this Agent as prompt context before Codex app-server provider work starts; native Codex subagent execution is not claimed.",
    },
  ]
}

function claudeNativeRuntimeSupport(
  source: FileAgent["source"],
): AgentBuilderRuntimeSupport[] {
  const claudeStatus: AgentBuilderRuntimeStatus =
    source === "plugin" ? "read-only" : "native-discovered"
  const projectionMode: AgentBuilderInvocationMode =
    source === "plugin" ? "plugin-provided" : "native-discovered"
  return [
    {
      runtimeId: "claude",
      runtimeLabel: "Claude Code",
      status: claudeStatus,
      projectionMode,
      reason:
        source === "plugin"
          ? "Discovered from an enabled plugin as a Claude native agent. It is read-only unless duplicated or imported later."
          : "Discovered as a Claude native .claude/agents file. It is not the canonical Locus Agent record.",
    },
    {
      runtimeId: "codex",
      runtimeLabel: "Codex",
      status: "unsupported",
      projectionMode: "unsupported",
      reason:
        "Runtime-native Claude agent files are not Codex native subagents and are not projected into Codex by default.",
    },
  ]
}

function sourceRank(source: AgentBuilderSource) {
  switch (source) {
    case "locus":
      return 0
    case "claude-native":
      return 1
    case "plugin-provided":
      return 2
    case "codex-native":
      return 3
  }
}

function compareEntries(a: AgentBuilderEntry, b: AgentBuilderEntry) {
  const bySource = sourceRank(a.source) - sourceRank(b.source)
  if (bySource !== 0) return bySource
  return a.name.localeCompare(b.name)
}

export function buildAgentBuilderEntries(input: {
  locusAgents: AppAgentDTO[]
  claudeNativeAgents: FileAgent[]
}): AgentBuilderEntry[] {
  const locusEntries: AgentBuilderEntry[] = input.locusAgents.map((agent) => ({
    id: `locus:${agent.id}`,
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    tools: agent.tools,
    disallowedTools: agent.disallowedTools,
    source: "locus",
    owner: "Locus",
    mutability: "editable",
    invocationMode: "prompt-context",
    path: agent.path,
    pluginName: null,
    diagnostics: [],
    runtimeSupport: locusRuntimeSupport(),
    locusAgent: agent,
  }))

  const nativeEntries: AgentBuilderEntry[] = input.claudeNativeAgents.map(
    (agent) => {
      const pluginProvided = agent.source === "plugin"
      return {
        id: `${pluginProvided ? "plugin" : "claude"}:${agent.source}:${agent.pluginName ?? "local"}:${agent.path}:${agent.name}`,
        name: agent.name,
        description: agent.description,
        prompt: agent.prompt,
        tools: agent.tools ?? [],
        disallowedTools: agent.disallowedTools ?? [],
        source: pluginProvided ? "plugin-provided" : "claude-native",
        owner: pluginProvided
          ? (agent.pluginName ?? "Plugin")
          : agent.source === "project"
            ? "Claude project"
            : "Claude user",
        mutability: "read-only",
        invocationMode: pluginProvided
          ? "plugin-provided"
          : "native-discovered",
        path: agent.path,
        pluginName: agent.pluginName ?? null,
        diagnostics: [
          pluginProvided
            ? "Plugin-provided agents are read-only in Agent Builder until duplicate/import flows are implemented."
            : "Claude native agents are runtime-owned and read-only in Agent Builder until import/projection flows are implemented.",
        ],
        runtimeSupport: claudeNativeRuntimeSupport(agent.source),
        locusAgent: null,
      } satisfies AgentBuilderEntry
    },
  )

  return [...locusEntries, ...nativeEntries].sort(compareEntries)
}

export async function listAgentBuilderEntries(
  input: { cwd?: string } = {},
): Promise<AgentBuilderEntry[]> {
  const db = getDatabase()
  const locusAgents = db
    .select()
    .from(appAgents)
    .orderBy(asc(appAgents.name))
    .all()
    .map(toAppAgentDTO)
  const claudeNativeAgents = await listClaudeNativeAgents({ cwd: input.cwd })

  return buildAgentBuilderEntries({ locusAgents, claudeNativeAgents })
}
