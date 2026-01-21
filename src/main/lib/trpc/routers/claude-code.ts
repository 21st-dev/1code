import { eq } from "drizzle-orm"
import { safeStorage, shell } from "electron"
import { z } from "zod"
import { getAuthManager } from "../../../index"
import { getExistingClaudeToken } from "../../claude-token"
import { getApiUrl } from "../../config"
import { claudeCodeCredentials, getDatabase } from "../../db"
import { publicProcedure, router } from "../index"

/**
 * Get desktop auth token for server API calls
 */
async function getDesktopToken(): Promise<string | null> {
  const authManager = getAuthManager()
  return authManager.getValidToken()
}

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
  const authManager = getAuthManager()
  const user = authManager.getUser()

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
      userId: user?.id ?? null,
    })
    .run()
}

/**
 * Claude Code OAuth router for desktop
 * Uses server only for sandbox creation, stores token locally
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
   * Start OAuth flow - calls server to create sandbox
   */
  startAuth: publicProcedure.mutation(async () => {
    const token = await getDesktopToken()
    if (!token) {
      throw new Error("Not authenticated with 21st.dev")
    }

    // Server creates sandbox (has CodeSandbox SDK)
    const response = await fetch(`${getApiUrl()}/api/auth/claude-code/start`, {
      method: "POST",
      headers: { "x-desktop-token": token },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(error.error || `Start auth failed: ${response.status}`)
    }

    return (await response.json()) as {
      sandboxId: string
      sandboxUrl: string
      sessionId: string
    }
  }),

  /**
   * Poll for OAuth URL - calls sandbox directly
   */
  pollStatus: publicProcedure
    .input(
      z.object({
        sandboxUrl: z.string(),
        sessionId: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const response = await fetch(
          `${input.sandboxUrl}/api/auth/${input.sessionId}/status`
        )

        if (!response.ok) {
          return { state: "error" as const, oauthUrl: null, error: "Failed to poll status" }
        }

        const data = await response.json()
        return {
          state: data.state as string,
          oauthUrl: data.oauthUrl ?? null,
          error: data.error ?? null,
        }
      } catch (error) {
        console.error("[ClaudeCode] Poll status error:", error)
        return { state: "error" as const, oauthUrl: null, error: "Connection failed" }
      }
    }),

  /**
   * Submit OAuth code - calls sandbox directly, stores token locally
   */
  submitCode: publicProcedure
    .input(
      z.object({
        sandboxUrl: z.string(),
        sessionId: z.string(),
        code: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      // Submit code to sandbox
      const codeRes = await fetch(
        `${input.sandboxUrl}/api/auth/${input.sessionId}/code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: input.code }),
        }
      )

      if (!codeRes.ok) {
        throw new Error(`Code submission failed: ${codeRes.statusText}`)
      }

      // Poll for OAuth token (max 10 seconds)
      let oauthToken: string | null = null

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000))

        const statusRes = await fetch(
          `${input.sandboxUrl}/api/auth/${input.sessionId}/status`
        )

        if (!statusRes.ok) continue

        const status = await statusRes.json()

        if (status.state === "success" && status.oauthToken) {
          oauthToken = status.oauthToken
          break
        }

        if (status.state === "error") {
          throw new Error(status.error || "Authentication failed")
        }
      }

      if (!oauthToken) {
        throw new Error("Timeout waiting for OAuth token")
      }

      storeOAuthToken(oauthToken)

      console.log("[ClaudeCode] Token stored locally")
      return { success: true }
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

  /**
   * Open OAuth URL in browser
   */
  openOAuthUrl: publicProcedure
    .input(z.string())
    .mutation(async ({ input: url }) => {
      await shell.openExternal(url)
      return { success: true }
    }),
})
