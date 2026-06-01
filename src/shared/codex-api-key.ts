const ZERO_WIDTH_TOKEN_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g
const HEADER_SAFE_TOKEN_REGEX = /^[\x21-\x7E]+$/

export const LEGACY_CODEX_API_KEY_STORAGE_KEY = "onboarding:codex-api-key"

export function normalizeCodexApiKey(apiKey: string): string | null {
  const trimmed = apiKey.trim().replace(ZERO_WIDTH_TOKEN_CHARS_REGEX, "")
  if (!trimmed) return null
  if (!trimmed.startsWith("sk-")) return null
  if (!HEADER_SAFE_TOKEN_REGEX.test(trimmed)) return null
  return trimmed
}
