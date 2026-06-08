/**
 * Shared provider-token helpers.
 *
 * Normalization and encryption of provider credentials used to be duplicated
 * verbatim across the Claude provider store, the local-API provider config, and
 * the runtime-neutral provider profiles. They are consolidated here so the
 * token-validation rules (zero-width stripping, header-safety) and the encryption
 * wrappers have a single source of truth.
 */
import {
  decryptStringFromStorage,
  encryptStringForStorage,
} from "./secure-storage"

// Zero-width characters that can sneak into pasted tokens.
const ZERO_WIDTH_TOKEN_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g
// Tokens must be safe to place in an HTTP header value (printable ASCII, no spaces).
const HEADER_SAFE_TOKEN_REGEX = /^[\x21-\x7E]+$/

/** Trim and drop trailing slashes from a provider base URL. */
export function normalizeProviderBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

/**
 * Trim, strip zero-width characters, and validate that a provider token is
 * header-safe. Throws if the token is empty or contains unsupported characters.
 */
export function normalizeProviderToken(token: string): string {
  const normalized = token.trim().replace(ZERO_WIDTH_TOKEN_CHARS_REGEX, "")

  if (!normalized) {
    throw new Error("Token is required")
  }

  if (!HEADER_SAFE_TOKEN_REGEX.test(normalized)) {
    throw new Error("Token contains whitespace or unsupported characters")
  }

  return normalized
}

/** Encrypt a provider token for at-rest storage. */
export function encryptProviderToken(token: string): string {
  return encryptStringForStorage(token)
}

/** Decrypt a stored provider token, or null when secure storage is unavailable. */
export function decryptProviderToken(encrypted: string): string | null {
  return decryptStringFromStorage(encrypted)
}
