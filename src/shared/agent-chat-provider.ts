export const agentChatProviders = ["claude-code", "codex"] as const

export type AgentChatProvider = (typeof agentChatProviders)[number]

export type AgentChatMessageMetadata = {
  model?: string
  provider?: AgentChatProvider
  modelSource?: string
  providerProfileId?: string
}

export function normalizeAgentChatProvider(
  provider: string | null | undefined,
): AgentChatProvider | null {
  return provider === "claude-code" || provider === "codex" ? provider : null
}

export function normalizeAgentChatMetadataModel(model: unknown): string | null {
  return typeof model === "string" && model.trim() ? model.trim() : null
}

export function buildAgentChatMessageMetadata(input: {
  model?: string | null
  provider?: AgentChatProvider | null
  modelSource?: string | null
  providerProfileId?: string | null
}): AgentChatMessageMetadata | undefined {
  const metadata: AgentChatMessageMetadata = {}

  const model = normalizeAgentChatMetadataModel(input.model)
  if (model) {
    metadata.model = model
  }

  const provider = normalizeAgentChatProvider(input.provider)
  if (provider) {
    metadata.provider = provider
  }

  if (input.modelSource?.trim()) {
    metadata.modelSource = input.modelSource.trim()
  }

  if (input.providerProfileId?.trim()) {
    metadata.providerProfileId = input.providerProfileId.trim()
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

export function inferAgentChatProviderFromMessages(
  messages: unknown[],
): AgentChatProvider {
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue

    const metadata = (message as { metadata?: unknown }).metadata
    if (typeof metadata !== "object" || metadata === null) continue

    const provider = normalizeAgentChatProvider(
      (metadata as { provider?: unknown }).provider as string | undefined,
    )
    if (provider) return provider

    const model = (metadata as { model?: unknown }).model
    if (typeof model !== "string") continue
    const normalizedModel = model.toLowerCase()
    if (
      normalizedModel.includes("codex") ||
      normalizedModel.startsWith("gpt-")
    ) {
      return "codex"
    }
  }

  return "claude-code"
}
