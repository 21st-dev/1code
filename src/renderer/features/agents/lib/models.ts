export const CLAUDE_MODELS = [
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
  { id: "haiku", name: "Haiku" },
]

// Model option for dropdown display
export type ModelOption = {
  id: string
  name: string
  provider: "claude" | "custom" | "ollama"
  profileId?: string
  description?: string
  icon?: "claude" | "custom" | "ollama"
}

// Group of models for dropdown display
export type ModelGroup = {
  id: string
  name: string
  options: ModelOption[]
}

// Hook to get all available models (Claude + Custom + Ollama)
import { useAtomValue, useSetAtom } from "jotai"
import {
  activeProfileIdAtom,
  selectedCustomModelIdAtom,
  selectedOllamaModelAtom,
  useInitializeModelProfiles,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"

export function useAllModels(): {
  groups: ModelGroup[]
  selectedModel: ModelOption | null
  selectModel: (model: ModelOption) => void
  isOffline: boolean
  ollamaModels: string[]
  recommendedOllamaModel: string | undefined
} {
  // Initialize profiles from database, fallback to localStorage
  const modelProfiles = useInitializeModelProfiles()
  const activeProfileId = useAtomValue(activeProfileIdAtom)
  const selectedCustomModelId = useAtomValue(selectedCustomModelIdAtom)
  const selectedOllamaModel = useAtomValue(selectedOllamaModelAtom)
  const setActiveProfileId = useSetAtom(activeProfileIdAtom)
  const setSelectedCustomModelId = useSetAtom(selectedCustomModelIdAtom)
  const setSelectedOllamaModel = useSetAtom(selectedOllamaModelAtom)

  const { data: ollamaStatus } = trpc.ollama.getStatus.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const isOffline = ollamaStatus ? !ollamaStatus.internet?.online : false
  const ollamaModels = ollamaStatus?.ollama.models || []
  const recommendedOllamaModel = ollamaStatus?.ollama.recommendedModel

  // Build Claude models group
  const claudeGroup: ModelGroup = {
    id: "claude",
    name: "Claude",
    options: CLAUDE_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      provider: "claude" as const,
      description: "Anthropic's Claude models",
      icon: "claude" as const,
    })),
  }

  // Build custom profiles group
  const customProfiles = modelProfiles.filter((p) => !p.isOffline)
  const customGroup: ModelGroup = {
    id: "custom",
    name: "Custom Models",
    options: customProfiles.flatMap((profile) =>
      profile.models.map((modelName) => ({
        id: `${profile.id}:${modelName}`,
        name: modelName,
        provider: "custom" as const,
        profileId: profile.id,
        description: profile.description || profile.name,
        icon: "custom" as const,
      })),
    ),
  }

  // Build Ollama group (when offline)
  const ollamaGroup: ModelGroup = {
    id: "ollama",
    name: "Ollama (Offline)",
    options: ollamaModels.map((modelName) => ({
      id: `ollama:${modelName}`,
      name: modelName,
      provider: "ollama" as const,
      description: "Local Ollama model",
      icon: "ollama" as const,
    })),
  }

  // Determine which groups to show
  const groups: ModelGroup[] = [claudeGroup]
  if (customGroup.options.length > 0) {
    groups.push(customGroup)
  }
  if (isOffline && ollamaModels.length > 0) {
    groups.push(ollamaGroup)
  }

  // Find selected model
  let selectedModel: ModelOption | null = null

  if (isOffline && ollamaModels.length > 0 && selectedOllamaModel) {
    selectedModel = {
      id: `ollama:${selectedOllamaModel}`,
      name: selectedOllamaModel,
      provider: "ollama",
      description: "Local Ollama model",
      icon: "ollama",
    }
  } else if (activeProfileId && selectedCustomModelId) {
    // Find the custom model
    for (const group of groups) {
      const found = group.options.find((o) => o.id === selectedCustomModelId)
      if (found) {
        selectedModel = found
        break
      }
    }
  }

  // Default to Sonnet if no selection
  if (!selectedModel) {
    selectedModel = {
      id: "sonnet",
      name: "Sonnet",
      provider: "claude",
      description: "Anthropic's Claude Sonnet",
      icon: "claude",
    }
  }

  const selectModel = (model: ModelOption) => {
    if (model.provider === "ollama") {
      // For Ollama, extract model name and set as selected Ollama model
      const modelName = model.id.replace("ollama:", "")
      setSelectedOllamaModel(modelName)
    } else if (model.provider === "custom") {
      // For custom models, set both profile and model
      const [profileId] = model.id.split(":")
      setActiveProfileId(profileId)
      setSelectedCustomModelId(model.id)
    } else {
      // For Claude models, clear custom profile selection
      setActiveProfileId(null)
      setSelectedCustomModelId(null)
    }
  }

  return {
    groups,
    selectedModel,
    selectModel,
    isOffline,
    ollamaModels,
    recommendedOllamaModel,
  }
}
