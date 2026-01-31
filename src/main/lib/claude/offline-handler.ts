/**
 * Offline mode handler - auto-fallback to Ollama when internet is unavailable
 */

import { checkInternetConnection, checkOllamaStatus, getOllamaConfig } from '../ollama'

export type CustomClaudeConfig = {
  model: string
  token: string
  baseUrl: string
  // Additional model configuration (optional)
  defaultOpusModel?: string // ANTHROPIC_DEFAULT_OPUS_MODEL
  defaultSonnetModel?: string // ANTHROPIC_DEFAULT_SONNET_MODEL
  defaultHaikuModel?: string // ANTHROPIC_DEFAULT_HAIKU_MODEL
  subagentModel?: string // CLAUDE_CODE_SUBAGENT_MODEL
}

export type OfflineCheckResult = {
  config: CustomClaudeConfig | undefined
  isUsingOllama: boolean
  error?: string
}

/**
 * Check if we should use Ollama as fallback
 * Priority:
 * 1. If customConfig provided → use it
 * 2. If offline mode enabled AND no internet → use Ollama
 * 3. If online + auth → use Claude API
 *
 * @param customConfig - Custom config from user settings
 * @param claudeCodeToken - Claude Code auth token
 * @param selectedOllamaModel - User-selected Ollama model (optional)
 * @param offlineModeEnabled - Whether offline mode is enabled in settings
 */
export async function checkOfflineFallback(
  customConfig: CustomClaudeConfig | undefined,
  claudeCodeToken: string | null,
  selectedOllamaModel?: string | null,
  offlineModeEnabled: boolean = false,
): Promise<OfflineCheckResult> {
  // If custom config is provided, use it (highest priority)
  if (customConfig) {
    const isUsingOllama = customConfig.baseUrl.includes('localhost:11434')
    return {
      config: customConfig,
      isUsingOllama,
    }
  }

  // If offline mode is disabled in settings, skip all Ollama checks
  // and just use Claude API (will fail with auth error if no token)
  if (!offlineModeEnabled) {
    return {
      config: undefined,
      isUsingOllama: false,
    }
  }

  // Check internet FIRST - if offline, use Ollama regardless of auth
  console.log('[Offline] Checking internet connectivity...')
  const hasInternet = await checkInternetConnection()
  console.log(`[Offline] Internet check result: ${hasInternet ? 'ONLINE' : 'OFFLINE'}`)

  if (!hasInternet) {
    // No internet - try Ollama
    console.log('[Offline] No internet connection, checking Ollama...')

    const ollamaStatus = await checkOllamaStatus()

    if (!ollamaStatus.available) {
      return {
        config: undefined,
        isUsingOllama: false,
        error: 'No internet connection and Ollama is not available. Please install Ollama or connect to internet.',
      }
    }

    if (!ollamaStatus.recommendedModel) {
      return {
        config: undefined,
        isUsingOllama: false,
        error: 'Ollama is running but no suitable model found. Please install a coding model like qwen2.5-coder:7b',
      }
    }

    // Use Ollama with selected model or recommended model
    console.log(`[Offline] selectedOllamaModel param: ${selectedOllamaModel || "(null/undefined)"}, recommendedModel: ${ollamaStatus.recommendedModel}`)
    const modelToUse = selectedOllamaModel || ollamaStatus.recommendedModel
    const config = getOllamaConfig(modelToUse)

    console.log(`[Offline] Switching to Ollama (model: ${modelToUse})`)

    return {
      config,
      isUsingOllama: true,
    }
  }

  // Internet is available - use Claude API with auth
  if (claudeCodeToken) {
    console.log('[Offline] Online with Claude auth - using Claude API')
    return {
      config: undefined,
      isUsingOllama: false,
    }
  }

  // Internet available but no auth - let it fail with auth error
  console.log('[Offline] Online but no Claude auth found')
  return {
    config: undefined,
    isUsingOllama: false,
  }
}
