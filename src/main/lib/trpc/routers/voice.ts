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
import {
  MAX_VOICE_AUDIO_SIZE_BYTES,
  transcribeWithProviderConfig,
} from "../../voice/transcription"
import { publicProcedure, router } from "../index"

const VOICE_TRANSCRIPTION_PURPOSE = "voice_transcription" as const
const MAX_BASE64_AUDIO_LENGTH =
  Math.ceil((MAX_VOICE_AUDIO_SIZE_BYTES * 4) / 3) + 8
const BASE64_AUDIO_REGEX = /^[A-Za-z0-9+/]+={0,2}$/
const LANGUAGE_CODE_REGEX = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/

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
      if (audioBuffer.length > MAX_VOICE_AUDIO_SIZE_BYTES) {
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
