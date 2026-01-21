// #NP - GitHub tRPC router for account linking
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, appSettings } from "../../db"
import { eq } from "drizzle-orm"
import { shell, BrowserWindow } from "electron"
import { encryptString, decryptString } from "../../providers/credential-resolver"
import { createId } from "../../db/utils"

// ============ TYPES ============

interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  name: string | null
  email: string | null
}

interface GitHubLinkStatus {
  isLinked: boolean
  method: "oauth" | "pat" | null
  username: string | null
  avatarUrl: string | null
  email: string | null
  linkedAt: Date | null
}

// Settings keys
const GITHUB_LINKED_KEY = "github:linked"
const GITHUB_METHOD_KEY = "github:method"
const GITHUB_USERNAME_KEY = "github:username"
const GITHUB_AVATAR_KEY = "github:avatar"
const GITHUB_EMAIL_KEY = "github:email"
const GITHUB_TOKEN_KEY = "github:token"
const GITHUB_LINKED_AT_KEY = "github:linkedAt"

// ============ HELPERS ============

function getSetting(key: string): string | null {
  const db = getDatabase()
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  const db = getDatabase()
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get()

  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(appSettings.key, key))
      .run()
  } else {
    db.insert(settings)
      .values({
        id: createId(),
        key,
        value,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
  }
}

function deleteSetting(key: string): void {
  const db = getDatabase()
  db.delete(settings).where(eq(appSettings.key, key)).run()
}

async function validateGitHubToken(token: string): Promise<GitHubUser | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "1code-desktop",
      },
    })

    if (!response.ok) {
      console.error("[GitHub] Token validation failed:", response.status)
      return null
    }

    return (await response.json()) as GitHubUser
  } catch (error) {
    console.error("[GitHub] Token validation error:", error)
    return null
  }
}

// ============ ROUTER ============

export const githubRouter = router({
  /**
   * Get current GitHub link status
   */
  getStatus: publicProcedure.query((): GitHubLinkStatus => {
    const isLinked = getSetting(GITHUB_LINKED_KEY) === "true"

    if (!isLinked) {
      return {
        isLinked: false,
        method: null,
        username: null,
        avatarUrl: null,
        email: null,
        linkedAt: null,
      }
    }

    const method = getSetting(GITHUB_METHOD_KEY) as "oauth" | "pat" | null
    const linkedAtStr = getSetting(GITHUB_LINKED_AT_KEY)

    return {
      isLinked: true,
      method,
      username: getSetting(GITHUB_USERNAME_KEY),
      avatarUrl: getSetting(GITHUB_AVATAR_KEY),
      email: getSetting(GITHUB_EMAIL_KEY),
      linkedAt: linkedAtStr ? new Date(linkedAtStr) : null,
    }
  }),

  /**
   * Start OAuth flow for GitHub
   * Opens browser to GitHub authorization page
   */
  startOAuth: publicProcedure.mutation(async () => {
    // GitHub OAuth configuration
    // Note: In production, you would use a real OAuth app
    // For now, we'll use a placeholder that opens GitHub's token page
    const clientId = process.env.GITHUB_CLIENT_ID || "your-client-id"
    const redirectUri = "http://localhost:3789/auth/github/callback"
    const scope = "read:user user:email repo"

    // If no client ID is configured, open the PAT creation page instead
    if (clientId === "your-client-id") {
      await shell.openExternal(
        "https://github.com/settings/tokens/new?description=1code-desktop&scopes=repo,read:user,user:email"
      )
      return {
        success: true,
        message: "Opened GitHub token page. Please create a PAT and use 'Link with PAT' option.",
        requiresPat: true,
      }
    }

    const authUrl = new URL("https://github.com/login/oauth/authorize")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("scope", scope)
    authUrl.searchParams.set("state", createId())

    await shell.openExternal(authUrl.toString())

    return {
      success: true,
      message: "Opened GitHub authorization page",
      requiresPat: false,
    }
  }),

  /**
   * Complete OAuth flow with authorization code
   * Called by the callback handler
   */
  completeOAuth: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
      const clientId = process.env.GITHUB_CLIENT_ID
      const clientSecret = process.env.GITHUB_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("GitHub OAuth not configured")
      }

      // Exchange code for access token
      const tokenResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: input.code,
          }),
        }
      )

      if (!tokenResponse.ok) {
        throw new Error("Failed to exchange authorization code")
      }

      const tokenData = await tokenResponse.json()
      const accessToken = tokenData.access_token

      if (!accessToken) {
        throw new Error("No access token received")
      }

      // Validate and get user info
      const user = await validateGitHubToken(accessToken)
      if (!user) {
        throw new Error("Failed to validate GitHub token")
      }

      // Store credentials
      const now = new Date()
      setSetting(GITHUB_LINKED_KEY, "true")
      setSetting(GITHUB_METHOD_KEY, "oauth")
      setSetting(GITHUB_USERNAME_KEY, user.login)
      setSetting(GITHUB_AVATAR_KEY, user.avatar_url)
      setSetting(GITHUB_EMAIL_KEY, user.email || "")
      setSetting(GITHUB_TOKEN_KEY, encryptString(accessToken))
      setSetting(GITHUB_LINKED_AT_KEY, now.toISOString())

      return {
        success: true,
        username: user.login,
      }
    }),

  /**
   * Link with Personal Access Token
   */
  linkWithPAT: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Validate the token
      const user = await validateGitHubToken(input.token)
      if (!user) {
        throw new Error("Invalid Personal Access Token")
      }

      // Store credentials
      const now = new Date()
      setSetting(GITHUB_LINKED_KEY, "true")
      setSetting(GITHUB_METHOD_KEY, "pat")
      setSetting(GITHUB_USERNAME_KEY, user.login)
      setSetting(GITHUB_AVATAR_KEY, user.avatar_url)
      setSetting(GITHUB_EMAIL_KEY, user.email || "")
      setSetting(GITHUB_TOKEN_KEY, encryptString(input.token))
      setSetting(GITHUB_LINKED_AT_KEY, now.toISOString())

      return {
        success: true,
        username: user.login,
      }
    }),

  /**
   * Disconnect GitHub account
   */
  disconnect: publicProcedure.mutation(() => {
    // Remove all GitHub-related settings
    deleteSetting(GITHUB_LINKED_KEY)
    deleteSetting(GITHUB_METHOD_KEY)
    deleteSetting(GITHUB_USERNAME_KEY)
    deleteSetting(GITHUB_AVATAR_KEY)
    deleteSetting(GITHUB_EMAIL_KEY)
    deleteSetting(GITHUB_TOKEN_KEY)
    deleteSetting(GITHUB_LINKED_AT_KEY)

    return { success: true }
  }),

  /**
   * Get the stored access token (for API calls)
   * Returns decrypted token if linked, null otherwise
   */
  getToken: publicProcedure.query(() => {
    const isLinked = getSetting(GITHUB_LINKED_KEY) === "true"
    if (!isLinked) return null

    const encryptedToken = getSetting(GITHUB_TOKEN_KEY)
    if (!encryptedToken) return null

    try {
      return decryptString(encryptedToken)
    } catch {
      return null
    }
  }),

  /**
   * Verify the stored token is still valid
   */
  verifyToken: publicProcedure.query(async () => {
    const isLinked = getSetting(GITHUB_LINKED_KEY) === "true"
    if (!isLinked) {
      return { valid: false, reason: "not_linked" }
    }

    const encryptedToken = getSetting(GITHUB_TOKEN_KEY)
    if (!encryptedToken) {
      return { valid: false, reason: "no_token" }
    }

    try {
      const token = decryptString(encryptedToken)
      const user = await validateGitHubToken(token)

      if (!user) {
        return { valid: false, reason: "invalid_token" }
      }

      // Update user info in case it changed
      setSetting(GITHUB_USERNAME_KEY, user.login)
      setSetting(GITHUB_AVATAR_KEY, user.avatar_url)
      if (user.email) {
        setSetting(GITHUB_EMAIL_KEY, user.email)
      }

      return { valid: true, username: user.login }
    } catch {
      return { valid: false, reason: "decryption_failed" }
    }
  }),
})
