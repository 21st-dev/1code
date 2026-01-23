/**
 * Ollama TRPC router
 * Provides offline mode status and configuration
 */

import { z } from "zod"
import { checkInternetConnection, checkOllamaStatus } from "../../ollama"
import { publicProcedure, router } from "../index"

/**
 * Generate text using local Ollama model
 * Used for chat title generation and commit messages in offline mode
 * @param prompt - The prompt to send to Ollama
 * @param model - Optional model to use (if not provided, uses recommended or first available)
 */
async function generateWithOllama(
  prompt: string,
  model?: string | null
): Promise<string | null> {
  try {
    const ollamaStatus = await checkOllamaStatus()
    if (!ollamaStatus.available) {
      return null
    }

    // Use provided model, or recommended, or first available
    const modelToUse = model || ollamaStatus.recommendedModel || ollamaStatus.models[0]
    if (!modelToUse) {
      console.error("[Ollama] No model available")
      return null
    }

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 50, // Short responses for titles
        },
      }),
    })

    if (!response.ok) {
      console.error("[Ollama] Generate failed:", response.status)
      return null
    }

    const data = await response.json()
    return data.response?.trim() || null
  } catch (error) {
    console.error("[Ollama] Generate error:", error)
    return null
  }
}

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

  /**
   * Get list of installed models
   */
  getModels: publicProcedure.query(async () => {
    const ollamaStatus = await checkOllamaStatus()
    return {
      available: ollamaStatus.available,
      models: ollamaStatus.models,
      recommendedModel: ollamaStatus.recommendedModel,
    }
  }),

  /**
   * Generate a chat name using local Ollama model
   * Used in offline mode for sub-chat title generation
   */
  generateChatName: publicProcedure
    .input(z.object({ userMessage: z.string(), model: z.string().optional() }))
    .mutation(async ({ input }) => {
      const prompt = `Generate a very short (2-5 words) title for a coding chat that starts with this message. Only output the title, nothing else. No quotes, no explanations.

User message: "${input.userMessage.slice(0, 500)}"

Title:`

      const result = await generateWithOllama(prompt, input.model)
      if (result) {
        // Clean up the result - remove quotes, trim, limit length
        const cleaned = result
          .replace(/^["']|["']$/g, "")
          .replace(/^title:\s*/i, "")
          .trim()
          .slice(0, 50)
        if (cleaned.length > 0) {
          return { name: cleaned }
        }
      }
      return { name: null }
    }),

  /**
   * Generate a commit message using local Ollama model
   * Used in offline mode for commit message generation
   */
  generateCommitMessage: publicProcedure
    .input(
      z.object({
        diff: z.string(),
        fileCount: z.number(),
        additions: z.number(),
        deletions: z.number(),
        model: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const prompt = `Generate a conventional commit message for these changes. Use format: type: short description

Types: feat (new feature), fix (bug fix), docs, style, refactor, test, chore

Changes: ${input.fileCount} files, +${input.additions}/-${input.deletions} lines

Diff (truncated):
${input.diff.slice(0, 3000)}

Commit message:`

      const result = await generateWithOllama(prompt, input.model)
      if (result) {
        // Clean up - get just the first line
        const firstLine = result.split("\n")[0]?.trim()
        if (firstLine && firstLine.length > 0 && firstLine.length < 100) {
          return { message: firstLine }
        }
      }
      return { message: null }
    }),
})
