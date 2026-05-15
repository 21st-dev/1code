import { eq } from "drizzle-orm"
import { shell } from "electron"
import { z } from "zod"
import { getClaudeShellEnvironment } from "../../claude"
import { getExistingClaudeCredentials } from "../../claude-token"
import {
  getClaudeCodeCredentialMetadata,
  importLocalClaudeCodeCredential,
  storeClaudeCodeOAuthToken,
} from "../../claude-credentials"
import { getApiUrl } from "../../config"
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
  getDatabase,
} from "../../db"
import { assertOfficialCloudAllowed } from "../../local-only"
import { publicProcedure, router } from "../index"

/**
 * Get desktop auth token for server API calls
 */
async function getDesktopToken(): Promise<string | null> {
  const { getAuthManager } = await import("../../../index")
  const authManager = getAuthManager()
  return authManager.getValidToken()
}

/**
 * Store OAuth token - now uses multi-account system
 * If setAsActive is true, also sets this account as active
 */
function storeOAuthToken(oauthToken: string, setAsActive = true): string {
  return storeClaudeCodeOAuthToken(oauthToken, {
    source: "hosted_oauth",
    setAsActive,
    displayName: "Claude Code",
  })
}

/**
 * Claude Code OAuth router for desktop
 * Uses server only for sandbox creation, stores token locally
 */
export const claudeCodeRouter = router({
  /**
   * Check if user has existing CLI config (API key or proxy)
   * If true, user can skip OAuth onboarding
   * Based on PR #29 by @sa4hnd
   */
  hasExistingCliConfig: publicProcedure.query(() => {
    const shellEnv = getClaudeShellEnvironment()
    const hasConfig = !!(shellEnv.ANTHROPIC_API_KEY || shellEnv.ANTHROPIC_AUTH_TOKEN || shellEnv.ANTHROPIC_BASE_URL)
    return {
      hasConfig,
      hasApiKey: !!(shellEnv.ANTHROPIC_API_KEY || shellEnv.ANTHROPIC_AUTH_TOKEN),
      baseUrl: shellEnv.ANTHROPIC_BASE_URL || null,
    }
  }),

  /**
   * Check if user has Claude Code connected (local check)
   * Now uses multi-account system - checks for active account
   */
  getIntegration: publicProcedure.query(() => {
    return getClaudeCodeCredentialMetadata()
  }),

  /**
   * Start OAuth flow - calls server to create sandbox
   */
  startAuth: publicProcedure.mutation(async () => {
    const apiUrl = getApiUrl()
    assertOfficialCloudAllowed("Claude Code hosted auth", apiUrl)

    const token = await getDesktopToken()
    if (!token) {
      throw new Error("Not authenticated with hosted upstream service")
    }

    // Server creates sandbox (has CodeSandbox SDK)
    const response = await fetch(`${apiUrl}/api/auth/claude-code/start`, {
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
        const statusUrl = `${input.sandboxUrl}/api/auth/${input.sessionId}/status`
        assertOfficialCloudAllowed("Claude Code sandbox status", statusUrl)

        const response = await fetch(statusUrl)

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
        return {
          state: "error" as const,
          oauthUrl: null,
          error: error instanceof Error ? error.message : "Connection failed",
        }
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
      const codeUrl = `${input.sandboxUrl}/api/auth/${input.sessionId}/code`
      assertOfficialCloudAllowed("Claude Code sandbox code submission", codeUrl)

      const codeRes = await fetch(codeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input.code }),
      })

      if (!codeRes.ok) {
        throw new Error(`Code submission failed: ${codeRes.statusText}`)
      }

      // Poll for OAuth token (max 10 seconds)
      let oauthToken: string | null = null

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000))

        const statusUrl = `${input.sandboxUrl}/api/auth/${input.sessionId}/status`
        assertOfficialCloudAllowed("Claude Code sandbox token polling", statusUrl)

        const statusRes = await fetch(statusUrl)

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

      storeClaudeCodeOAuthToken(oauthToken, {
        source: "manual",
        displayName: "Claude Code Manual Token",
      })

      console.log("[ClaudeCode] Token imported locally")
      return { success: true }
    }),

  /**
   * Check for existing Claude token in system credentials
   */
  getSystemToken: publicProcedure.query(() => {
    const credential = getExistingClaudeCredentials()
    return {
      hasCredentials: Boolean(credential?.accessToken),
      hasRefreshToken: Boolean(credential?.refreshToken),
      source: credential?.source ?? null,
      expiresAt: credential?.expiresAt
        ? new Date(credential.expiresAt).toISOString()
        : null,
    }
  }),

  /**
   * Import Claude token from system credentials
   */
  importSystemToken: publicProcedure.mutation(() => {
    return importLocalClaudeCodeCredential()
  }),

  /**
   * Get decrypted OAuth token (local)
   * Now uses multi-account system - gets token from active account
   */
  getToken: publicProcedure.query(() => {
    return {
      token: null,
      error: "Raw Claude Code tokens are not exposed to the renderer",
      metadata: getClaudeCodeCredentialMetadata(),
    }
  }),

  /**
   * Disconnect - delete active account from multi-account system
   */
  disconnect: publicProcedure.mutation(() => {
    const db = getDatabase()

    // Get active account
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get()

    if (settings?.activeAccountId) {
      // Remove active account
      db.delete(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .run()

      // Try to set another account as active
      const firstRemaining = db.select().from(anthropicAccounts).limit(1).get()

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

    // Also clear legacy table
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
      assertOfficialCloudAllowed("Claude Code OAuth URL", url)
      await shell.openExternal(url)
      return { success: true }
    }),
})
