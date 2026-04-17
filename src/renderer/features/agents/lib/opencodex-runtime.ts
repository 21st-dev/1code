import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  type CodexThinkingLevel,
} from "./models"

export type OpenCodexLegacyProviderId = "claude-code" | "codex"

export type OpenCodexRuntimeCatalogItem = {
  id: string
  provider: OpenCodexLegacyProviderId
  providerLabel: string
  modelLabel: string
  defaultThinking: CodexThinkingLevel | null
}

const PROVIDER_LABELS: Record<OpenCodexLegacyProviderId, string> = {
  "claude-code": "OpenCodex Backend",
  codex: "OpenCodex API Override",
}

export function getOpenCodexProviderLabel(
  provider: OpenCodexLegacyProviderId,
): string {
  return PROVIDER_LABELS[provider]
}

export function getOpenCodexProviderPromptLabel(
  provider: OpenCodexLegacyProviderId,
): string {
  return getOpenCodexProviderLabel(provider)
}

export function getDefaultCodexThinking(
  thinkings: CodexThinkingLevel[],
): CodexThinkingLevel {
  if (thinkings.includes("medium")) {
    return "medium"
  }

  return thinkings[0] ?? "medium"
}

export function getOpenCodexRuntimeCatalog(): OpenCodexRuntimeCatalogItem[] {
  return [
    ...CLAUDE_MODELS.map((model) => ({
      id: model.id,
      provider: "claude-code" as const,
      providerLabel: getOpenCodexProviderLabel("claude-code"),
      modelLabel: `${model.name} ${model.version}`,
      defaultThinking: null,
    })),
    ...CODEX_MODELS.map((model) => ({
      id: model.id,
      provider: "codex" as const,
      providerLabel: getOpenCodexProviderLabel("codex"),
      modelLabel: model.name,
      defaultThinking: getDefaultCodexThinking(model.thinkings),
    })),
  ]
}
