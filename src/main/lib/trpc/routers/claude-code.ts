import { eq } from "drizzle-orm"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { z } from "zod"
import { getClaudeShellEnvironment } from "../../claude"
import { getExistingClaudeCredentials } from "../../claude-token"
import {
  type ClaudeCodeCredentialMetadata,
  getClaudeCodeCredentialMetadata,
  importLocalClaudeCodeCredential,
  storeClaudeCodeOAuthCredential,
  storeClaudeCodeOAuthToken,
} from "../../claude-credentials"
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
  getDatabase,
} from "../../db"
import { publicProcedure, router } from "../index"

type ClaudeCodeLocalLoginSessionState =
  | "running"
  | "importing"
  | "success"
  | "error"
  | "cancelled"

type ClaudeCodeLocalLoginSession = {
  id: string
  state: ClaudeCodeLocalLoginSessionState
  output: string
  url: string | null
  error: string | null
  exitCode: number | null
  metadata: ClaudeCodeCredentialMetadata | null
  codeVerifier: string
  expectedState: string
}

const localLoginSessions = new Map<string, ClaudeCodeLocalLoginSession>()
const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const CLAUDE_AI_AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
const CLAUDE_TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
const CLAUDE_MANUAL_REDIRECT_URL =
  "https://platform.claude.com/oauth/code/callback"
const CLAUDE_OAUTH_SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
]

type ClaudeCodeTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

function redactClaudeLoginOutput(output: string): string {
  return output
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
    .replace(
      /("(?:access|refresh|id)_?token"\s*:\s*")[^"]+(")/gi,
      "$1[redacted]$2",
    )
    .replace(
      /\b((?:access|refresh|id)_?token)\s*=\s*[^\s]+/gi,
      "$1=[redacted]",
    )
}

function appendLocalLoginOutput(
  session: ClaudeCodeLocalLoginSession,
  chunk: string,
): void {
  const cleanChunk = redactClaudeLoginOutput(chunk)
  if (!cleanChunk) return

  session.output += cleanChunk
}

function toLocalLoginSessionResponse(session: ClaudeCodeLocalLoginSession) {
  return {
    sessionId: session.id,
    state: session.state,
    url: session.url,
    output: session.output,
    error: session.error,
    exitCode: session.exitCode,
    metadata: session.metadata,
  }
}

function getActiveLocalLoginSession(): ClaudeCodeLocalLoginSession | null {
  for (const session of localLoginSessions.values()) {
    if (
      session.state === "running" ||
      session.state === "importing"
    ) {
      return session
    }
  }

  return null
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function generateCodeVerifier(): string {
  return base64Url(randomBytes(96))
}

function generateCodeChallenge(codeVerifier: string): string {
  return base64Url(createHash("sha256").update(codeVerifier).digest())
}

function buildClaudeCodeAuthUrl({
  codeChallenge,
  state,
}: {
  codeChallenge: string
  state: string
}): string {
  const authUrl = new URL(CLAUDE_AI_AUTHORIZE_URL)
  authUrl.searchParams.set("code", "true")
  authUrl.searchParams.set("client_id", CLAUDE_OAUTH_CLIENT_ID)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("redirect_uri", CLAUDE_MANUAL_REDIRECT_URL)
  authUrl.searchParams.set("scope", CLAUDE_OAUTH_SCOPES.join(" "))
  authUrl.searchParams.set("code_challenge", codeChallenge)
  authUrl.searchParams.set("code_challenge_method", "S256")
  authUrl.searchParams.set("state", state)
  return authUrl.toString()
}

function parseManualClaudeAuthCode(input: string): {
  authorizationCode: string
  state: string
} {
  const [authorizationCode, state] = input.trim().split("#")
  if (!authorizationCode || !state) {
    throw new Error(
      "Invalid Claude Code authentication code. Copy the full code, including the part after #.",
    )
  }

  return { authorizationCode, state }
}

async function exchangeClaudeCodeAuthCode({
  authorizationCode,
  state,
  codeVerifier,
}: {
  authorizationCode: string
  state: string
  codeVerifier: string
}) {
  const response = await fetch(CLAUDE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: CLAUDE_MANUAL_REDIRECT_URL,
      client_id: CLAUDE_OAUTH_CLIENT_ID,
      code_verifier: codeVerifier,
      state,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      response.status === 401
        ? "Authentication failed: invalid or expired Claude Code authentication code."
        : `Claude Code token exchange failed (${response.status}): ${body || response.statusText}`,
    )
  }

  const tokenResponse = (await response.json()) as ClaudeCodeTokenResponse
  if (!tokenResponse.access_token) {
    throw new Error(
      "Claude Code token exchange succeeded, but no access token was returned.",
    )
  }

  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: tokenResponse.expires_in
      ? Date.now() + tokenResponse.expires_in * 1000
      : undefined,
    scopes: tokenResponse.scope?.split(" ").filter(Boolean),
  }
}

/**
 * Claude Code OAuth router for desktop
 * Uses first-party Claude Code OAuth and stores tokens locally.
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
   * Start local Claude Code OAuth login.
   * This uses Claude Code's first-party OAuth client parameters directly, then
   * stores the exchanged token in the app's local encrypted credential store.
   */
  startLocalLogin: publicProcedure.mutation(() => {
    const existingSession = getActiveLocalLoginSession()
    if (existingSession) {
      return toLocalLoginSessionResponse(existingSession)
    }

    const sessionId = randomUUID()
    const codeVerifier = generateCodeVerifier()
    const expectedState = base64Url(randomBytes(32))
    const url = buildClaudeCodeAuthUrl({
      codeChallenge: generateCodeChallenge(codeVerifier),
      state: expectedState,
    })

    console.log("[ClaudeCodeLogin] Starting direct local Claude Code OAuth flow")

    const session: ClaudeCodeLocalLoginSession = {
      id: sessionId,
      state: "running",
      output:
        "Opening Anthropic sign-in in your browser. Paste the full authentication code here after sign-in.\n",
      url,
      error: null,
      exitCode: null,
      metadata: null,
      codeVerifier,
      expectedState,
    }

    localLoginSessions.set(sessionId, session)

    return toLocalLoginSessionResponse(session)
  }),

  getLocalLoginSession: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .query(({ input }) => {
      const session = localLoginSessions.get(input.sessionId)
      if (!session) {
        throw new Error("Claude Code local login session not found")
      }

      return toLocalLoginSessionResponse(session)
    }),

  submitLocalLoginCode: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        code: z.string().trim().min(1).max(4096),
      }),
    )
    .mutation(async ({ input }) => {
      const session = localLoginSessions.get(input.sessionId)
      if (!session || session.state !== "running") {
        throw new Error("Claude Code local login session is not running")
      }

      const { authorizationCode, state } = parseManualClaudeAuthCode(
        input.code.trim(),
      )
      if (state !== session.expectedState) {
        throw new Error(
          "Claude Code authentication code does not match this login session. Please start login again and paste the new full code.",
        )
      }

      console.log("[ClaudeCodeLogin] Exchanging Claude Code auth code", {
        sessionId: session.id,
        codeLength: input.code.trim().length,
      })

      session.state = "importing"
      session.error = null
      appendLocalLoginOutput(
        session,
        "\nAuthentication code submitted; exchanging token locally...\n",
      )

      try {
        const credential = await exchangeClaudeCodeAuthCode({
          authorizationCode,
          state,
          codeVerifier: session.codeVerifier,
        })
        const result = storeClaudeCodeOAuthCredential(credential, {
          source: "manual",
          displayName: "Local Claude Code",
        })
        session.metadata = result.metadata
        session.state = "success"
        session.error = null
        appendLocalLoginOutput(
          session,
          "Local Claude Code credentials imported.\n",
        )
      } catch (error) {
        session.state = "error"
        session.error =
          error instanceof Error
            ? error.message
            : "Failed to exchange Claude Code authentication code"
        appendLocalLoginOutput(
          session,
          `Claude Code login failed: ${session.error}\n`,
        )
      }

      return {
        success: session.state === "success",
        session: toLocalLoginSessionResponse(session),
      }
    }),

  cancelLocalLogin: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const session = localLoginSessions.get(input.sessionId)
      if (!session) {
        return { success: true, found: false }
      }

      session.state = "cancelled"
      session.error = null

      return {
        success: true,
        found: true,
        session: toLocalLoginSessionResponse(session),
      }
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

})
