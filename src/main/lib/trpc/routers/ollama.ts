/**
 * Ollama TRPC router
 * Provides offline mode status and configuration
 */

import { z } from "zod"
import { checkInternetConnection, checkOllamaStatus } from "../../ollama"
import { publicProcedure, router } from "../index"

export const ollamaRouter = router({
  /**
   * Get Ollama and network status
   */
  getStatus: publicProcedure.query(async () => {
    const [ollamaStatus, hasInternet] = await Promise.all([
      checkOllamaStatus(),
      checkInternetConnection(),
    ])

    return {
      ollama: ollamaStatus,
      internet: {
        online: hasInternet,
        checked: Date.now(),
      },
    }
  }),

  /**
   * Check if offline mode is available
   */
  isOfflineModeAvailable: publicProcedure.query(async () => {
    const ollamaStatus = await checkOllamaStatus()
    return {
      available: ollamaStatus.available && !!ollamaStatus.recommendedModel,
      model: ollamaStatus.recommendedModel,
    }
  }),
})
