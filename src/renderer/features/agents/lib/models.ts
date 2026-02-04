import type { ModelProvider } from "../../../lib/atoms"

export const CLAUDE_MODELS = [
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
  { id: "haiku", name: "Haiku" },
]

export type ClaudeModel = {
  id: string
  name: string
  isCustom?: boolean
  providerId?: string
}

export function getAvailableModels(providers: ModelProvider[]): ClaudeModel[] {
  const baseModels: ClaudeModel[] = CLAUDE_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    isCustom: false,
  }))

  const customModels: ClaudeModel[] = providers
    .filter((p) => !p.isOffline)
    .flatMap((provider) =>
      provider.models.map((modelId) => ({
        id: modelId,
        name: modelId,
        isCustom: true,
        providerId: provider.id,
      })),
    )

  return [...baseModels, ...customModels]
}
