/**
 * Model Access Helper
 *
 * Computes which model options are enabled based on configured credentials.
 * Used by both chat-input-area.tsx and new-chat-form.tsx dropdowns.
 */

import { useAtomValue } from "jotai"
import {
  anthropicApiKeyConfigAtom,
  customProviderConfigAtom,
  normalizeAnthropicApiKeyConfig,
  normalizeCustomProviderConfig,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"

export type ModelAccessStatus = {
  // Individual credential sources
  hasClaudeOAuth: boolean
  hasCliConfig: boolean
  hasAnthropicApiKey: boolean
  hasCustomProvider: boolean

  // Aggregate statuses
  claudeEnabled: boolean // Can use Opus/Sonnet/Haiku
  customEnabled: boolean // Can use Custom

  // Disabled reasons for UI
  claudeDisabledReason: string | null
  customDisabledReason: string | null

  // Loading state
  isLoading: boolean
}

/**
 * Hook to get model access status based on configured credentials.
 * Returns which models are enabled and why others are disabled.
 */
export function useModelAccess(): ModelAccessStatus {
  // Get OAuth connection status
  const { data: claudeCodeIntegration, isLoading: isLoadingOAuth } =
    trpc.claudeCode.getIntegration.useQuery()

  // Get CLI config status (ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL in env)
  const { data: cliConfig, isLoading: isLoadingCli } =
    trpc.claudeCode.hasExistingCliConfig.useQuery()

  // Get stored configs from atoms
  const anthropicApiKeyConfig = useAtomValue(anthropicApiKeyConfigAtom)
  const customProviderConfig = useAtomValue(customProviderConfigAtom)

  // Normalize configs
  const normalizedAnthropicApiKey = normalizeAnthropicApiKeyConfig(anthropicApiKeyConfig)
  const normalizedCustomProvider = normalizeCustomProviderConfig(customProviderConfig)

  // Compute individual statuses
  const hasClaudeOAuth = claudeCodeIntegration?.isConnected ?? false
  const hasCliConfig = cliConfig?.hasConfig ?? false
  const hasAnthropicApiKey = !!normalizedAnthropicApiKey
  const hasCustomProvider = !!normalizedCustomProvider

  // Aggregate statuses
  const claudeEnabled = hasClaudeOAuth || hasCliConfig || hasAnthropicApiKey
  const customEnabled = hasCustomProvider

  // Disabled reasons
  let claudeDisabledReason: string | null = null
  if (!claudeEnabled) {
    claudeDisabledReason = "Configure Anthropic provider in Settings"
  }

  let customDisabledReason: string | null = null
  if (!customEnabled) {
    customDisabledReason = "Configure Custom provider in Settings"
  }

  const isLoading = isLoadingOAuth || isLoadingCli

  return {
    hasClaudeOAuth,
    hasCliConfig,
    hasAnthropicApiKey,
    hasCustomProvider,
    claudeEnabled,
    customEnabled,
    claudeDisabledReason,
    customDisabledReason,
    isLoading,
  }
}

/**
 * Determine which credential source to use for Claude models.
 * Returns the source type for routing decisions.
 *
 * Precedence (per plan):
 * 1. Anthropic API key (explicit user config takes priority)
 * 2. OAuth connection
 * 3. CLI config
 */
export type ClaudeCredentialSource = "anthropic-api-key" | "oauth" | "cli" | null

export function getClaudeCredentialSource(access: ModelAccessStatus): ClaudeCredentialSource {
  // Anthropic API key takes priority (explicit user config)
  if (access.hasAnthropicApiKey) return "anthropic-api-key"
  // OAuth is next
  if (access.hasClaudeOAuth) return "oauth"
  // CLI config is last
  if (access.hasCliConfig) return "cli"
  // No valid source
  return null
}
