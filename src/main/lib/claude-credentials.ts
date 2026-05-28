import { eq, sql } from "drizzle-orm"
import {
  getExistingClaudeCredentials,
  isTokenExpired,
  refreshClaudeToken,
  type ClaudeOAuthCredential,
} from "./claude-token"
import {
  createClaudeCodeCredentialEnvelope,
  parseClaudeCodeCredentialPayload,
  type ClaudeCodeCredentialEnvelope,
  type ClaudeCodeCredentialStorageFormat,
  type StoredClaudeCodeCredential,
} from "../../shared/claude-code-credential-envelope"
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
  getDatabase,
} from "./db"
import { createId } from "./db/utils"
import {
  decryptStringFromStorage,
  encryptStringForStorage,
  isSecureStorageAvailable,
} from "./secure-storage"

export { createClaudeCodeCredentialEnvelope, parseClaudeCodeCredentialPayload }
export type { ClaudeCodeCredentialEnvelope, ClaudeCodeCredentialStorageFormat }

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

type ActiveCredentialRow = {
  account: typeof anthropicAccounts.$inferSelect | null
  legacy: typeof claudeCodeCredentials.$inferSelect | null
}

const LOCAL_CLAUDE_CODE_DISPLAY_NAME = "Local Claude Code"

function isLocalClaudeCodeSource(
  source: ClaudeCodeCredentialEnvelope["source"],
): boolean {
  return (
    source === "macos_keychain" ||
    source === "windows_credentials_file" ||
    source === "linux_secret_service" ||
    source === "linux_pass" ||
    source === "credentials_file" ||
    source === "manual"
  )
}

function encryptSecret(value: string): string {
  return encryptStringForStorage(value)
}

function decryptSecret(encrypted: string): string | null {
  return decryptStringFromStorage(encrypted)
}

function toIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

export function decryptClaudeCodeCredential(
  encrypted: string,
): StoredClaudeCodeCredential | null {
  const decrypted = decryptSecret(encrypted)
  if (!decrypted) return null
  return parseClaudeCodeCredentialPayload(decrypted)
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
    encryptionAvailable: Boolean(stored) && isSecureStorageAvailable(),
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
  const displayName =
    options.displayName ||
    (envelope.source === "legacy_db"
      ? "Claude Code Legacy Token"
      : LOCAL_CLAUDE_CODE_DISPLAY_NAME)

  const reusableAccount = !options.accountId
    ? db
      .select()
      .from(anthropicAccounts)
      .all()
      .find((account) => {
        if (options.email && account.email?.toLowerCase() === options.email.toLowerCase()) {
          return true
        }
        return (
          displayName === LOCAL_CLAUDE_CODE_DISPLAY_NAME &&
          account.displayName === LOCAL_CLAUDE_CODE_DISPLAY_NAME &&
          !account.email &&
          isLocalClaudeCodeSource(envelope.source)
        )
      }) ?? null
    : null

  const accountId = options.accountId ?? reusableAccount?.id ?? createId()

  const existing = reusableAccount ?? db
    .select()
    .from(anthropicAccounts)
    .where(eq(anthropicAccounts.id, accountId))
    .get()
  const effectiveDisplayName = existing?.displayName ?? displayName

  db.insert(anthropicAccounts)
    .values({
      id: accountId,
      email: options.email ?? existing?.email ?? null,
      displayName: effectiveDisplayName,
      oauthToken: encrypted,
      connectedAt: options.connectedAt ?? existing?.connectedAt ?? now,
      lastUsedAt: now,
      desktopUserId: existing?.desktopUserId ?? null,
    })
    .onConflictDoUpdate({
      target: anthropicAccounts.id,
      set: {
        email: options.email ?? existing?.email ?? null,
        displayName: effectiveDisplayName,
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

export function storeClaudeCodeOAuthCredential(
  credential: ClaudeOAuthCredential,
  options: {
    source?: ClaudeCodeCredentialEnvelope["source"]
    setAsActive?: boolean
    displayName?: string
  } = {},
): {
  success: true
  accountId: string
  metadata: ClaudeCodeCredentialMetadata
} {
  const envelope = createClaudeCodeCredentialEnvelope(
    credential,
    options.source ?? credential.source ?? "manual",
  )
  const accountId = persistCredentialEnvelope(envelope, {
    setAsActive: options.setAsActive,
    displayName: options.displayName ?? LOCAL_CLAUDE_CODE_DISPLAY_NAME,
  })

  return {
    success: true,
    accountId,
    metadata: getClaudeCodeCredentialMetadata(),
  }
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
    displayName: LOCAL_CLAUDE_CODE_DISPLAY_NAME,
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
