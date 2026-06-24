import * as os from "os"
import * as path from "path"
import type {
  AgentEngineId,
  AgentRuntimeManifest,
} from "./types"

const home = os.homedir()

export const AGENT_RUNTIME_MANIFESTS: Record<AgentEngineId, AgentRuntimeManifest> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    vendor: "Anthropic",
    availability: "available",
    defaultModelId: "opus",
    features: [
      "chat",
      "resume",
      "fork",
      "rollback",
      "mcp",
      "agents",
      "skills",
      "commands",
      "plugins",
      "memory",
      "images",
      "usage",
      "permissions",
      "projects",
      "library",
      "pull-requests",
      "follow-ups",
      "rate-limits",
    ],
    configRoots: {
      user: path.join(home, ".claude"),
      project: ".claude",
      sessions: "claude-sessions/<subChatId>",
    },
    models: [
      { id: "opus", label: "Opus 4.6" },
      { id: "sonnet", label: "Sonnet 4.6" },
      { id: "haiku", label: "Haiku 4.5" },
    ],
  },
  codex: {
    id: "codex",
    label: "OpenAI Codex",
    vendor: "OpenAI",
    availability: "available",
    defaultModelId: "gpt-5.5/medium",
    features: [
      "chat",
      "resume",
      "mcp",
      "plugins",
      "memory",
      "images",
      "usage",
      "permissions",
      "projects",
      "library",
      "pull-requests",
      "follow-ups",
      "rate-limits",
      "realtime-voice",
      "dictation",
      "diagnostics",
    ],
    configRoots: {
      user: path.join(home, ".codex"),
      project: ".codex",
      sessions: path.join(home, ".codex", "sessions"),
    },
    models: [
      { id: "gpt-5.5", label: "GPT 5.5" },
      { id: "gpt-5.4", label: "GPT 5.4" },
      { id: "gpt-5.4-mini", label: "GPT 5.4 Mini" },
      { id: "gpt-5.2", label: "GPT 5.2" },
    ],
    notes: [
      "Codex currently uses ACP session resources plus ~/.codex/config.toml MCP configuration.",
      "Native resume is prepared through codex exec resume; native fork is available as a TUI command plan until Codex exposes a headless fork bridge.",
      "Agent, skill, and command projection must be rendered into prompt/context until native support is implemented.",
    ],
  },
  hermes: {
    id: "hermes",
    label: "Hermes",
    vendor: "Moss / Hermes",
    availability: "available",
    defaultModelId: "moss-default",
    features: [
      "chat",
      "resume",
      "fork",
      "rollback",
      "mcp",
      "agents",
      "skills",
      "commands",
      "plugins",
      "memory",
      "images",
      "usage",
      "permissions",
      "projects",
      "library",
      "pull-requests",
      "follow-ups",
      "rate-limits",
      "realtime-voice",
      "dictation",
      "diagnostics",
    ],
    configRoots: {
      user: path.join(home, ".hermes"),
      project: ".moss",
    },
    models: [
      { id: "moss-default", label: "Moss Default" },
    ],
    notes: [
      "Hermes is the native Moss core target and consumes .moss as its canonical project source.",
      "The local Hermes CLI exposes an ACP server surface and uses the current Hermes runtime model by default.",
      "Hermes native resume is planned through hermes --resume; fork and rollback stay Moss-owned because the live Hermes CLI does not expose separate fork or rollback commands.",
    ],
  },
  "custom-acp": {
    id: "custom-acp",
    label: "Custom ACP",
    vendor: "User / ACP",
    availability: "unsupported",
    defaultModelId: "custom-acp",
    features: [
      "chat",
      "mcp",
      "agents",
      "skills",
      "commands",
      "plugins",
      "memory",
      "usage",
      "permissions",
      "projects",
      "library",
      "pull-requests",
      "follow-ups",
      "rate-limits",
    ],
    configRoots: {
      user: path.join(home, ".moss", "custom-acp"),
      project: ".moss/custom-acp",
      sessions: ".moss/custom-acp/sessions/<subChatId>",
    },
    models: [
      { id: "custom-acp", label: "Custom ACP Default" },
    ],
    notes: [
      "Custom ACP is a governed external engine slot under Moss Unified Source.",
      "Moss provider, resource, and projection settings can be prepared now; session start remains disabled until a custom ACP endpoint or command adapter is configured.",
      "Shared skills, MCP, plugins, hooks, memory, and subagents are projected from .moss instead of maintained as a second real copy.",
    ],
  },
}

export function getAgentRuntimeManifest(engineId: AgentEngineId): AgentRuntimeManifest {
  return AGENT_RUNTIME_MANIFESTS[engineId]
}

export function listAgentRuntimeManifests(): AgentRuntimeManifest[] {
  return Object.values(AGENT_RUNTIME_MANIFESTS)
}
