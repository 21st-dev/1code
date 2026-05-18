export type ClaudeOAuthCredentialSource =
  | "macos_keychain"
  | "windows_credentials_file"
  | "linux_secret_service"
  | "linux_pass"
  | "credentials_file"

export type ClaudeCodeCredentialStorageFormat = "envelope" | "legacy_plain_token"

export type ClaudeCodeCredentialEnvelope = {
  version: 1
  kind: "claude_code_oauth"
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scopes?: string[]
  source?: ClaudeOAuthCredentialSource | "hosted_oauth" | "manual" | "legacy_db"
  importedAt: string
  updatedAt: string
}

export type ClaudeOAuthCredentialLike = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scopes?: string[]
  source?: ClaudeOAuthCredentialSource
}

export type StoredClaudeCodeCredential = {
  envelope: ClaudeCodeCredentialEnvelope
  storageFormat: ClaudeCodeCredentialStorageFormat
}

function normalizeSource(
  source: ClaudeCodeCredentialEnvelope["source"] | undefined,
): ClaudeCodeCredentialEnvelope["source"] {
  return source ?? "manual"
}

export function createClaudeCodeCredentialEnvelope(
  credential: ClaudeOAuthCredentialLike,
  source?: ClaudeCodeCredentialEnvelope["source"],
  previous?: ClaudeCodeCredentialEnvelope,
): ClaudeCodeCredentialEnvelope {
  const now = new Date().toISOString()

  return {
    version: 1,
    kind: "claude_code_oauth",
    accessToken: credential.accessToken,
    ...(credential.refreshToken && { refreshToken: credential.refreshToken }),
    ...(credential.expiresAt && { expiresAt: credential.expiresAt }),
    ...(credential.scopes && { scopes: credential.scopes }),
    source: normalizeSource(source ?? credential.source),
    importedAt: previous?.importedAt ?? now,
    updatedAt: now,
  }
}

function isEnvelope(value: unknown): value is ClaudeCodeCredentialEnvelope {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<ClaudeCodeCredentialEnvelope>
  return (
    candidate.version === 1 &&
    candidate.kind === "claude_code_oauth" &&
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.trim().length > 0
  )
}

export function parseClaudeCodeCredentialPayload(
  payload: string,
): StoredClaudeCodeCredential | null {
  const trimmed = payload.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (isEnvelope(parsed)) {
      return {
        envelope: parsed,
        storageFormat: "envelope",
      }
    }
  } catch {
    // Legacy rows decrypt to a bare access token string.
  }

  return {
    envelope: {
      version: 1,
      kind: "claude_code_oauth",
      accessToken: trimmed,
      source: "legacy_db",
      importedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    storageFormat: "legacy_plain_token",
  }
}
