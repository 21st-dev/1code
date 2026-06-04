import { assertOfficialCloudAllowed } from "../local-only"

export const MAX_VOICE_AUDIO_SIZE_BYTES = 25 * 1024 * 1024
const API_TIMEOUT_MS = 30000

export type VoiceTranscriptionProviderConfig = {
  purpose?: string
  model: string
  baseUrl: string
  token: string
  source?: string
}

/**
 * Clean up transcribed text returned by OpenAI-compatible providers.
 */
function cleanTranscribedText(text: string): string {
  return (
    text
      .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      .replace(/[\r\n\u2028\u2029]+/g, " ")
      .replace(/\t+/g, " ")
      .replace(/ +/g, " ")
      .trim()
  )
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

/**
 * Transcribe audio using an OpenAI-compatible audio transcription API.
 */
export async function transcribeWithProviderConfig(
  audioBuffer: Buffer,
  format: string,
  providerConfig: VoiceTranscriptionProviderConfig,
  language?: string,
): Promise<string> {
  if (audioBuffer.length > MAX_VOICE_AUDIO_SIZE_BYTES) {
    throw new Error(
      `Audio too large (${Math.round(audioBuffer.length / 1024 / 1024)}MB). Maximum is 25MB.`,
    )
  }

  const formData = new FormData()
  const uint8Array = new Uint8Array(audioBuffer)
  const blob = new Blob([uint8Array], { type: `audio/${format}` })
  formData.append("file", blob, `audio.${format}`)
  formData.append("model", providerConfig.model)
  formData.append("response_format", "text")

  if (language) {
    formData.append("language", language)
  }

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
