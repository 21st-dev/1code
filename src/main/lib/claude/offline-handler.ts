/**
 * Offline mode handler - auto-fallback to Ollama when internet is unavailable
 */

import { checkInternetConnection, checkOllamaStatus, getOllamaConfig } from '../ollama'

export type CustomClaudeConfig = {
  model: string
  token: string
  baseUrl: string
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
 * 2. If OFFLINE → use Ollama (ignore auth token)
 * 3. If online + auth → use Claude API
 */
export async function checkOfflineFallback(
  customConfig: CustomClaudeConfig | undefined,
  claudeCodeToken: string | null,
): Promise<OfflineCheckResult> {
  // If custom config is provided, use it (highest priority)
  if (customConfig) {
    const isUsingOllama = customConfig.baseUrl.includes('localhost:11434')
    return {
      config: customConfig,
      isUsingOllama,
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

    // Use Ollama!
    const config = getOllamaConfig(ollamaStatus.recommendedModel)

    console.log(`[Offline] Switching to Ollama (model: ${ollamaStatus.recommendedModel})`)

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
