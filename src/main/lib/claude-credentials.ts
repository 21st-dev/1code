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

type ClaudeCredentialDatabase = ReturnType<typeof getDatabase>
type ClaudeCredentialTransaction = Parameters<
  Parameters<ClaudeCredentialDatabase["transaction"]>[0]
>[0]
type RefreshClaudeTokenFn = typeof refreshClaudeToken

const LOCAL_CLAUDE_CODE_DISPLAY_NAME = "Local Claude Code"
const LEGACY_CLAUDE_CODE_ACCOUNT_ID = "legacy-default"
const LEGACY_CLAUDE_CODE_CREDENTIAL_ID = "default"
const ANTHROPIC_SETTINGS_ID = "singleton"
export const CLAUDE_CODE_LOCAL_CREDENTIAL_INVALID_MESSAGE =
  "Local Claude Code credentials are expired or revoked. Sign in with Claude Code again instead of importing local credentials."

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

function getSettings(db: ClaudeCredentialDatabase) {
  return db
    .select()
    .from(anthropicSettings)
    .where(eq(anthropicSettings.id, ANTHROPIC_SETTINGS_ID))
    .get() ?? null
}

function getAccountById(db: ClaudeCredentialDatabase, accountId: string) {
  return db
    .select()
    .from(anthropicAccounts)
    .where(eq(anthropicAccounts.id, accountId))
    .get() ?? null
}

function getFirstAnthropicAccount(db: ClaudeCredentialDatabase) {
  return db
    .select()
    .from(anthropicAccounts)
    .orderBy(anthropicAccounts.connectedAt)
    .limit(1)
    .get() ?? null
}

function getLegacyClaudeCodeCredential(db: ClaudeCredentialDatabase) {
  return db
    .select()
    .from(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, LEGACY_CLAUDE_CODE_CREDENTIAL_ID))
    .get() ?? null
}

function clearLegacyClaudeCodeCredential(db: ClaudeCredentialDatabase): boolean {
  const result = db.delete(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, LEGACY_CLAUDE_CODE_CREDENTIAL_ID))
    .run()
  return result.changes > 0
}

function setActiveClaudeCodeAccountSetting(
  db: ClaudeCredentialDatabase,
  activeAccountId: string | null,
): void {
  const now = new Date()

  db.insert(anthropicSettings)
    .values({
      id: ANTHROPIC_SETTINGS_ID,
      activeAccountId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: anthropicSettings.id,
      set: {
        activeAccountId,
        updatedAt: now,
      },
    })
    .run()
}

function normalizeActiveClaudeCodeAccount(
  db: ClaudeCredentialDatabase,
): string | null {
  const settings = getSettings(db)
  const configuredActiveAccount = settings?.activeAccountId
    ? getAccountById(db, settings.activeAccountId)
    : null
  const activeAccount = configuredActiveAccount ?? getFirstAnthropicAccount(db)

  setActiveClaudeCodeAccountSetting(db, activeAccount?.id ?? null)

  return activeAccount?.id ?? null
}

export function ensureLegacyClaudeCodeCredentialMigrated(
  db: ClaudeCredentialDatabase = getDatabase(),
): {
  migrated: boolean
  activeAccountId: string | null
  reason:
  | "canonical_accounts_exist"
  | "legacy_migrated"
  | "no_legacy"
  | "migration_failed"
} {
  const accountCount = db
    .select({ count: sql<number>`count(*)` })
    .from(anthropicAccounts)
    .get()?.count ?? 0

  if (accountCount > 0) {
    const activeAccountId = normalizeActiveClaudeCodeAccount(db)
    clearLegacyClaudeCodeCredential(db)
    return {
      migrated: false,
      activeAccountId,
      reason: "canonical_accounts_exist",
    }
  }

  const legacy = getLegacyClaudeCodeCredential(db)
  if (!legacy?.oauthToken) {
    setActiveClaudeCodeAccountSetting(db, null)
    return { migrated: false, activeAccountId: null, reason: "no_legacy" }
  }

  const accountId = createId()
  const now = new Date()

  try {
    db.transaction((tx: ClaudeCredentialTransaction) => {
      tx.insert(anthropicAccounts)
        .values({
          id: accountId,
          email: null,
          displayName: "Claude Code Legacy Token",
          oauthToken: legacy.oauthToken,
          connectedAt: legacy.connectedAt ?? now,
          lastUsedAt: now,
          desktopUserId: legacy.userId ?? null,
        })
        .run()

      tx.insert(anthropicSettings)
        .values({
          id: ANTHROPIC_SETTINGS_ID,
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

      tx.delete(claudeCodeCredentials)
        .where(eq(claudeCodeCredentials.id, LEGACY_CLAUDE_CODE_CREDENTIAL_ID))
        .run()
    })
  } catch (error) {
    console.warn("[ClaudeCredentials] Failed to migrate legacy credential", {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      migrated: false,
      activeAccountId: null,
      reason: "migration_failed",
    }
  }

  return { migrated: true, activeAccountId: accountId, reason: "legacy_migrated" }
}

function getActiveCredentialRow(
  db: ClaudeCredentialDatabase = getDatabase(),
): ActiveCredentialRow {
  const migration = ensureLegacyClaudeCodeCredentialMigrated(db)
  if (migration.reason === "migration_failed") {
    return { account: null, legacy: null }
  }

  const account = migration.activeAccountId
    ? getAccountById(db, migration.activeAccountId)
    : null

  return { account, legacy: null }
}

function parseActiveCredential(
  db: ClaudeCredentialDatabase = getDatabase(),
): {
  stored: StoredClaudeCodeCredential | null
  account: typeof anthropicAccounts.$inferSelect | null
  legacy: typeof claudeCodeCredentials.$inferSelect | null
} {
  const { account, legacy } = getActiveCredentialRow(db)

  if (account?.oauthToken) {
    return {
      stored: decryptClaudeCodeCredential(account.oauthToken),
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

export function getClaudeCodeCredentialMetadata(
  db: ClaudeCredentialDatabase = getDatabase(),
): ClaudeCodeCredentialMetadata {
  const { stored, account, legacy } = parseActiveCredential(db)
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
  db: ClaudeCredentialDatabase = getDatabase(),
): string {
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
        id: ANTHROPIC_SETTINGS_ID,
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

    clearLegacyClaudeCodeCredential(db)
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isInvalidGrantError(error: unknown): boolean {
  return /invalid_grant/i.test(errorMessage(error))
}

async function refreshImportedCredentialEnvelope(
  envelope: ClaudeCodeCredentialEnvelope,
  refreshClaudeTokenFn: RefreshClaudeTokenFn,
): Promise<ClaudeCodeCredentialEnvelope> {
  if (!envelope.refreshToken) {
    if (isTokenExpired(envelope.expiresAt)) {
      throw new Error(CLAUDE_CODE_LOCAL_CREDENTIAL_INVALID_MESSAGE)
    }

    return envelope
  }

  try {
    const refreshed = await refreshClaudeTokenFn(envelope.refreshToken)
    return createClaudeCodeCredentialEnvelope(
      {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? envelope.refreshToken,
        expiresAt: refreshed.expiresAt,
        scopes: envelope.scopes,
      },
      envelope.source,
      envelope,
    )
  } catch (error) {
    if (isInvalidGrantError(error)) {
      throw new Error(CLAUDE_CODE_LOCAL_CREDENTIAL_INVALID_MESSAGE)
    }

    throw error
  }
}

export async function importLocalClaudeCodeCredential(options: {
  credential?: ClaudeOAuthCredential | null
  db?: ClaudeCredentialDatabase
  refreshClaudeTokenFn?: RefreshClaudeTokenFn
  validateRefreshToken?: boolean
} = {}): Promise<{
  success: true
  accountId: string
  metadata: ClaudeCodeCredentialMetadata
}> {
  const db = options.db ?? getDatabase()
  const credential =
    "credential" in options ? options.credential : getExistingClaudeCredentials()
  if (!credential?.accessToken) {
    throw new Error("No local Claude Code credentials found. Run Claude Code login first, then import again.")
  }

  const importedEnvelope = createClaudeCodeCredentialEnvelope(credential)
  const envelope = options.validateRefreshToken === false
    ? importedEnvelope
    : await refreshImportedCredentialEnvelope(
      importedEnvelope,
      options.refreshClaudeTokenFn ?? refreshClaudeToken,
    )
  const accountId = persistCredentialEnvelope(envelope, {
    displayName: LOCAL_CLAUDE_CODE_DISPLAY_NAME,
    setAsActive: true,
  }, db)

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
    metadata: getClaudeCodeCredentialMetadata(db),
  }
}

function persistRefreshedActiveCredential(
  envelope: ClaudeCodeCredentialEnvelope,
  account: typeof anthropicAccounts.$inferSelect | null,
  db: ClaudeCredentialDatabase = getDatabase(),
): void {
  const encrypted = encryptClaudeCodeCredential(envelope)
  const now = new Date()

  if (!account) return

  db.update(anthropicAccounts)
    .set({
      oauthToken: encrypted,
      lastUsedAt: now,
    })
    .where(eq(anthropicAccounts.id, account.id))
    .run()

  clearLegacyClaudeCodeCredential(db)
}

export async function getValidClaudeCodeCredential(options: {
  db?: ClaudeCredentialDatabase
  refreshClaudeTokenFn?: RefreshClaudeTokenFn
} = {}): Promise<{
  accessToken: string | null
  metadata: ClaudeCodeCredentialMetadata
}> {
  const db = options.db ?? getDatabase()
  const { stored, account, legacy } = parseActiveCredential(db)
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

  let refreshed: Awaited<ReturnType<RefreshClaudeTokenFn>>
  try {
    refreshed = await (options.refreshClaudeTokenFn ?? refreshClaudeToken)(
      envelope.refreshToken,
    )
  } catch (error) {
    if (isInvalidGrantError(error)) {
      if (account?.id) {
        removeClaudeCodeAccount(account.id, db)
      }
      throw new Error(CLAUDE_CODE_LOCAL_CREDENTIAL_INVALID_MESSAGE)
    }

    throw error
  }
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

  persistRefreshedActiveCredential(refreshedEnvelope, account, db)

  return {
    accessToken: refreshedEnvelope.accessToken,
    metadata: credentialMetadataFromStored(
      { envelope: refreshedEnvelope, storageFormat: "envelope" },
      account,
      legacy,
    ),
  }
}

export function reconcileClaudeCodeCredentialStorage(
  db: ClaudeCredentialDatabase = getDatabase(),
): { activeAccountId: string | null } {
  const migration = ensureLegacyClaudeCodeCredentialMigrated(db)
  return { activeAccountId: migration.activeAccountId }
}

export function removeClaudeCodeAccount(
  accountId: string,
  db: ClaudeCredentialDatabase = getDatabase(),
): { success: true; activeAccountId: string | null; removed: boolean } {
  let removed = false

  if (accountId !== LEGACY_CLAUDE_CODE_ACCOUNT_ID) {
    const result = db.delete(anthropicAccounts)
      .where(eq(anthropicAccounts.id, accountId))
      .run()
    removed = result.changes > 0
    clearLegacyClaudeCodeCredential(db)
  }

  if (accountId === LEGACY_CLAUDE_CODE_ACCOUNT_ID) {
    removed = clearLegacyClaudeCodeCredential(db) || removed
  }

  const { activeAccountId } = reconcileClaudeCodeCredentialStorage(db)
  return { success: true, activeAccountId, removed }
}

export function disconnectActiveClaudeCodeAccount(
  db: ClaudeCredentialDatabase = getDatabase(),
): { success: true; activeAccountId: string | null; removedAccountId: string | null } {
  ensureLegacyClaudeCodeCredentialMigrated(db)
  const settings = getSettings(db)

  const removedAccountId = settings?.activeAccountId ?? null

  if (removedAccountId) {
    db.delete(anthropicAccounts)
      .where(eq(anthropicAccounts.id, removedAccountId))
      .run()
    clearLegacyClaudeCodeCredential(db)
  } else {
    clearLegacyClaudeCodeCredential(db)
  }

  const { activeAccountId } = reconcileClaudeCodeCredentialStorage(db)
  return { success: true, activeAccountId, removedAccountId }
}

export function hasAnyClaudeCodeAccount(): boolean {
  const db = getDatabase()
  ensureLegacyClaudeCodeCredentialMigrated(db)
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(anthropicAccounts)
    .get()

  return (countResult?.count ?? 0) > 0
}
