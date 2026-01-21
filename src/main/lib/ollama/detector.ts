/**
 * Ollama detector and status checker
 */

export interface OllamaStatus {
  available: boolean       // Is Ollama running and accessible
  version?: string         // Ollama version
  models: string[]         // Installed models
  recommendedModel?: string // Best model for coding
}

/**
 * Check if Ollama is running and get status
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    // Check if Ollama server is running
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)

    const response = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return { available: false, models: [] }
    }

    const data = await response.json()
    const models = data.models?.map((m: any) => m.name) || []

    // Recommended coding models (in order of preference)
    // Check for exact matches first, then check for any qwen/deepseek/codestral variant
    const codingModels = [
      'qwen2.5-coder:7b',
      'qwen2.5-coder:3b',
      'qwen2.5-coder:1.5b',
      'qwen3-coder:30b',
      'qwen3-coder:14b',
      'qwen3-coder:8b',
      'qwen3-coder:4b',
      'deepseek-coder:6.7b',
      'deepseek-coder:33b',
      'codestral:22b',
    ]

    let recommendedModel = codingModels.find(m => models.includes(m))

    // If no exact match, try to find any qwen-coder, deepseek-coder, or codestral variant
    if (!recommendedModel) {
      recommendedModel = models.find(m =>
        m.includes('qwen') && m.includes('coder') ||
        m.includes('deepseek') && m.includes('coder') ||
        m.includes('codestral')
      )
    }

    console.log(`[Ollama] Available: ${models.length} models found`, models)

    return {
      available: true,
      models,
      recommendedModel: recommendedModel || models[0], // Fallback to any model
      version: data.version,
    }
  } catch (error) {
    console.log('[Ollama] Not available:', error)
    return { available: false, models: [] }
  }
}

/**
 * Get Ollama config for offline mode
 */
export function getOllamaConfig(modelName?: string): {
  model: string
  token: string
  baseUrl: string
} {
  return {
    model: modelName || 'qwen2.5-coder:7b',
    token: 'ollama',
    baseUrl: 'http://localhost:11434',
  }
}
