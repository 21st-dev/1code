/**
 * Voice TRPC router
 * Provides voice-to-text transcription using OpenAI Whisper API
 *
 * For authenticated users (with subscription): uses 21st.dev backend
 * For open-source users: requires OPENAI_API_KEY in environment
 */

import { execSync } from "node:child_process"
import os from "node:os"
import { z } from "zod"
import { publicProcedure, router } from "../index"
import { getApiUrl } from "../../config"
import { getAuthManager } from "../../../auth-manager"

// Max audio size: 25MB (Whisper API limit)
const MAX_AUDIO_SIZE = 25 * 1024 * 1024

// API request timeout: 30 seconds
const API_TIMEOUT_MS = 30000

/**
 * Clean up transcribed text
 * - Remove leading/trailing whitespace
 * - Collapse multiple spaces/newlines into single space
 * - Remove any weird unicode whitespace characters
 * - Remove zero-width characters and other invisible unicode
 */
function cleanTranscribedText(text: string): string {
  return (
    text
      // Remove zero-width and invisible characters
      .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
      // Normalize unicode whitespace to regular space
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      // Replace all types of newlines and line breaks with space
      .replace(/[\r\n\u2028\u2029]+/g, " ")
      // Replace tabs with space
      .replace(/\t+/g, " ")
      // Collapse multiple spaces into one
      .replace(/ +/g, " ")
      // Trim leading/trailing whitespace
      .trim()
  )
}

// Cache for OpenAI API key
let cachedOpenAIKey: string | null | undefined = undefined

// User-configured OpenAI API key (from settings, set via IPC)
let userConfiguredOpenAIKey: string | null = null

/**
 * Set OpenAI API key from user settings
 * Called from renderer via tRPC
 */
export function setUserOpenAIKey(key: string | null): void {
  userConfiguredOpenAIKey = key?.trim() || null
  // Clear env cache so next call re-evaluates
  cachedOpenAIKey = undefined
}

// Cache for user plan (to avoid repeated API calls)
let cachedUserPlan: { plan: string; status: string | null; fetchedAt: number } | null = null
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch and cache user's subscription plan
 */
async function getUserPlan(): Promise<{ plan: string; status: string | null } | null> {
  const authManager = getAuthManager()
  if (!authManager?.isAuthenticated()) {
    return null
  }

  // Return cached plan if still fresh
  if (cachedUserPlan && Date.now() - cachedUserPlan.fetchedAt < PLAN_CACHE_TTL_MS) {
    return { plan: cachedUserPlan.plan, status: cachedUserPlan.status }
  }

  try {
    const planData = await authManager.fetchUserPlan()
    if (planData) {
      cachedUserPlan = {
        plan: planData.plan,
        status: planData.status,
        fetchedAt: Date.now(),
      }
      return { plan: planData.plan, status: planData.status }
    }
  } catch (err) {
    console.error("[Voice] Failed to fetch user plan:", err)
  }

  return null
}

/**
 * Check if user has paid subscription (onecode_pro or onecode_max with active status)
 */
async function hasPaidSubscription(): Promise<boolean> {
  const planData = await getUserPlan()
  if (!planData) return false

  const paidPlans = ["onecode_pro", "onecode_max"]
  return paidPlans.includes(planData.plan) && planData.status === "active"
}

/**
 * Clear plan cache (for testing or when subscription changes)
 */
export function clearPlanCache(): void {
  cachedUserPlan = null
}

/**
 * Get OpenAI API key from multiple sources (priority order):
 * 1. User-configured key from settings
 * 2. Vite env vars (.env.local files)
 * 3. process.env
 * 4. Shell environment
 */
function getOpenAIApiKey(): string | null {
  // First check user-configured key (highest priority, not cached)
  if (userConfiguredOpenAIKey && userConfiguredOpenAIKey.startsWith("sk-")) {
    return userConfiguredOpenAIKey
  }

  // Return cached value if already fetched from env
  if (cachedOpenAIKey !== undefined) {
    return cachedOpenAIKey
  }

  // Check Vite env vars (works with .env.local files)
  const viteKey = (import.meta.env as Record<string, string | undefined>)
    .MAIN_VITE_OPENAI_API_KEY
  if (viteKey) {
    cachedOpenAIKey = viteKey
    console.log(
      "[Voice] Using OPENAI_API_KEY from Vite env (MAIN_VITE_OPENAI_API_KEY)"
    )
    return cachedOpenAIKey
  }

  // Check process.env (works in dev mode)
  if (process.env.OPENAI_API_KEY) {
    cachedOpenAIKey = process.env.OPENAI_API_KEY
    console.log("[Voice] Using OPENAI_API_KEY from process.env")
    return cachedOpenAIKey
  }

  // Try to get from shell environment (for production builds)
  try {
    const shell = process.env.SHELL || "/bin/zsh"
    const result = execSync(`${shell} -ilc 'echo $OPENAI_API_KEY'`, {
      encoding: "utf8",
      timeout: 5000,
      env: {
        HOME: os.homedir(),
        USER: os.userInfo().username,
        SHELL: shell,
      } as unknown as NodeJS.ProcessEnv,
    })

    const key = result.trim()
    if (key && key !== "$OPENAI_API_KEY" && key.startsWith("sk-")) {
      cachedOpenAIKey = key
      console.log("[Voice] Using OPENAI_API_KEY from shell environment")
      return cachedOpenAIKey
    }
  } catch (err) {
    console.error("[Voice] Failed to read OPENAI_API_KEY from shell:", err)
  }

  cachedOpenAIKey = null
  return null
}

/**
 * Clear cached API key (for testing)
 */
export function clearOpenAIKeyCache(): void {
  cachedOpenAIKey = undefined
}

/**
 * Transcribe audio using 21st.dev backend (for authenticated users)
 */
async function transcribeViaBackend(
  audioBuffer: Buffer,
  format: string,
  language?: string
): Promise<string> {
  const authManager = getAuthManager()
  if (!authManager) {
    throw new Error("Auth manager not initialized")
  }
  const token = await authManager.getValidToken()
  if (!token) {
    throw new Error("Not authenticated")
  }

  const apiUrl = getApiUrl()

  // Create form data for the API request
  const formData = new FormData()
  const uint8Array = new Uint8Array(audioBuffer)
  const blob = new Blob([uint8Array], { type: `audio/${format}` })
  formData.append("file", blob, `audio.${format}`)
  if (language) {
    formData.append("language", language)
  }

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const response = await fetch(`${apiUrl}/api/voice/transcribe`, {
      method: "POST",
      headers: {
        "X-Desktop-Token": token,
      },
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Voice] Backend API error:", response.status, errorText)

      if (response.status === 401) {
        throw new Error("Authentication expired. Please sign in again.")
      } else if (response.status === 403) {
        throw new Error("Voice transcription requires a paid subscription.")
      } else if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.")
      } else if (response.status >= 500) {
        throw new Error("Service temporarily unavailable")
      }
      throw new Error(`Transcription failed (${response.status})`)
    }

    const data = await response.json()
    return cleanTranscribedText(data.text || "")
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Transcription timed out. Please try again.")
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Transcribe audio using OpenAI Whisper API directly (for open-source users)
 */
async function transcribeWithWhisper(
  audioBuffer: Buffer,
  format: string,
  language?: string
): Promise<string> {
  const key = getOpenAIApiKey()
  if (!key) {
    throw new Error(
      "OpenAI API key not configured. Set OPENAI_API_KEY environment variable."
    )
  }

  // Check audio size limit
  if (audioBuffer.length > MAX_AUDIO_SIZE) {
    throw new Error(
      `Audio too large (${Math.round(audioBuffer.length / 1024 / 1024)}MB). Maximum is 25MB.`
    )
  }

  // Create form data for the API request
  const formData = new FormData()

  // Convert buffer to blob (need to convert to Uint8Array for Blob constructor)
  const uint8Array = new Uint8Array(audioBuffer)
  const blob = new Blob([uint8Array], { type: `audio/${format}` })
  formData.append("file", blob, `audio.${format}`)
  formData.append("model", "whisper-1")
  formData.append("response_format", "text")

  if (language) {
    formData.append("language", language)
  }

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
        },
        body: formData,
        signal: controller.signal,
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Voice] Whisper API error:", response.status, errorText)

      // Provide user-friendly error messages
      if (response.status === 401) {
        throw new Error("Invalid OpenAI API key")
      } else if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.")
      } else if (response.status >= 500) {
        throw new Error("OpenAI service temporarily unavailable")
      }
      throw new Error(`Transcription failed (${response.status})`)
    }

    const text = await response.text()
    return cleanTranscribedText(text)
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Transcription timed out. Please try again.")
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export const voiceRouter = router({
  /**
   * Transcribe audio to text
   * Priority: local OPENAI_API_KEY first, then backend for authenticated users
   */
  transcribe: publicProcedure
    .input(
      z.object({
        audio: z.string(), // base64 encoded audio
        format: z.enum(["webm", "wav", "mp3", "m4a", "ogg"]).default("webm"),
        language: z.string().optional(), // ISO 639-1 code (e.g., "en", "ru")
      })
    )
    .mutation(async ({ input }) => {
      const audioBuffer = Buffer.from(input.audio, "base64")

      console.log(
        `[Voice] Transcribing ${audioBuffer.length} bytes of ${input.format} audio`
      )

      // Check audio size limit
      if (audioBuffer.length > MAX_AUDIO_SIZE) {
        throw new Error(
          `Audio too large (${Math.round(audioBuffer.length / 1024 / 1024)}MB). Maximum is 25MB.`
        )
      }

      // If local OPENAI_API_KEY exists, use it directly (fastest, no network to backend)
      const hasLocalKey = !!getOpenAIApiKey()
      if (hasLocalKey) {
        const text = await transcribeWithWhisper(
          audioBuffer,
          input.format,
          input.language
        )
        console.log(`[Voice] Local transcription result: "${text.slice(0, 100)}..."`)
        return { text }
      }

      // Otherwise, try backend if user is authenticated
      const authManager = getAuthManager()
      const isAuthenticated = authManager?.isAuthenticated() ?? false
      if (isAuthenticated) {
        const text = await transcribeViaBackend(
          audioBuffer,
          input.format,
          input.language
        )
        console.log(
          `[Voice] Backend transcription result: "${text.slice(0, 100)}..."`
        )
        return { text }
      }

      // No local key and not authenticated
      throw new Error(
        "Voice input requires signing in or setting OPENAI_API_KEY environment variable"
      )
    }),

  /**
   * Check if voice transcription is available
   * Available if: has local OPENAI_API_KEY OR user has paid subscription
   */
  isAvailable: publicProcedure.query(async () => {
    const hasLocalKey = !!getOpenAIApiKey()

    // Local API key always works
    if (hasLocalKey) {
      return {
        available: true,
        method: "local" as const,
        reason: undefined,
      }
    }

    // Check if user has paid subscription
    const hasPaid = await hasPaidSubscription()
    if (hasPaid) {
      return {
        available: true,
        method: "backend" as const,
        reason: undefined,
      }
    }

    // Check if authenticated but free plan
    const authManager = getAuthManager()
    const isAuthenticated = authManager?.isAuthenticated() ?? false

    if (isAuthenticated) {
      return {
        available: false,
        method: null,
        reason: "Voice input requires a paid subscription or OpenAI API key",
      }
    }

    return {
      available: false,
      method: null,
      reason:
        "Add your OpenAI API key in Settings > Models, or sign in with a paid subscription",
    }
  }),

  /**
   * Set OpenAI API key from user settings
   * This allows users without a paid subscription to use their own API key
   */
  setOpenAIKey: publicProcedure
    .input(z.object({ key: z.string() }))
    .mutation(({ input }) => {
      const key = input.key.trim()

      // Validate key format if provided
      if (key && !key.startsWith("sk-")) {
        throw new Error("Invalid OpenAI API key format. Key should start with 'sk-'")
      }

      setUserOpenAIKey(key || null)

      // Clear plan cache so isAvailable re-evaluates
      clearPlanCache()

      return { success: true }
    }),

  /**
   * Check if user has configured an OpenAI API key
   */
  hasOpenAIKey: publicProcedure.query(() => {
    return { hasKey: !!getOpenAIApiKey() }
  }),
})
