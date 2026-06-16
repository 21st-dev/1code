import type { ClaudeModelInfo } from "../../../../shared/custom-agent-models"

export {
  CLAUDE_MODELS,
  type ClaudeModel,
  type ClaudeModelInfo,
} from "../../../../shared/custom-agent-models"

export type ModelInfo = ClaudeModelInfo

export type CodexThinkingLevel = "low" | "medium" | "high" | "xhigh"
export type CodexFirstPartyModelSource = "chatgpt" | "openai-api-key"

export const CODEX_MODELS = [
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    info: {
      summaryKey: "agent.model.info.summary.gpt55",
      bestForKey: "agent.model.info.bestFor.gpt55",
      tokenNoteKey: "agent.model.info.note.openaiLongContext",
      contextWindow: "1.05M",
      maxOutput: "128K",
      pricing: "$5 in / $30 out per 1M",
      cachedInput: "$0.50 / 1M",
      latencyKey: "agent.model.info.latency.fast",
    } satisfies ModelInfo,
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    info: {
      summaryKey: "agent.model.info.summary.gpt54",
      bestForKey: "agent.model.info.bestFor.gpt54",
      tokenNoteKey: "agent.model.info.note.openaiLongContext",
      contextWindow: "1.05M",
      maxOutput: "128K",
      pricing: "$2.50 in / $15 out per 1M",
      cachedInput: "$0.25 / 1M",
      latencyKey: "agent.model.info.latency.medium",
    } satisfies ModelInfo,
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    info: {
      summaryKey: "agent.model.info.summary.gpt54Mini",
      bestForKey: "agent.model.info.bestFor.gpt54Mini",
      tokenNoteKey: "agent.model.info.note.codexThinking",
      contextWindow: "400K",
      maxOutput: "128K",
      pricing: "$0.75 in / $4.50 out per 1M",
      cachedInput: "$0.075 / 1M",
      latencyKey: "agent.model.info.latency.fast",
    } satisfies ModelInfo,
  },
  {
    id: "gpt-5.3-codex-spark",
    name: "GPT-5.3-Codex Spark",
    thinkings: ["low", "medium", "high", "xhigh"] as CodexThinkingLevel[],
    info: {
      summaryKey: "agent.model.info.summary.gpt53CodexSpark",
      bestForKey: "agent.model.info.bestFor.gpt53CodexSpark",
      tokenNoteKey: "agent.model.info.note.sparkPricing",
      contextWindow: "Preview",
      maxOutput: "Preview",
      pricing: "ChatGPT Pro credits",
      latencyKey: "agent.model.info.latency.nearInstant",
    } satisfies ModelInfo,
  },
]

const CODEX_CHATGPT_AUTH_ONLY_MODEL_IDS = new Set(["gpt-5.3-codex-spark"])

export function isCodexApiKeySupportedModel(modelId: string): boolean {
  return !CODEX_CHATGPT_AUTH_ONLY_MODEL_IDS.has(modelId)
}

export function isFirstPartyCodexModelSource(
  source: string,
): source is CodexFirstPartyModelSource {
  return source === "chatgpt" || source === "openai-api-key"
}

export function isCodexModelSupportedBySource(
  source: CodexFirstPartyModelSource,
  modelId: string,
): boolean {
  return source === "chatgpt" || isCodexApiKeySupportedModel(modelId)
}

export function getCodexModelsForSource<TModel extends { id: string }>(
  models: TModel[],
  source: CodexFirstPartyModelSource,
): TModel[] {
  return models.filter((model) =>
    isCodexModelSupportedBySource(source, model.id),
  )
}

export function resolveCodexModelForSource<TModel extends { id: string }>({
  models,
  selectedModelId,
  source,
}: {
  models: TModel[]
  selectedModelId: string
  source: CodexFirstPartyModelSource
}): { model: TModel | undefined; changed: boolean } {
  const selectedModel = models.find((model) => model.id === selectedModelId)
  if (
    selectedModel &&
    isCodexModelSupportedBySource(source, selectedModel.id)
  ) {
    return { model: selectedModel, changed: false }
  }

  return {
    model: models.find((model) =>
      isCodexModelSupportedBySource(source, model.id),
    ),
    changed: true,
  }
}

export function formatCodexThinkingLabel(thinking: CodexThinkingLevel): string {
  if (thinking === "xhigh") return "Extra High"
  return thinking.charAt(0).toUpperCase() + thinking.slice(1)
}
