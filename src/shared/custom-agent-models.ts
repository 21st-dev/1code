export type ClaudeModelInfo = {
  summaryKey: string
  bestForKey: string
  tokenNoteKey?: string
  contextWindow: string
  maxOutput: string
  pricing: string
  cachedInput?: string
  latencyKey: string
}

export const CLAUDE_MODELS = [
  {
    id: "opus",
    name: "Opus",
    version: "4.7",
    info: {
      summaryKey: "agent.model.info.summary.claudeOpus47",
      bestForKey: "agent.model.info.bestFor.claudeOpus47",
      tokenNoteKey: "agent.model.info.note.claudeCodeBilling",
      contextWindow: "1M",
      maxOutput: "128K",
      pricing: "$5 in / $25 out per 1M",
      cachedInput: "$0.50 / 1M",
      latencyKey: "agent.model.info.latency.moderate",
    },
  },
  {
    id: "sonnet",
    name: "Sonnet",
    version: "4.6",
    info: {
      summaryKey: "agent.model.info.summary.claudeSonnet46",
      bestForKey: "agent.model.info.bestFor.claudeSonnet46",
      tokenNoteKey: "agent.model.info.note.claudeCodeBilling",
      contextWindow: "1M",
      maxOutput: "64K",
      pricing: "$3 in / $15 out per 1M",
      cachedInput: "$0.30 / 1M",
      latencyKey: "agent.model.info.latency.fast",
    },
  },
  {
    id: "haiku",
    name: "Haiku",
    version: "4.5",
    info: {
      summaryKey: "agent.model.info.summary.claudeHaiku45",
      bestForKey: "agent.model.info.bestFor.claudeHaiku45",
      tokenNoteKey: "agent.model.info.note.claudeCodeBilling",
      contextWindow: "200K",
      maxOutput: "64K",
      pricing: "$1 in / $5 out per 1M",
      cachedInput: "$0.10 / 1M",
      latencyKey: "agent.model.info.latency.fastest",
    },
  },
] as const satisfies readonly {
  id: string
  name: string
  version: string
  info: ClaudeModelInfo
}[]

export type ClaudeModel = (typeof CLAUDE_MODELS)[number]
export type CustomAgentModelId = ClaudeModel["id"]
export type CustomAgentModel = CustomAgentModelId | "inherit"

export const CUSTOM_AGENT_MODEL_IDS = CLAUDE_MODELS.map(
  (model) => model.id,
) as readonly CustomAgentModelId[]

export const CUSTOM_AGENT_MODEL_VALUES = [
  ...CUSTOM_AGENT_MODEL_IDS,
  "inherit",
] as readonly CustomAgentModel[]

export function isCustomAgentModel(value: unknown): value is CustomAgentModel {
  return (
    typeof value === "string" &&
    CUSTOM_AGENT_MODEL_VALUES.some((model) => model === value)
  )
}

export function isCustomAgentModelId(value: unknown): value is CustomAgentModelId {
  return (
    typeof value === "string" &&
    CUSTOM_AGENT_MODEL_IDS.some((model) => model === value)
  )
}
