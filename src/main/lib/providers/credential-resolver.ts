// #NP - Credential resolver for multi-credential providers
import { safeStorage } from "electron"
import { eq, and, asc } from "drizzle-orm"
import { getDatabase, providerCredentials, aiProviders } from "../db"
import type { ProviderCredential, AiProvider } from "../db/schema"

// ============ TYPES ============

export interface ResolvedCredential {
  credential: ProviderCredential
  provider: AiProvider
  decryptedApiKey?: string
  decryptedOAuthToken?: string
}

export interface CredentialContext {
  agentType?: string
  chatId?: string
  subChatId?: string
}

// ============ ENCRYPTION HELPERS ============

export function decryptString(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

export function encryptString(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[CredentialResolver] Encryption not available, storing as base64")
    return Buffer.from(value).toString("base64")
  }
  return safeStorage.encryptString(value).toString("base64")
}

// ============ CREDENTIAL RESOLUTION ============

/**
 * Resolve the best available credential for a provider
 * Considers: priority, active status, usage limits, error state
 */
export async function resolveCredential(
  providerId: string,
  context?: CredentialContext
): Promise<ResolvedCredential | null> {
  const db = getDatabase()

  // Get provider details
  const provider = db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.id, providerId))
    .get()

  if (!provider) {
    console.log(`[CredentialResolver] Provider not found: ${providerId}`)
    return null
  }

  // Get all active credentials for provider, ordered by priority
  const credentials = db
    .select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.providerId, providerId),
        eq(providerCredentials.isActive, 1)
      )
    )
    .orderBy(asc(providerCredentials.priority))
    .all()

  if (credentials.length === 0) {
    console.log(`[CredentialResolver] No active credentials for provider: ${providerId}`)
    return null
  }

  // Find first credential that passes availability checks
  for (const cred of credentials) {
    if (await checkCredentialAvailable(cred)) {
      return buildResolvedCredential(cred, provider)
    }
  }

  // All credentials failed checks, return first one anyway (with warning)
  console.warn(`[CredentialResolver] All credentials unavailable, using first: ${credentials[0].id}`)
  return buildResolvedCredential(credentials[0], provider)
}

/**
 * Get credential by ID with decryption
 */
export function getCredentialById(credentialId: string): ResolvedCredential | null {
  const db = getDatabase()

  const credential = db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.id, credentialId))
    .get()

  if (!credential) return null

  const provider = db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.id, credential.providerId))
    .get()

  if (!provider) return null

  return buildResolvedCredential(credential, provider)
}

// ============ AVAILABILITY CHECKS ============

// #P - Credential availability checks (critical for failover)
async function checkCredentialAvailable(cred: ProviderCredential): Promise<boolean> {
  // Check OAuth token expiry
  if (cred.authType === "oauth" && cred.oauthExpiresAt) {
    const expiresAt = cred.oauthExpiresAt instanceof Date
      ? cred.oauthExpiresAt.getTime()
      : cred.oauthExpiresAt
    if (Date.now() > expiresAt) {
      console.log(`[CredentialResolver] OAuth token expired for credential: ${cred.id}`)
      // TODO: Implement token refresh
      return false
    }
  }

  // Check usage limits
  if (cred.usageLimitType && cred.usageLimitValue) {
    if (cred.currentUsage >= cred.usageLimitValue) {
      console.log(`[CredentialResolver] Usage limit exceeded for credential: ${cred.id}`)
      return false
    }
  }

  // Check recent errors (circuit breaker - 1 min cooldown)
  if (cred.lastErrorAt) {
    const errorAt = cred.lastErrorAt instanceof Date
      ? cred.lastErrorAt.getTime()
      : cred.lastErrorAt
    if (Date.now() - errorAt < 60000) {
      console.log(`[CredentialResolver] Recent error cooldown for credential: ${cred.id}`)
      return false
    }
  }

  return true
}

// ============ HELPERS ============

function buildResolvedCredential(
  credential: ProviderCredential,
  provider: AiProvider
): ResolvedCredential {
  const result: ResolvedCredential = {
    credential,
    provider,
  }

  // Decrypt API key if present
  if (credential.apiKey) {
    try {
      result.decryptedApiKey = decryptString(credential.apiKey)
    } catch (e) {
      console.error(`[CredentialResolver] Failed to decrypt API key: ${e}`)
    }
  }

  // Decrypt OAuth token if present
  if (credential.oauthToken) {
    try {
      result.decryptedOAuthToken = decryptString(credential.oauthToken)
    } catch (e) {
      console.error(`[CredentialResolver] Failed to decrypt OAuth token: ${e}`)
    }
  }

  return result
}

// ============ CREDENTIAL UPDATES ============

/**
 * Record an error on a credential (for circuit breaker)
 */
export function recordCredentialError(credentialId: string, error: string): void {
  const db = getDatabase()
  db.update(providerCredentials)
    .set({
      lastError: error,
      lastErrorAt: new Date(),
    })
    .where(eq(providerCredentials.id, credentialId))
    .run()
}

/**
 * Update usage counter for a credential
 */
export function updateCredentialUsage(credentialId: string, tokensUsed: number): void {
  const db = getDatabase()
  const cred = db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.id, credentialId))
    .get()

  if (!cred) return

  db.update(providerCredentials)
    .set({
      currentUsage: cred.currentUsage + tokensUsed,
      updatedAt: new Date(),
    })
    .where(eq(providerCredentials.id, credentialId))
    .run()
}

/**
 * Reset usage counter for a credential
 */
export function resetCredentialUsage(credentialId: string): void {
  const db = getDatabase()
  db.update(providerCredentials)
    .set({
      currentUsage: 0,
      usageResetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(providerCredentials.id, credentialId))
    .run()
}
