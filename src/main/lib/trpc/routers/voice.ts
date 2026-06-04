/**
 * Voice TRPC router
 * Provides voice-to-text transcription using a user-configured
 * OpenAI-compatible audio transcription API.
 *
 * Local-first builds store provider credentials in main-process secure storage.
 */

import { z } from "zod"
import {
  getActiveLocalApiProviderConfig,
  type LocalApiProviderRuntimeConfig,
} from "./local-api-provider-config"
import { assertOfficialCloudAllowed } from "../../local-only"
import { publicProcedure, router } from "../index"

// Max audio size: 25MB (Whisper API limit)
const MAX_AUDIO_SIZE = 25 * 1024 * 1024

// API request timeout: 30 seconds
const API_TIMEOUT_MS = 30000

const VOICE_TRANSCRIPTION_PURPOSE = "voice_transcription" as const
const MAX_BASE64_AUDIO_LENGTH = Math.ceil((MAX_AUDIO_SIZE * 4) / 3) + 8
const BASE64_AUDIO_REGEX = /^[A-Za-z0-9+/]+={0,2}$/
const LANGUAGE_CODE_REGEX = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/

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

export type VoiceTranscriptionProviderConfig = LocalApiProviderRuntimeConfig & {
  source: "stored"
}

function getVoiceTranscriptionProviderConfig():
  | VoiceTranscriptionProviderConfig
  | undefined {
  const storedConfig = getActiveLocalApiProviderConfig(VOICE_TRANSCRIPTION_PURPOSE)
  if (storedConfig) {
    return { ...storedConfig, source: "stored" }
  }

  return undefined
}

export function buildTranscriptionUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "")
  if (!trimmed) {
    throw new Error("Voice transcription API base URL is required")
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error("Voice transcription API base URL is invalid")
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Voice transcription API base URL must be HTTP or HTTPS")
  }

  if (parsed.username || parsed.password) {
    throw new Error("Voice transcription API base URL must not contain credentials")
  }

  parsed.search = ""
  parsed.hash = ""

  if (parsed.pathname.endsWith("/audio/transcriptions")) {
    return parsed.toString().replace(/\/+$/, "")
  }

  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/audio/transcriptions`
  return parsed.toString()
}

function decodeBase64Audio(audio: string): Buffer {
  const normalized = audio.trim()
  if (
    !normalized ||
    normalized.length % 4 === 1 ||
    !BASE64_AUDIO_REGEX.test(normalized)
  ) {
    throw new Error("Invalid audio payload")
  }

  return Buffer.from(normalized, "base64")
}

/**
 * Transcribe audio using an OpenAI-compatible audio transcription API.
 */
export async function transcribeWithProviderConfig(
  audioBuffer: Buffer,
  format: string,
  providerConfig: VoiceTranscriptionProviderConfig,
  language?: string
): Promise<string> {
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
  formData.append("model", providerConfig.model)
  formData.append("response_format", "text")

  if (language) {
    formData.append("language", language)
  }

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const transcriptionUrl = buildTranscriptionUrl(providerConfig.baseUrl)
    assertOfficialCloudAllowed(
      "transcribe voice with configured provider",
      transcriptionUrl,
    )

    const response = await fetch(transcriptionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerConfig.token}`,
      },
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error("[Voice] Transcription API error:", response.status)

      // Provide user-friendly error messages
      if (response.status === 401) {
        throw new Error("Invalid voice transcription API key")
      } else if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.")
      } else if (response.status >= 500) {
        throw new Error("Voice transcription service temporarily unavailable")
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
   * Requires a user-owned transcription provider API key.
   */
  transcribe: publicProcedure
    .input(
      z.object({
        audio: z.string().max(MAX_BASE64_AUDIO_LENGTH), // base64 encoded audio
        format: z.enum(["webm", "wav", "mp3", "m4a", "ogg"]).default("webm"),
        language: z
          .string()
          .regex(LANGUAGE_CODE_REGEX)
          .optional(), // ISO 639 language code (e.g., "en", "zh-CN")
      })
    )
    .mutation(async ({ input }) => {
      if (input.audio.length > MAX_BASE64_AUDIO_LENGTH) {
        throw new Error("Audio too large. Maximum is 25MB.")
      }

      const audioBuffer = decodeBase64Audio(input.audio)

      console.log(
        `[Voice] Transcribing ${audioBuffer.length} bytes of ${input.format} audio`
      )

      // Check audio size limit
      if (audioBuffer.length > MAX_AUDIO_SIZE) {
        throw new Error(
          `Audio too large (${Math.round(audioBuffer.length / 1024 / 1024)}MB). Maximum is 25MB.`
        )
      }

      const providerConfig = getVoiceTranscriptionProviderConfig()
      if (providerConfig) {
        const text = await transcribeWithProviderConfig(
          audioBuffer,
          input.format,
          providerConfig,
          input.language,
        )
        console.log("[Voice] Transcription completed")
        return { text }
      }

      throw new Error(
        "Voice input requires a transcription API. Configure it in Settings > Models > Helper APIs."
      )
    }),

  /**
   * Check if voice transcription is available
   * Available if the user has configured a transcription API key.
   */
  isAvailable: publicProcedure.query(() => {
    const providerConfig = getVoiceTranscriptionProviderConfig()

    if (providerConfig) {
      return {
        available: true,
        method: "stored" as const,
        reason: undefined,
      }
    }

    return {
      available: false,
      method: null,
      reason:
        "Configure Voice Transcription API in Settings > Models > Helper APIs to use voice input.",
    }
  }),

})
