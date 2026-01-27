/**
 * Ollama TRPC router
 * Provides offline mode status and configuration
 */

import { z } from "zod"
import { checkInternetConnection, checkOllamaStatus } from "../../ollama"
import { publicProcedure, router } from "../index"

/**
 * Types for input refinement
 */
const WorkspaceFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  content: z.string(),
})

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
})

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

  /**
   * Refine user input using local Ollama model
   * Enhances prompts with file references, structure, and codebase context
   */
  refineInput: publicProcedure
    .input(
      z.object({
        userInput: z.string(),
        chatHistory: z.array(MessageSchema).optional().default([]),
        workspaceFiles: z.array(WorkspaceFileSchema).optional().default([]),
        model: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Build context sections
      let workspaceFilesSection = ""
      if (input.workspaceFiles.length > 0) {
        workspaceFilesSection = `WORKSPACE FILES:\n${input.workspaceFiles
          .map((f) => `- ${f.path}`)
          .join("\n")}\n\n`
      }

      let chatHistorySection = ""
      if (input.chatHistory.length > 0) {
        chatHistorySection = `RECENT CHAT HISTORY:\n${input.chatHistory
          .map((msg) => `${msg.role.toUpperCase()}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? "..." : ""}`)
          .join("\n")}\n\n`
      }

      const prompt = `You are helping clarify a vague coding request by understanding what the user is referring to and making it specific.

${workspaceFilesSection}${chatHistorySection}USER'S VAGUE INPUT:
${input.userInput}

YOUR TASK:
- Identify what files/components/functions the user is likely referring to based on context
- Replace vague terms like "the bug", "that function", "this component" with specific references
- Add @file mentions for any files that should be examined (use exact paths from workspace files above)
- Keep it brief and natural - don't over-explain, just make the vague parts specific

EXAMPLES:
Vague: "fix the bug"
Better: "Fix the authentication bug in @src/auth/login.tsx"

Vague: "update that function"
Better: "Update the validateToken function in @src/utils/auth.ts"

Vague: "the component isn't working"
Better: "The UserProfile component in @src/components/UserProfile.tsx isn't rendering correctly"

Now refine this input (output ONLY the improved version, no explanations):`

      try {
        const ollamaStatus = await checkOllamaStatus()
        if (!ollamaStatus.available) {
          return { refinedInput: null }
        }

        const modelToUse = input.model || ollamaStatus.recommendedModel || ollamaStatus.models[0]
        if (!modelToUse) {
          console.error("[Ollama] No model available for input refinement")
          return { refinedInput: null }
        }

        const response = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelToUse,
            prompt,
            stream: false,
            options: {
              temperature: 0.7,
              num_predict: 500,
            },
          }),
        })

        if (!response.ok) {
          console.error("[Ollama] Refine input failed:", response.status)
          return { refinedInput: null }
        }

        const data = await response.json()
        const refined = data.response?.trim()

        if (refined && refined.length > 0) {
          return { refinedInput: refined }
        }

        return { refinedInput: null }
      } catch (error) {
        console.error("[Ollama] Refine input error:", error)
        return { refinedInput: null }
      }
    }),
})
