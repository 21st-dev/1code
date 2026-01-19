import { z } from "zod"
import { shell, safeStorage } from "electron"
import { randomBytes, createHash, randomUUID } from "crypto"
import { router, publicProcedure } from "../index"
import { getDatabase, claudeCodeCredentials } from "../../db"
import { eq } from "drizzle-orm"

const CLAUDE_CODE_OAUTH_CLIENT_ID =
  process.env.CLAUDE_CODE_OAUTH_CLIENT_ID ||
  "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

const CLAUDE_CODE_AUTHORIZE_URL =
  process.env.CLAUDE_CODE_AUTHORIZE_URL || "https://platform.claude.com/oauth/authorize"

const CLAUDE_CODE_TOKEN_URL =
  process.env.CLAUDE_CODE_TOKEN_URL || "https://platform.claude.com/v1/oauth/token"

const CLAUDE_CODE_MANUAL_REDIRECT_URL =
  process.env.CLAUDE_CODE_MANUAL_REDIRECT_URL ||
  "https://platform.claude.com/oauth/code/callback"

const CLAUDE_CODE_SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
]

type OAuthSession = {
  sessionId: string
  createdAtMs: number
  oauthUrl: string
  state: string
  codeVerifier: string
}

const sessions = new Map<string, OAuthSession>()

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function createCodeVerifier(): string {
  // RFC 7636: 43-128 chars, unreserved URL chars
  return base64UrlEncode(randomBytes(64))
}

function createCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest()
  return base64UrlEncode(hash)
}

function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const url = new URL(CLAUDE_CODE_AUTHORIZE_URL)
  // Claude Code CLI includes this flag in the authorize URL
  url.searchParams.set("code", "true")
  url.searchParams.set("client_id", CLAUDE_CODE_OAUTH_CLIENT_ID)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("redirect_uri", CLAUDE_CODE_MANUAL_REDIRECT_URL)
  url.searchParams.set("scope", CLAUDE_CODE_SCOPES.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

function parsePastedAuthCode(raw: string): { code: string; state: string | null } {
  const trimmed = raw.trim()

  // Accept full callback URL (common copy/paste)
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed)
      const code = url.searchParams.get("code")?.trim()
      const state = url.searchParams.get("state")?.trim() || null
      if (code) return { code, state }
    }
  } catch {
    // fall through
  }

  const hashIndex = trimmed.indexOf("#")
  if (hashIndex === -1) {
    return { code: trimmed, state: null }
  }
  const code = trimmed.slice(0, hashIndex).trim()
  const state = trimmed.slice(hashIndex + 1).trim() || null
  return { code, state }
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

/**
 * Claude Code OAuth router for desktop
 * Uses PKCE OAuth directly (no 21st.dev login required), stores token locally
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
   * Start OAuth flow - creates local PKCE session
   */
  startAuth: publicProcedure.mutation(async () => {
    const sessionId = randomUUID()
    const codeVerifier = createCodeVerifier()
    const codeChallenge = createCodeChallenge(codeVerifier)
    const state = base64UrlEncode(randomBytes(24))
    const oauthUrl = buildAuthorizeUrl(state, codeChallenge)

    sessions.set(sessionId, {
      sessionId,
      createdAtMs: Date.now(),
      oauthUrl,
      state,
      codeVerifier,
    })

    // Preserve existing renderer contract (sandboxUrl is unused in local flow)
    return {
      sandboxId: "local",
      sandboxUrl: "local",
      sessionId,
    }
  }),

  /**
   * Poll for OAuth URL - returns local URL
   */
  pollStatus: publicProcedure
    .input(
      z.object({
        sandboxUrl: z.string(),
        sessionId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const session = sessions.get(input.sessionId)
      if (!session) {
        return {
          state: "error" as const,
          oauthUrl: null,
          error: "Auth session not found. Please restart authentication.",
        }
      }
      return {
        state: "waiting_code" as const,
        oauthUrl: session.oauthUrl,
        error: null,
      }
    }),

  /**
   * Submit OAuth code - exchanges directly, stores token locally
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
      const session = sessions.get(input.sessionId)
      if (!session) {
        throw new Error("Auth session not found. Please restart authentication.")
      }

      const { code, state } = parsePastedAuthCode(input.code)

      if (!code) {
        throw new Error("Invalid authorization code")
      }

      if (state && state !== session.state) {
        throw new Error("Authorization code does not match this session. Please restart authentication.")
      }

      // Match Claude Code CLI's token exchange payload (JSON + includes state)
      const body = JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: CLAUDE_CODE_MANUAL_REDIRECT_URL,
        client_id: CLAUDE_CODE_OAUTH_CLIENT_ID,
        code_verifier: session.codeVerifier,
        state: session.state,
      })

      const response = await fetch(CLAUDE_CODE_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        throw new Error(
          `Token exchange failed: ${response.status}${errorText ? ` - ${errorText}` : ""}`,
        )
      }

      const data = (await response.json()) as { access_token?: string }
      const oauthToken = data.access_token

      if (!oauthToken) {
        throw new Error("Token exchange failed: missing access_token")
      }

      // Validate token format
      if (!oauthToken.startsWith("sk-ant-oat01-")) {
        throw new Error("Invalid OAuth token format")
      }

      // Encrypt and store locally
      const encryptedToken = encryptToken(oauthToken)
      const db = getDatabase()

      // Upsert - delete existing and insert new
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

      console.log("[ClaudeCode] Token stored locally")
      sessions.delete(input.sessionId)
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
