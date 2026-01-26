// @ts-nocheck
import { eq, sql } from "drizzle-orm"
import { safeStorage } from "electron"
import { z } from "zod"
import { getAuthManager } from "../../../index"
import { anthropicAccounts, anthropicSettings, claudeCodeCredentials, getDatabase } from "../../db"
import { createId } from "../../db/utils"
import { publicProcedure, router } from "../index"

/**
 * Encrypt token using Electron's safeStorage
 */
function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[AnthropicAccounts] Encryption not available, storing as base64")
    return Buffer.from(token).toString("base64")
  }
  return safeStorage.encryptString(token).toString("base64")
}

/**
 * Decrypt token using Electron's safeStorage
 */
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Multi-account Anthropic management router
 */
export const anthropicAccountsRouter = router({
  /**
   * List all stored Anthropic accounts
   */
  list: publicProcedure.query(() => {
    const db = getDatabase()

    try {
      const accounts = db
        .select({
          id: anthropicAccounts.id,
          email: anthropicAccounts.email,
          displayName: anthropicAccounts.displayName,
          connectedAt: anthropicAccounts.connectedAt,
          lastUsedAt: anthropicAccounts.lastUsedAt,
        })
        .from(anthropicAccounts)
        .orderBy(anthropicAccounts.connectedAt)
        .all()

      // If we have accounts in new table, return them
      if (accounts.length > 0) {
        return accounts.map((acc) => ({
          ...acc,
          connectedAt: acc.connectedAt?.toISOString() ?? null,
          lastUsedAt: acc.lastUsedAt?.toISOString() ?? null,
        }))
      }
    } catch {
      // Table doesn't exist yet, fall through to legacy
    }

    // Fallback: check legacy table and return as single account
    try {
      const legacyCred = db
        .select()
        .from(claudeCodeCredentials)
        .where(eq(claudeCodeCredentials.id, "default"))
        .get()

      if (legacyCred?.oauthToken) {
        return [{
          id: "legacy-default",
          email: null,
          displayName: "Anthropic Account",
          connectedAt: legacyCred.connectedAt?.toISOString() ?? null,
          lastUsedAt: null,
        }]
      }
    } catch {
      // Legacy table also doesn't exist
    }

    return []
  }),

  /**
   * Get currently active account info
   */
  getActive: publicProcedure.query(() => {
    const db = getDatabase()

    try {
      const settings = db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get()

      if (settings?.activeAccountId) {
        const account = db
          .select({
            id: anthropicAccounts.id,
            email: anthropicAccounts.email,
            displayName: anthropicAccounts.displayName,
            connectedAt: anthropicAccounts.connectedAt,
          })
          .from(anthropicAccounts)
          .where(eq(anthropicAccounts.id, settings.activeAccountId))
          .get()

        if (account) {
          return {
            ...account,
            connectedAt: account.connectedAt?.toISOString() ?? null,
          }
        }
      }
    } catch {
      // Tables don't exist yet, fall through to legacy
    }

    // Fallback: if legacy credential exists, treat it as active
    try {
      const legacyCred = db
        .select()
        .from(claudeCodeCredentials)
        .where(eq(claudeCodeCredentials.id, "default"))
        .get()

      if (legacyCred?.oauthToken) {
        return {
          id: "legacy-default",
          email: null,
          displayName: "Anthropic Account",
          connectedAt: legacyCred.connectedAt?.toISOString() ?? null,
        }
      }
    } catch {
      // Legacy table also doesn't exist
    }

    return null
  }),

  /**
   * Get decrypted OAuth token for active account
   */
  getActiveToken: publicProcedure.query(() => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get()

    if (!settings?.activeAccountId) {
      return { token: null, error: "No active account" }
    }

    const account = db
      .select()
      .from(anthropicAccounts)
      .where(eq(anthropicAccounts.id, settings.activeAccountId))
      .get()

    if (!account) {
      return { token: null, error: "Active account not found" }
    }

    try {
      const token = decryptToken(account.oauthToken)
      return { token, error: null }
    } catch (error) {
      console.error("[AnthropicAccounts] Decrypt error:", error)
      return { token: null, error: "Failed to decrypt token" }
    }
  }),

  /**
   * Switch to a different account
   */
  setActive: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()

      // Verify account exists
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, input.accountId))
        .get()

      if (!account) {
        throw new Error("Account not found")
      }

      // Update or insert settings
      db.insert(anthropicSettings)
        .values({
          id: "singleton",
          activeAccountId: input.accountId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: anthropicSettings.id,
          set: {
            activeAccountId: input.accountId,
            updatedAt: new Date(),
          },
        })
        .run()

      // Update lastUsedAt on the account
      db.update(anthropicAccounts)
        .set({ lastUsedAt: new Date() })
        .where(eq(anthropicAccounts.id, input.accountId))
        .run()

      console.log(`[AnthropicAccounts] Switched to account: ${input.accountId}`)
      return { success: true }
    }),

  /**
   * Add a new account (called after OAuth flow)
   */
  add: publicProcedure
    .input(
      z.object({
        oauthToken: z.string().min(1),
        email: z.string().optional(),
        displayName: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const authManager = getAuthManager()
      const user = authManager.getUser()

      const encryptedToken = encryptToken(input.oauthToken)
      const newId = createId()

      db.insert(anthropicAccounts)
        .values({
          id: newId,
          email: input.email ?? null,
          displayName: input.displayName || input.email || "Anthropic Account",
          oauthToken: encryptedToken,
          connectedAt: new Date(),
          desktopUserId: user?.id ?? null,
        })
        .run()

      // Count accounts
      const countResult = db
        .select({ count: sql<number>`count(*)` })
        .from(anthropicAccounts)
        .get()

      // Automatically set as active if it's the first account
      if (countResult?.count === 1) {
        db.insert(anthropicSettings)
          .values({
            id: "singleton",
            activeAccountId: newId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: anthropicSettings.id,
            set: {
              activeAccountId: newId,
              updatedAt: new Date(),
            },
          })
          .run()
      }

      console.log(`[AnthropicAccounts] Added new account: ${newId}`)
      return { id: newId, success: true }
    }),

  /**
   * Update account display name
   */
  rename: publicProcedure
    .input(
      z.object({
        accountId: z.string(),
        displayName: z.string().min(1),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      const result = db
        .update(anthropicAccounts)
        .set({ displayName: input.displayName })
        .where(eq(anthropicAccounts.id, input.accountId))
        .run()

      if (result.changes === 0) {
        throw new Error("Account not found")
      }

      console.log(`[AnthropicAccounts] Renamed account ${input.accountId} to "${input.displayName}"`)
      return { success: true }
    }),

  /**
   * Remove an account
   */
  remove: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()

      // Check if this is the active account
      const settings = db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get()

      // Delete the account
      db.delete(anthropicAccounts)
        .where(eq(anthropicAccounts.id, input.accountId))
        .run()

      // If deleted account was active, set another account as active
      if (settings?.activeAccountId === input.accountId) {
        const firstRemaining = db
          .select()
          .from(anthropicAccounts)
          .limit(1)
          .get()

        if (firstRemaining) {
          db.update(anthropicSettings)
            .set({
              activeAccountId: firstRemaining.id,
              updatedAt: new Date(),
            })
            .where(eq(anthropicSettings.id, "singleton"))
            .run()
        } else {
          db.update(anthropicSettings)
            .set({
              activeAccountId: null,
              updatedAt: new Date(),
            })
            .where(eq(anthropicSettings.id, "singleton"))
            .run()
        }
      }

      console.log(`[AnthropicAccounts] Removed account: ${input.accountId}`)
      return { success: true }
    }),

  /**
   * Check if any accounts are connected
   */
  hasAccounts: publicProcedure.query(() => {
    const db = getDatabase()
    const countResult = db
      .select({ count: sql<number>`count(*)` })
      .from(anthropicAccounts)
      .get()

    return { hasAccounts: (countResult?.count ?? 0) > 0 }
  }),

  /**
   * Migrate legacy account from claude_code_credentials to anthropic_accounts
   * Called automatically if legacy account exists but no multi-accounts
   */
  migrateLegacy: publicProcedure.mutation(() => {
    const db = getDatabase()

    // Check if we already have accounts
    const existingAccounts = db
      .select({ count: sql<number>`count(*)` })
      .from(anthropicAccounts)
      .get()

    if ((existingAccounts?.count ?? 0) > 0) {
      return { migrated: false, reason: "accounts_exist" }
    }

    // Check for legacy credential
    const legacyCred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    if (!legacyCred?.oauthToken) {
      return { migrated: false, reason: "no_legacy" }
    }

    const newId = createId()

    // Insert into new table
    db.insert(anthropicAccounts)
      .values({
        id: newId,
        oauthToken: legacyCred.oauthToken,
        displayName: "Anthropic Account",
        connectedAt: legacyCred.connectedAt,
        desktopUserId: legacyCred.userId,
      })
      .run()

    // Set as active
    db.insert(anthropicSettings)
      .values({
        id: "singleton",
        activeAccountId: newId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: anthropicSettings.id,
        set: {
          activeAccountId: newId,
          updatedAt: new Date(),
        },
      })
      .run()

    return { migrated: true, accountId: newId }
  }),
})
