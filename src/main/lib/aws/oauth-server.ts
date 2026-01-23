import http from "http"
import crypto from "crypto"

export interface OAuthCallbackResult {
  code: string
  state: string
  error?: string
  errorDescription?: string
}

/**
 * Local HTTP server for OAuth callbacks
 * Used for Authorization Code Grant with PKCE flow (AWS CLI style)
 */
export class OAuthCallbackServer {
  private server: http.Server | null = null
  private port: number = 0
  private resolveCallback: ((result: OAuthCallbackResult) => void) | null = null
  private rejectCallback: ((error: Error) => void) | null = null
  private timeoutId: NodeJS.Timeout | null = null

  /**
   * Start the HTTP server on a random available port
   * @returns The port number the server is listening on
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.handleRequest.bind(this))

      this.server.on("error", (error) => {
        console.error("[oauth-server] Server error:", error)
        reject(error)
      })

      // Listen on a random available port on localhost
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address()
        if (typeof addr === "object" && addr !== null) {
          this.port = addr.port
          console.log(`[oauth-server] Started on port ${this.port}`)
          resolve(this.port)
        } else {
          reject(new Error("Failed to get server address"))
        }
      })
    })
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url!, `http://${req.headers.host}`)

    // Handle callback route
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      const error = url.searchParams.get("error")
      const errorDescription = url.searchParams.get("error_description")

      // Send response page to browser
      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(this.getErrorPage(error, errorDescription || ""))
      } else {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(this.getSuccessPage())
      }

      // Resolve the callback promise
      if (this.resolveCallback) {
        this.resolveCallback({
          code: code || "",
          state: state || "",
          error: error || undefined,
          errorDescription: errorDescription || undefined,
        })
      }

      // Close server after handling callback
      setTimeout(() => this.close(), 100)
    } else {
      // Unknown route
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Not Found")
    }
  }

  /**
   * Wait for the OAuth callback with optional timeout
   * @param timeoutMs Timeout in milliseconds (default: 5 minutes)
   */
  waitForCallback(timeoutMs: number = 300000): Promise<OAuthCallbackResult> {
    return new Promise((resolve, reject) => {
      this.resolveCallback = resolve
      this.rejectCallback = reject

      // Set timeout
      this.timeoutId = setTimeout(() => {
        this.close()
        reject(new Error("OAuth timeout - user did not complete login"))
      }, timeoutMs)
    })
  }

  /**
   * Close the server and cleanup
   */
  close() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }

    if (this.server) {
      this.server.close()
      this.server = null
      console.log("[oauth-server] Server closed")
    }
  }

  /**
   * Get the redirect URI for this server
   */
  getRedirectUri(): string {
    return `http://127.0.0.1:${this.port}/callback`
  }

  /**
   * Get the port number
   */
  getPort(): number {
    return this.port
  }

  /**
   * Generate HTML success page
   */
  private getSuccessPage(): string {
    return `
<!DOCTYPE html>
<html>
  <head>
    <title>AWS SSO Login Successful</title>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #f1f5f9;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .container {
        text-align: center;
        padding: 40px;
        max-width: 400px;
      }
      .icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        background: #22c55e;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon svg {
        width: 40px;
        height: 40px;
        stroke: white;
        stroke-width: 3;
        fill: none;
      }
      h1 {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #22c55e;
      }
      p {
        color: #94a3b8;
        font-size: 16px;
        line-height: 1.5;
      }
      .countdown {
        margin-top: 24px;
        font-size: 14px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon">
        <svg viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h1>Login Successful</h1>
      <p>You have been authenticated with AWS SSO. You can close this window and return to 1Code.</p>
      <p class="countdown">This window will close automatically...</p>
    </div>
    <script>
      setTimeout(() => window.close(), 2000);
    </script>
  </body>
</html>
    `.trim()
  }

  /**
   * Generate HTML error page
   */
  private getErrorPage(error: string, description: string): string {
    return `
<!DOCTYPE html>
<html>
  <head>
    <title>AWS SSO Login Failed</title>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #f1f5f9;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .container {
        text-align: center;
        padding: 40px;
        max-width: 400px;
      }
      .icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        background: #ef4444;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon svg {
        width: 40px;
        height: 40px;
        stroke: white;
        stroke-width: 3;
        fill: none;
      }
      h1 {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #ef4444;
      }
      p {
        color: #94a3b8;
        font-size: 16px;
        line-height: 1.5;
      }
      .error-code {
        margin-top: 16px;
        padding: 12px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: 8px;
        font-family: monospace;
        font-size: 14px;
        color: #fca5a5;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon">
        <svg viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>
      <h1>Login Failed</h1>
      <p>There was a problem authenticating with AWS SSO. Please close this window and try again.</p>
      <div class="error-code">
        ${escapeHtml(error)}${description ? ": " + escapeHtml(description) : ""}
      </div>
    </div>
  </body>
</html>
    `.trim()
  }
}

/**
 * Helper to escape HTML entities
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// ============================================================================
// PKCE Helpers
// ============================================================================

/**
 * Generate a cryptographically random code verifier for PKCE
 * RFC 7636 specifies 43-128 characters from unreserved URI character set
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url")
}

/**
 * Generate code challenge from code verifier using S256 method
 * @param verifier The code verifier string
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return base64UrlEncode(Buffer.from(digest))
}

/**
 * URL-safe base64 encoding (no padding, + -> -, / -> _)
 */
export function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString("hex")
}
