import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { z } from "zod"
import { getExistingClaudeToken, runClaudeSetupToken, isClaudeCliInstalled } from "../../claude-token"
import { claudeCodeCredentials, getDatabase } from "../../db"
import { startOAuthFlow, cancelOAuthFlow, isOAuthFlowInProgress } from "../../oauth-server"
import { publicProcedure, router } from "../index"

/**
 * Encrypt token using Electron's safeStorage
 */
function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[ClaudeCode] Encryption not available, storing as base64")
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

function storeOAuthToken(oauthToken: string) {
  const encryptedToken = encryptToken(oauthToken)
  const db = getDatabase()

  db.delete(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, "default"))
    .run()

  db.insert(claudeCodeCredentials)
    .values({
      id: "default",
      oauthToken: encryptedToken,
      connectedAt: new Date(),
      userId: null,
    })
    .run()
}

/**
 * Claude Code OAuth router for desktop
 * Uses local OAuth server for authentication - no external dependencies
 */
export const claudeCodeRouter = router({
  /**
   * Check if user has Claude Code connected (local check)
   */
  getIntegration: publicProcedure.query(() => {
    const db = getDatabase()
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    return {
      isConnected: !!cred?.oauthToken,
      connectedAt: cred?.connectedAt?.toISOString() ?? null,
    }
  }),

  /**
   * Start local OAuth flow - opens browser directly to Anthropic
   * This replaces the old startAuth/pollStatus/submitCode flow
   */
  startLocalAuth: publicProcedure.mutation(async () => {
    // Check if flow is already in progress
    if (isOAuthFlowInProgress()) {
      throw new Error("OAuth flow already in progress")
    }

    try {
      const result = await startOAuthFlow()

      // Store the token
      storeOAuthToken(result.accessToken)

      console.log("[ClaudeCode] Token stored via local OAuth")

      return {
        success: true,
        expiresAt: result.expiresAt,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth flow failed"
      console.error("[ClaudeCode] Local auth error:", message)
      throw new Error(message)
    }
  }),

  /**
   * Cancel in-progress OAuth flow
   */
  cancelLocalAuth: publicProcedure.mutation(() => {
    cancelOAuthFlow()
    return { success: true }
  }),

  /**
   * Check if OAuth flow is in progress
   */
  isAuthInProgress: publicProcedure.query(() => {
    return { inProgress: isOAuthFlowInProgress() }
  }),

  /**
   * Import an existing OAuth token from the local machine
   */
  importToken: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const oauthToken = input.token.trim()

      storeOAuthToken(oauthToken)

      console.log("[ClaudeCode] Token imported locally")
      return { success: true }
    }),

  /**
   * Check for existing Claude token in system credentials
   */
  getSystemToken: publicProcedure.query(() => {
    const token = getExistingClaudeToken()?.trim() ?? null
    return { token }
  }),

  /**
   * Import Claude token from system credentials
   */
  importSystemToken: publicProcedure.mutation(() => {
    const token = getExistingClaudeToken()?.trim()
    if (!token) {
      throw new Error("No existing Claude token found")
    }

    storeOAuthToken(token)
    console.log("[ClaudeCode] Token imported from system")
    return { success: true }
  }),

  /**
   * Check if Claude CLI is installed
   */
  isClaudeCliInstalled: publicProcedure.query(() => {
    return { installed: isClaudeCliInstalled() }
  }),

  /**
   * Run Claude CLI setup-token to authenticate
   */
  setupTokenWithCli: publicProcedure.mutation(async () => {
    if (!isClaudeCliInstalled()) {
      throw new Error("Claude CLI is not installed. Please install it from https://claude.ai/code")
    }

    const result = await runClaudeSetupToken((message) => {
      console.log("[ClaudeCode] Setup:", message)
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to setup token with Claude CLI")
    }

    if (result.token) {
      storeOAuthToken(result.token)
      console.log("[ClaudeCode] Token stored from Claude CLI")
    }

    return { success: true }
  }),

  /**
   * Get decrypted OAuth token (local)
   */
  getToken: publicProcedure.query(() => {
    const db = getDatabase()
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    if (!cred?.oauthToken) {
      return { token: null, error: "Not connected" }
    }

    try {
      const token = decryptToken(cred.oauthToken)
      return { token, error: null }
    } catch (error) {
      console.error("[ClaudeCode] Decrypt error:", error)
      return { token: null, error: "Failed to decrypt token" }
    }
  }),

  /**
   * Disconnect - delete local credentials
   */
  disconnect: publicProcedure.mutation(() => {
    const db = getDatabase()
    db.delete(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .run()

    console.log("[ClaudeCode] Disconnected")
    return { success: true }
  }),

  // ============================================================
  // DEPRECATED: Old 21st.dev-based OAuth flow
  // These are kept for backwards compatibility but will throw errors
  // ============================================================

  /**
   * @deprecated Use startLocalAuth instead
   */
  startAuth: publicProcedure.mutation(async () => {
    throw new Error(
      "startAuth is deprecated. Use startLocalAuth instead which handles OAuth directly."
    )
  }),

  /**
   * @deprecated No longer needed with local OAuth
   */
  pollStatus: publicProcedure
    .input(
      z.object({
        sandboxUrl: z.string(),
        sessionId: z.string(),
      })
    )
    .query(async () => {
      throw new Error(
        "pollStatus is deprecated. Use startLocalAuth instead which handles the entire OAuth flow."
      )
    }),

  /**
   * @deprecated No longer needed with local OAuth
   */
  submitCode: publicProcedure
    .input(
      z.object({
        sandboxUrl: z.string(),
        sessionId: z.string(),
        code: z.string().min(1),
      })
    )
    .mutation(async () => {
      throw new Error(
        "submitCode is deprecated. Use startLocalAuth instead which handles the entire OAuth flow."
      )
    }),

  /**
   * @deprecated No longer needed with local OAuth
   */
  openOAuthUrl: publicProcedure
    .input(z.string())
    .mutation(async () => {
      throw new Error(
        "openOAuthUrl is deprecated. Use startLocalAuth instead which opens the browser automatically."
      )
    }),
})
