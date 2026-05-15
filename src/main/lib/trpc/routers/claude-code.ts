import { eq } from "drizzle-orm"
import { shell } from "electron"
import { spawn, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import { stripVTControlCharacters } from "node:util"
import { z } from "zod"
import {
  getBundledClaudeBinaryPath,
  getClaudeShellEnvironment,
} from "../../claude"
import { getExistingClaudeCredentials } from "../../claude-token"
import {
  type ClaudeCodeCredentialMetadata,
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

type ClaudeCodeLocalLoginSessionState =
  | "running"
  | "importing"
  | "success"
  | "error"
  | "cancelled"

type ClaudeCodeLocalLoginSession = {
  id: string
  process: ChildProcess | null
  state: ClaudeCodeLocalLoginSessionState
  output: string
  url: string | null
  error: string | null
  exitCode: number | null
  metadata: ClaudeCodeCredentialMetadata | null
}

const localLoginSessions = new Map<string, ClaudeCodeLocalLoginSession>()
const URL_CANDIDATE_REGEX = /https?:\/\/[^\s]+/g

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

function isLocalhostHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  )
}

function extractFirstNonLocalhostUrl(output: string): string | null {
  const matches = output.match(URL_CANDIDATE_REGEX)
  if (!matches) return null

  for (const match of matches) {
    try {
      const parsedUrl = new URL(match.trim().replace(/[),.;!?]+$/, ""))
      if (!isLocalhostHostname(parsedUrl.hostname)) {
        return parsedUrl.toString()
      }
    } catch {
      // Ignore invalid URL candidates.
    }
  }

  return null
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
  const cleanChunk = redactClaudeLoginOutput(stripVTControlCharacters(chunk))
  if (!cleanChunk) return

  session.output += cleanChunk

  if (!session.url) {
    session.url = extractFirstNonLocalhostUrl(session.output)
  }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isLocalLoginSessionCancelled(
  session: ClaudeCodeLocalLoginSession,
): boolean {
  return session.state === "cancelled"
}

async function finalizeLocalLoginSession(
  session: ClaudeCodeLocalLoginSession,
  exitCode: number | null,
): Promise<void> {
  session.exitCode = exitCode
  session.process = null

  if (session.state === "cancelled") {
    return
  }

  if (exitCode !== 0) {
    session.state = "error"
    session.error =
      session.error ||
      `Claude Code login exited with code ${exitCode ?? "unknown"}`
    return
  }

  session.state = "importing"
  appendLocalLoginOutput(
    session,
    "\nClaude Code login completed; importing local credentials...\n",
  )

  await delay(500)

  if (isLocalLoginSessionCancelled(session)) {
    return
  }

  try {
    const result = importLocalClaudeCodeCredential()
    session.metadata = result.metadata
    session.state = "success"
    session.error = null
    appendLocalLoginOutput(session, "Local Claude Code credentials imported.\n")
  } catch (error) {
    session.state = "error"
    session.error =
      error instanceof Error
        ? error.message
        : "Claude Code login completed, but local credentials were not found"
  }
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
   * Start local Claude Code CLI login.
   * This invokes the bundled Claude Code binary and lets it drive Anthropic's
   * official browser login; no 21st hosted auth or sandbox is contacted.
   */
  startLocalLogin: publicProcedure.mutation(() => {
    const existingSession = getActiveLocalLoginSession()
    if (existingSession) {
      return toLocalLoginSessionResponse(existingSession)
    }

    const claudeBinaryPath = getBundledClaudeBinaryPath()
    const sessionId = randomUUID()

    const child = spawn(claudeBinaryPath, ["auth", "login"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: getClaudeShellEnvironment(),
      windowsHide: true,
    })

    const session: ClaudeCodeLocalLoginSession = {
      id: sessionId,
      process: child,
      state: "running",
      output: "",
      url: null,
      error: null,
      exitCode: null,
      metadata: null,
    }

    const handleChunk = (chunk: Buffer | string) => {
      appendLocalLoginOutput(session, chunk.toString())
    }

    child.stdout.on("data", handleChunk)
    child.stderr.on("data", handleChunk)

    child.once("error", (error) => {
      session.state = "error"
      session.error = `[ClaudeCode] Failed to start local login flow: ${error.message}`
      session.process = null
    })

    child.once("close", (exitCode) => {
      void finalizeLocalLoginSession(session, exitCode)
    })

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

      if (session.process && !session.process.killed) {
        session.process.kill("SIGTERM")
      }

      return {
        success: true,
        found: true,
        session: toLocalLoginSessionResponse(session),
      }
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
