import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { getAuthManager } from "../../../index"
import {
  createClaudeCodeCredentialEnvelope,
  decryptClaudeCodeCredential,
  ensureLegacyClaudeCodeCredentialMigrated,
  getClaudeCodeCredentialMetadata,
  reconcileClaudeCodeCredentialStorage,
  removeClaudeCodeAccount,
} from "../../claude-credentials"
import { anthropicAccounts, anthropicSettings, getDatabase } from "../../db"
import { createId } from "../../db/utils"
import { encryptStringForStorage } from "../../secure-storage"
import { publicProcedure, router } from "../index"
import { clearClaudeCaches } from "./claude"

const LOCAL_CLAUDE_CODE_DISPLAY_NAME = "Local Claude Code"

/**
 * Encrypt token using Electron's safeStorage
 */
function encryptToken(token: string): string {
  return encryptStringForStorage(
    JSON.stringify(
      createClaudeCodeCredentialEnvelope({ accessToken: token }, "hosted_oauth"),
    ),
  )
}

function accountTimestamp(account: {
  lastUsedAt: Date | null
  connectedAt: Date | null
}): number {
  return account.lastUsedAt?.getTime() ?? account.connectedAt?.getTime() ?? 0
}

function compactDuplicateLocalClaudeCodeAccounts(
  db = getDatabase(),
): void {
  const accounts = db.select().from(anthropicAccounts).all()
  const duplicates = accounts.filter(
    (account) =>
      account.displayName === LOCAL_CLAUDE_CODE_DISPLAY_NAME &&
      !account.email,
  )

  if (duplicates.length <= 1) return

  const settings = db
    .select()
    .from(anthropicSettings)
    .where(eq(anthropicSettings.id, "singleton"))
    .get()

  const activeDuplicate = duplicates.find(
    (account) => account.id === settings?.activeAccountId,
  )
  const keep = activeDuplicate ?? [...duplicates].sort(
    (a, b) => accountTimestamp(b) - accountTimestamp(a),
  )[0]
  if (!keep) return

  const deleteIds = duplicates
    .filter((account) => account.id !== keep.id)
    .map((account) => account.id)

  for (const id of deleteIds) {
    db.delete(anthropicAccounts)
      .where(eq(anthropicAccounts.id, id))
      .run()
  }

  if (settings?.activeAccountId && deleteIds.includes(settings.activeAccountId)) {
    db.update(anthropicSettings)
      .set({
        activeAccountId: keep.id,
        updatedAt: new Date(),
      })
      .where(eq(anthropicSettings.id, "singleton"))
      .run()
  }
}

function toAccountResponse(acc: {
  id: string
  email: string | null
  displayName: string | null
  oauthToken: string
  connectedAt: Date | null
  lastUsedAt?: Date | null
}) {
  const stored = decryptClaudeCodeCredential(acc.oauthToken)

  return {
    id: acc.id,
    email: acc.email,
    displayName: acc.displayName ?? acc.email ?? "Anthropic Account",
    connectedAt: acc.connectedAt?.toISOString() ?? null,
    lastUsedAt: acc.lastUsedAt?.toISOString() ?? null,
    credential: {
      source: stored?.envelope.source ?? null,
      storageFormat: stored?.storageFormat ?? null,
      refreshable: Boolean(stored?.envelope.refreshToken),
      expiresAt: stored?.envelope.expiresAt
        ? new Date(stored.envelope.expiresAt).toISOString()
        : null,
    },
  }
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

    compactDuplicateLocalClaudeCodeAccounts(db)
    reconcileClaudeCodeCredentialStorage(db)

    return db
      .select({
        id: anthropicAccounts.id,
        email: anthropicAccounts.email,
        displayName: anthropicAccounts.displayName,
        oauthToken: anthropicAccounts.oauthToken,
        connectedAt: anthropicAccounts.connectedAt,
        lastUsedAt: anthropicAccounts.lastUsedAt,
      })
      .from(anthropicAccounts)
      .orderBy(anthropicAccounts.connectedAt)
      .all()
      .map(toAccountResponse)
  }),

  /**
   * Get currently active account info
   */
  getActive: publicProcedure.query(() => {
    const db = getDatabase()

    compactDuplicateLocalClaudeCodeAccounts(db)
    const { activeAccountId } = reconcileClaudeCodeCredentialStorage(db)
    if (!activeAccountId) return null

    const account = db
      .select({
        id: anthropicAccounts.id,
        email: anthropicAccounts.email,
        displayName: anthropicAccounts.displayName,
        connectedAt: anthropicAccounts.connectedAt,
        lastUsedAt: anthropicAccounts.lastUsedAt,
        oauthToken: anthropicAccounts.oauthToken,
      })
      .from(anthropicAccounts)
      .where(eq(anthropicAccounts.id, activeAccountId))
      .get()

    return account ? toAccountResponse(account) : null
  }),

  /**
   * Get decrypted OAuth token for active account
   */
  getActiveToken: publicProcedure.query(() => {
    return {
      token: null,
      error: "Raw Claude Code tokens are not exposed to the renderer",
      metadata: getClaudeCodeCredentialMetadata(),
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

      reconcileClaudeCodeCredentialStorage(db)

      // Clear cached SDK state to ensure fresh token is used
      clearClaudeCaches()

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

      reconcileClaudeCodeCredentialStorage(db)
      clearClaudeCaches()

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
      removeClaudeCodeAccount(input.accountId)
      clearClaudeCaches()

      console.log(`[AnthropicAccounts] Removed account: ${input.accountId}`)
      return { success: true }
    }),

  /**
   * Check if any accounts are connected
   */
  hasAccounts: publicProcedure.query(() => {
    const db = getDatabase()
    compactDuplicateLocalClaudeCodeAccounts(db)
    reconcileClaudeCodeCredentialStorage(db)
    const countResult = db
      .select({ count: sql<number>`count(*)` })
      .from(anthropicAccounts)
      .get()

    return { hasAccounts: (countResult?.count ?? 0) > 0 }
  }),

  migrateLegacy: publicProcedure.mutation(() => {
    const result = ensureLegacyClaudeCodeCredentialMigrated()
    return {
      migrated: result.migrated,
      accountId: result.activeAccountId,
      reason: result.reason,
    }
  }),
})
