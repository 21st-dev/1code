import { eq, sql } from "drizzle-orm"
import { safeStorage } from "electron"
import {
  getExistingClaudeCredentials,
  isTokenExpired,
  refreshClaudeToken,
  type ClaudeOAuthCredential,
  type ClaudeOAuthCredentialSource,
} from "./claude-token"
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
  getDatabase,
} from "./db"
import { createId } from "./db/utils"

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

export type ClaudeCodeCredentialMetadata = {
  isConnected: boolean
  accountId: string | null
  displayName: string | null
  connectedAt: string | null
  source: string | null
  storageFormat: ClaudeCodeCredentialStorageFormat | null
  hasRefreshToken: boolean
  refreshable: boolean
  expiresAt: string | null
  isExpired: boolean
  isExpiringSoon: boolean
  importedAt: string | null
  updatedAt: string | null
  encryptionAvailable: boolean
}

type StoredClaudeCodeCredential = {
  envelope: ClaudeCodeCredentialEnvelope
  storageFormat: ClaudeCodeCredentialStorageFormat
}

type ActiveCredentialRow = {
  account: typeof anthropicAccounts.$inferSelect | null
  legacy: typeof claudeCodeCredentials.$inferSelect | null
}

function encryptSecret(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[ClaudeCredentials] Encryption not available, storing as base64")
    return Buffer.from(value).toString("base64")
  }

  return safeStorage.encryptString(value).toString("base64")
}

function decryptSecret(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }

  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

function toIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function normalizeSource(
  source: ClaudeOAuthCredentialSource | "hosted_oauth" | "manual" | "legacy_db" | undefined,
): ClaudeCodeCredentialEnvelope["source"] {
  return source ?? "manual"
}

export function createClaudeCodeCredentialEnvelope(
  credential: ClaudeOAuthCredential,
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

export function decryptClaudeCodeCredential(
  encrypted: string,
): StoredClaudeCodeCredential | null {
  return parseClaudeCodeCredentialPayload(decryptSecret(encrypted))
}

function encryptClaudeCodeCredential(
  envelope: ClaudeCodeCredentialEnvelope,
): string {
  return encryptSecret(JSON.stringify(envelope))
}

function getActiveCredentialRow(): ActiveCredentialRow {
  const db = getDatabase()

  const settings = db
    .select()
    .from(anthropicSettings)
    .where(eq(anthropicSettings.id, "singleton"))
    .get()

  const account = settings?.activeAccountId
    ? db
      .select()
      .from(anthropicAccounts)
      .where(eq(anthropicAccounts.id, settings.activeAccountId))
      .get() ?? null
    : null

  const legacy = db
    .select()
    .from(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, "default"))
    .get() ?? null

  return { account, legacy }
}

function parseActiveCredential(): {
  stored: StoredClaudeCodeCredential | null
  account: typeof anthropicAccounts.$inferSelect | null
  legacy: typeof claudeCodeCredentials.$inferSelect | null
} {
  const { account, legacy } = getActiveCredentialRow()

  if (account?.oauthToken) {
    return {
      stored: decryptClaudeCodeCredential(account.oauthToken),
      account,
      legacy,
    }
  }

  if (legacy?.oauthToken) {
    return {
      stored: decryptClaudeCodeCredential(legacy.oauthToken),
      account,
      legacy,
    }
  }

  return { stored: null, account, legacy }
}

function credentialMetadataFromStored(
  stored: StoredClaudeCodeCredential | null,
  account: typeof anthropicAccounts.$inferSelect | null,
  legacy: typeof claudeCodeCredentials.$inferSelect | null,
): ClaudeCodeCredentialMetadata {
  const envelope = stored?.envelope
  const expiresAt = envelope?.expiresAt ? new Date(envelope.expiresAt) : null

  return {
    isConnected: Boolean(envelope?.accessToken),
    accountId: account?.id ?? null,
    displayName: account?.displayName ?? null,
    connectedAt: toIsoString(account?.connectedAt ?? legacy?.connectedAt),
    source: envelope?.source ?? null,
    storageFormat: stored?.storageFormat ?? null,
    hasRefreshToken: Boolean(envelope?.refreshToken),
    refreshable: Boolean(envelope?.refreshToken),
    expiresAt: expiresAt?.toISOString() ?? null,
    isExpired: isTokenExpired(envelope?.expiresAt),
    isExpiringSoon: isTokenExpired(envelope?.expiresAt),
    importedAt: envelope?.importedAt ?? null,
    updatedAt: envelope?.updatedAt ?? null,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  }
}

export function getClaudeCodeCredentialMetadata(): ClaudeCodeCredentialMetadata {
  const { stored, account, legacy } = parseActiveCredential()
  return credentialMetadataFromStored(stored, account, legacy)
}

function persistCredentialEnvelope(
  envelope: ClaudeCodeCredentialEnvelope,
  options: {
    accountId?: string
    displayName?: string
    email?: string | null
    setAsActive?: boolean
    connectedAt?: Date | null
  } = {},
): string {
  const db = getDatabase()
  const encrypted = encryptClaudeCodeCredential(envelope)
  const now = new Date()
  const accountId = options.accountId ?? createId()
  const displayName =
    options.displayName ||
    (envelope.source === "legacy_db"
      ? "Claude Code Legacy Token"
      : "Local Claude Code")

  const existing = db
    .select()
    .from(anthropicAccounts)
    .where(eq(anthropicAccounts.id, accountId))
    .get()

  db.insert(anthropicAccounts)
    .values({
      id: accountId,
      email: options.email ?? existing?.email ?? null,
      displayName,
      oauthToken: encrypted,
      connectedAt: options.connectedAt ?? existing?.connectedAt ?? now,
      lastUsedAt: now,
      desktopUserId: existing?.desktopUserId ?? null,
    })
    .onConflictDoUpdate({
      target: anthropicAccounts.id,
      set: {
        email: options.email ?? existing?.email ?? null,
        displayName,
        oauthToken: encrypted,
        lastUsedAt: now,
        desktopUserId: existing?.desktopUserId ?? null,
      },
    })
    .run()

  if (options.setAsActive !== false) {
    db.insert(anthropicSettings)
      .values({
        id: "singleton",
        activeAccountId: accountId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: anthropicSettings.id,
        set: {
          activeAccountId: accountId,
          updatedAt: now,
        },
      })
      .run()

    db.delete(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .run()

    db.insert(claudeCodeCredentials)
      .values({
        id: "default",
        oauthToken: encrypted,
        connectedAt: options.connectedAt ?? now,
        userId: null,
      })
      .run()
  }

  return accountId
}

export function storeClaudeCodeOAuthToken(
  accessToken: string,
  options: {
    source?: ClaudeCodeCredentialEnvelope["source"]
    setAsActive?: boolean
    displayName?: string
  } = {},
): string {
  const envelope = createClaudeCodeCredentialEnvelope(
    { accessToken },
    options.source ?? "hosted_oauth",
  )

  return persistCredentialEnvelope(envelope, {
    setAsActive: options.setAsActive,
    displayName: options.displayName,
  })
}

export function importLocalClaudeCodeCredential(): {
  success: true
  accountId: string
  metadata: ClaudeCodeCredentialMetadata
} {
  const credential = getExistingClaudeCredentials()
  if (!credential?.accessToken) {
    throw new Error("No local Claude Code credentials found. Run Claude Code login first, then import again.")
  }

  const envelope = createClaudeCodeCredentialEnvelope(credential)
  const accountId = persistCredentialEnvelope(envelope, {
    displayName: "Local Claude Code",
    setAsActive: true,
  })

  console.log("[ClaudeCredentials] Imported local Claude Code credential", {
    source: envelope.source,
    hasRefreshToken: Boolean(envelope.refreshToken),
    expiresAt: envelope.expiresAt
      ? new Date(envelope.expiresAt).toISOString()
      : null,
  })

  return {
    success: true,
    accountId,
    metadata: getClaudeCodeCredentialMetadata(),
  }
}

function persistRefreshedActiveCredential(
  envelope: ClaudeCodeCredentialEnvelope,
  account: typeof anthropicAccounts.$inferSelect | null,
  legacy: typeof claudeCodeCredentials.$inferSelect | null,
): void {
  const db = getDatabase()
  const encrypted = encryptClaudeCodeCredential(envelope)
  const now = new Date()

  if (account) {
    db.update(anthropicAccounts)
      .set({
        oauthToken: encrypted,
        lastUsedAt: now,
      })
      .where(eq(anthropicAccounts.id, account.id))
      .run()
  }

  if (legacy || account) {
    db.delete(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .run()

    db.insert(claudeCodeCredentials)
      .values({
        id: "default",
        oauthToken: encrypted,
        connectedAt: legacy?.connectedAt ?? account?.connectedAt ?? now,
        userId: legacy?.userId ?? null,
      })
      .run()
  }
}

export async function getValidClaudeCodeCredential(): Promise<{
  accessToken: string | null
  metadata: ClaudeCodeCredentialMetadata
}> {
  const { stored, account, legacy } = parseActiveCredential()
  if (!stored?.envelope.accessToken) {
    return {
      accessToken: null,
      metadata: credentialMetadataFromStored(stored, account, legacy),
    }
  }

  const { envelope } = stored
  if (!isTokenExpired(envelope.expiresAt)) {
    return {
      accessToken: envelope.accessToken,
      metadata: credentialMetadataFromStored(stored, account, legacy),
    }
  }

  if (!envelope.refreshToken) {
    throw new Error(
      "Claude Code credentials are expired and cannot be refreshed. Re-import local Claude Code credentials.",
    )
  }

  console.log("[ClaudeCredentials] Refreshing Claude Code credential", {
    source: envelope.source,
    expiresAt: envelope.expiresAt
      ? new Date(envelope.expiresAt).toISOString()
      : null,
  })

  const refreshed = await refreshClaudeToken(envelope.refreshToken)
  const refreshedEnvelope = createClaudeCodeCredentialEnvelope(
    {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? envelope.refreshToken,
      expiresAt: refreshed.expiresAt,
      scopes: envelope.scopes,
    },
    envelope.source,
    envelope,
  )

  persistRefreshedActiveCredential(refreshedEnvelope, account, legacy)

  return {
    accessToken: refreshedEnvelope.accessToken,
    metadata: credentialMetadataFromStored(
      { envelope: refreshedEnvelope, storageFormat: "envelope" },
      account,
      legacy,
    ),
  }
}

export function hasAnyClaudeCodeAccount(): boolean {
  const db = getDatabase()
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(anthropicAccounts)
    .get()

  if ((countResult?.count ?? 0) > 0) return true

  const legacyCred = db
    .select()
    .from(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, "default"))
    .get()

  return Boolean(legacyCred?.oauthToken)
}
