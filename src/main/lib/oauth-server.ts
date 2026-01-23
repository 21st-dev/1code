/**
 * Local OAuth Server for Anthropic Claude authentication
 *
 * This module implements a local HTTP server that handles the OAuth flow
 * directly with Anthropic, eliminating the need for 21st.dev's CodeSandbox.
 *
 * Uses PKCE (Proof Key for Code Exchange) for secure OAuth without client secret.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from "http"
import { URL } from "url"
import { shell } from "electron"
import crypto from "crypto"
import {
  OAUTH_ENDPOINTS,
  OAUTH_CLIENT_ID,
  OAUTH_SCOPES,
  exchangeAuthorizationCode,
  type OAuthTokens,
} from "./oauth-utils"

// OAuth Configuration
const OAUTH_CONFIG = {
  // Port range to try (avoids common dev ports)
  portRange: { min: 21300, max: 21399 },
}

interface PKCEChallenge {
  verifier: string
  challenge: string
}

// Re-export OAuthTokens as OAuthResult for backwards compatibility
export type OAuthResult = OAuthTokens

interface OAuthState {
  server: Server | null
  port: number | null
  pkce: PKCEChallenge | null
  state: string | null
  resolveCallback: ((result: OAuthResult) => void) | null
  rejectCallback: ((error: Error) => void) | null
  timeoutId: NodeJS.Timeout | null
}

// Module state
let oauthState: OAuthState = {
  server: null,
  port: null,
  pkce: null,
  state: null,
  resolveCallback: null,
  rejectCallback: null,
  timeoutId: null,
}

/**
 * Generate PKCE challenge and verifier
 * Uses SHA-256 and base64url encoding per RFC 7636
 */
function generatePKCE(): PKCEChallenge {
  // Generate 32 bytes of random data for the verifier
  const verifier = crypto.randomBytes(32).toString("base64url")

  // Create SHA-256 hash of verifier
  const hash = crypto.createHash("sha256").update(verifier).digest()
  const challenge = hash.toString("base64url")

  return { verifier, challenge }
}

/**
 * Find an available port in the specified range
 */
async function findAvailablePort(min: number, max: number): Promise<number> {
  for (let port = min; port <= max; port++) {
    const isAvailable = await checkPortAvailable(port)
    if (isAvailable) {
      return port
    }
  }
  throw new Error(`No available ports in range ${min}-${max}`)
}

/**
 * Check if a port is available
 */
function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(port, "127.0.0.1")
    server.on("listening", () => {
      server.close(() => resolve(true))
    })
    server.on("error", () => {
      resolve(false)
    })
  })
}

/**
 * HTML response for successful OAuth callback
 */
function getSuccessHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ii - Authentication Complete</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --bg: #09090b; --text: #fafafa; --text-muted: #71717a; }
    @media (prefers-color-scheme: light) {
      :root { --bg: #ffffff; --text: #09090b; --text-muted: #71717a; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; background: var(--bg); color: var(--text);
    }
    .container { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .checkmark { width: 48px; height: 48px; color: #22c55e; margin-bottom: 8px; }
    h1 { font-size: 18px; font-weight: 600; }
    p { font-size: 14px; color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="container">
    <svg class="checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-linecap="round"/>
      <polyline points="22 4 12 14.01 9 11.01" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <h1>Authentication Successful</h1>
    <p>You can close this tab and return to the app.</p>
  </div>
  <script>setTimeout(() => window.close(), 2000)</script>
</body>
</html>`
}

/**
 * HTML response for OAuth error
 */
function getErrorHTML(message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ii - Authentication Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --bg: #09090b; --text: #fafafa; --text-muted: #71717a; --error: #ef4444; }
    @media (prefers-color-scheme: light) {
      :root { --bg: #ffffff; --text: #09090b; --text-muted: #71717a; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; background: var(--bg); color: var(--text);
    }
    .container { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 400px; text-align: center; }
    h1 { font-size: 18px; font-weight: 600; color: var(--error); }
    p { font-size: 14px; color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authentication Failed</h1>
    <p>${escapeHtml(message)}</p>
    <p style="margin-top: 8px;">Please close this tab and try again in the app.</p>
  </div>
</body>
</html>`
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

/**
 * Handle the OAuth callback request
 */
async function handleCallback(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  // Handle OAuth errors
  if (error) {
    const message = errorDescription || error
    console.error("[OAuth] Authorization error:", message)
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(getErrorHTML(message))
    cleanup()
    oauthState.rejectCallback?.(new Error(message))
    return
  }

  // Validate state parameter to prevent CSRF
  if (!state || state !== oauthState.state) {
    const message = "Invalid state parameter - possible CSRF attack"
    console.error("[OAuth]", message)
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(getErrorHTML(message))
    cleanup()
    oauthState.rejectCallback?.(new Error(message))
    return
  }

  // Validate required parameters
  if (!code) {
    const message = "Missing authorization code"
    console.error("[OAuth]", message)
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(getErrorHTML(message))
    cleanup()
    oauthState.rejectCallback?.(new Error(message))
    return
  }

  // Extract the actual code (before '#' if present)
  const authCode = code.includes("#") ? code.split("#")[0] : code

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(authCode)

    // Send success response
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(getSuccessHTML())

    // Cleanup and resolve
    cleanup()
    oauthState.resolveCallback?.(tokens)
  } catch (exchangeError) {
    const message =
      exchangeError instanceof Error ? exchangeError.message : "Token exchange failed"
    console.error("[OAuth] Token exchange error:", message)
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(getErrorHTML(message))
    cleanup()
    oauthState.rejectCallback?.(new Error(message))
  }
}

/**
 * Exchange authorization code for tokens
 * Delegates to shared oauth-utils.ts implementation
 */
async function exchangeCodeForTokens(code: string): Promise<OAuthResult> {
  if (!oauthState.pkce || !oauthState.port) {
    throw new Error("OAuth state not initialized")
  }

  const redirectUri = `http://localhost:${oauthState.port}/callback`

  const tokens = await exchangeAuthorizationCode({
    code,
    redirectUri,
    codeVerifier: oauthState.pkce.verifier,
  })

  console.log("[OAuth] Token exchange successful")
  return tokens
}

/**
 * Create and start the local OAuth server
 */
function createOAuthServer(port: number): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`)

    console.log("[OAuth] Request:", req.method, url.pathname)

    // Handle callback
    if (url.pathname === "/callback") {
      await handleCallback(req, res, url)
      return
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ status: "ok" }))
      return
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "text/plain" })
    res.end("Not Found")
  })

  return server
}

/**
 * Cleanup OAuth state and stop server
 */
function cleanup(): void {
  if (oauthState.timeoutId) {
    clearTimeout(oauthState.timeoutId)
    oauthState.timeoutId = null
  }

  if (oauthState.server) {
    oauthState.server.close()
    oauthState.server = null
  }

  oauthState.port = null
  oauthState.pkce = null
  oauthState.state = null
  oauthState.resolveCallback = null
  oauthState.rejectCallback = null
}

/**
 * Start the OAuth flow
 * Returns a promise that resolves with the OAuth tokens
 */
export async function startOAuthFlow(
  timeoutMs: number = 300000
): Promise<OAuthResult> {
  // Cleanup any existing flow
  cleanup()

  return new Promise(async (resolve, reject) => {
    try {
      // Find available port
      const port = await findAvailablePort(
        OAUTH_CONFIG.portRange.min,
        OAUTH_CONFIG.portRange.max
      )
      console.log("[OAuth] Using port:", port)

      // Generate PKCE
      const pkce = generatePKCE()
      console.log("[OAuth] PKCE generated")

      // Generate state parameter for CSRF protection
      const state = crypto.randomBytes(32).toString("base64url")
      console.log("[OAuth] State generated")

      // Create server
      const server = createOAuthServer(port)

      // Store state
      oauthState = {
        server,
        port,
        pkce,
        state,
        resolveCallback: resolve,
        rejectCallback: reject,
        timeoutId: null,
      }

      // Handle server errors
      server.on("error", (err) => {
        console.error("[OAuth] Server error:", err)
        cleanup()
        reject(new Error(`Failed to start OAuth server: ${err.message}`))
      })

      // Start server
      server.listen(port, "127.0.0.1", () => {
        console.log(`[OAuth] Server listening on http://localhost:${port}`)
      })

      // Set timeout
      oauthState.timeoutId = setTimeout(() => {
        console.error("[OAuth] Flow timed out")
        cleanup()
        reject(new Error("OAuth flow timed out after 5 minutes"))
      }, timeoutMs)

      // Build authorization URL
      const redirectUri = `http://localhost:${port}/callback`
      const authUrl = new URL(OAUTH_ENDPOINTS.authorization)
      authUrl.searchParams.set("client_id", OAUTH_CLIENT_ID)
      authUrl.searchParams.set("response_type", "code")
      authUrl.searchParams.set("redirect_uri", redirectUri)
      authUrl.searchParams.set("scope", OAUTH_SCOPES)
      authUrl.searchParams.set("state", state)
      authUrl.searchParams.set("code_challenge", pkce.challenge)
      authUrl.searchParams.set("code_challenge_method", "S256")

      console.log("[OAuth] Opening browser for authorization...")
      console.log("[OAuth] Auth URL:", authUrl.toString())

      // Open browser
      await shell.openExternal(authUrl.toString())
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

/**
 * Cancel any in-progress OAuth flow
 */
export function cancelOAuthFlow(): void {
  if (oauthState.rejectCallback) {
    oauthState.rejectCallback(new Error("OAuth flow cancelled"))
  }
  cleanup()
}

/**
 * Check if an OAuth flow is in progress
 */
export function isOAuthFlowInProgress(): boolean {
  return oauthState.server !== null
}
