const ZERO_WIDTH_TOKEN_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g
const HEADER_SAFE_TOKEN_REGEX = /^[\x21-\x7E]+$/

export const LEGACY_OPENAI_API_KEY_STORAGE_KEY = "agents:openai-api-key"
export const OPENAI_TRANSCRIPTION_BASE_URL = "https://api.openai.com/v1"
export const OPENAI_TRANSCRIPTION_MODEL = "whisper-1"

function parseMaybeJsonString(value: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith("\"")) return trimmed

  try {
    const parsed = JSON.parse(trimmed)
    return typeof parsed === "string" ? parsed : trimmed
  } catch {
    return trimmed
  }
}

export function normalizeLegacyOpenAIApiKey(apiKey: string): string | null {
  const normalized = parseMaybeJsonString(apiKey)
    .trim()
    .replace(ZERO_WIDTH_TOKEN_CHARS_REGEX, "")

  if (!normalized) return null
  if (!normalized.startsWith("sk-")) return null
  if (!HEADER_SAFE_TOKEN_REGEX.test(normalized)) return null
  return normalized
}
