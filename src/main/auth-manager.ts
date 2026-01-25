import { AuthStore, AuthData, AuthUser } from "./auth-store"
import { app, BrowserWindow } from "electron"
import { AUTH_SERVER_PORT } from "./constants"

// Get API URL - in packaged app always use production, in dev allow override
function getApiBaseUrl(): string {
  if (app.isPackaged) {
    return "https://21st.dev"
  }
  return import.meta.env.MAIN_VITE_API_URL || "https://21st.dev"
}

export class AuthManager {
  private store: AuthStore
  private refreshTimer?: NodeJS.Timeout
  private isDev: boolean
  private onTokenRefresh?: (authData: AuthData) => void

  constructor(isDev: boolean = false) {
    this.store = new AuthStore(app.getPath("userData"))
    this.isDev = isDev

    // Schedule refresh if already authenticated
    if (this.store.isAuthenticated()) {
      this.scheduleRefresh()
    }
  }

  /**
   * Set callback to be called when token is refreshed
   * This allows the main process to update cookies when tokens change
   */
  setOnTokenRefresh(callback: (authData: AuthData) => void): void {
    this.onTokenRefresh = callback
  }

  private getApiUrl(): string {
    return getApiBaseUrl()
  }

  /**
   * Exchange auth code for session tokens
   * Called after receiving code via deep link
   */
  async exchangeCode(code: string): Promise<AuthData> {
    const response = await fetch(`${this.getApiUrl()}/api/auth/desktop/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        deviceInfo: this.getDeviceInfo(),
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(error.error || `Exchange failed: ${response.status}`)
    }

    const data = await response.json()

    const authData: AuthData = {
      token: data.token,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      user: data.user,
    }

    this.store.save(authData)
    this.scheduleRefresh()

    return authData
  }

  /**
   * Get device info for session tracking
   */
  private getDeviceInfo(): string {
    const platform = process.platform
    const arch = process.arch
    const version = app.getVersion()
    return `21st Desktop ${version} (${platform} ${arch})`
  }

  /**
   * Get a valid token, refreshing if necessary
   */
  async getValidToken(): Promise<string | null> {
    if (!this.store.isAuthenticated()) {
      return null
    }

    if (this.store.needsRefresh()) {
      await this.refresh()
    }

    return this.store.getToken()
  }

  /**
   * Refresh the current session
   */
  async refresh(): Promise<boolean> {
    const refreshToken = this.store.getRefreshToken()
    if (!refreshToken) {
      console.warn("No refresh token available")
      return false
    }

    try {
      const response = await fetch(`${this.getApiUrl()}/api/auth/desktop/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        console.error("Refresh failed:", response.status)
        // If refresh fails, clear auth and require re-login
        if (response.status === 401) {
          this.logout()
        }
        return false
      }

      const data = await response.json()

      const authData: AuthData = {
        token: data.token,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        user: data.user,
      }

      this.store.save(authData)
      this.scheduleRefresh()

      // Notify callback about token refresh (so cookie can be updated)
      if (this.onTokenRefresh) {
        this.onTokenRefresh(authData)
      }

      return true
    } catch (error) {
      console.error("Refresh error:", error)
      return false
    }
  }

  /**
   * Schedule token refresh before expiration
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    const authData = this.store.load()
    if (!authData) return

    const expiresAt = new Date(authData.expiresAt).getTime()
    const now = Date.now()

    // Refresh 5 minutes before expiration
    const refreshIn = Math.max(0, expiresAt - now - 5 * 60 * 1000)

    this.refreshTimer = setTimeout(() => {
      this.refresh()
    }, refreshIn)

    console.log(`Scheduled token refresh in ${Math.round(refreshIn / 1000 / 60)} minutes`)
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.store.isAuthenticated()
  }

  /**
   * Get current user
   */
  getUser(): AuthUser | null {
    return this.store.getUser()
  }

  /**
   * Get current auth data
   */
  getAuth(): AuthData | null {
    return this.store.load()
  }

  /**
   * Logout and clear stored credentials
   */
  logout(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }
    this.store.clear()
  }

  /**
   * Start auth flow by opening browser
   */
  startAuthFlow(mainWindow: BrowserWindow | null): void {
    const { shell } = require("electron")

    let authUrl = `${this.getApiUrl()}/auth/desktop?auto=true`

    // In dev mode, use localhost callback (we run HTTP server on AUTH_SERVER_PORT)
    // Also pass the protocol so web knows which deep link to use as fallback
    if (this.isDev) {
      authUrl += `&callback=${encodeURIComponent(`http://localhost:${AUTH_SERVER_PORT}/auth/callback`)}`
      // Pass dev protocol so production web can use correct deep link if callback fails
      authUrl += `&protocol=twentyfirst-agents-dev`
    }

    shell.openExternal(authUrl)
  }

  /**
   * Update user profile on server and locally
   */
  async updateUser(updates: { name?: string }): Promise<AuthUser | null> {
    const token = await this.getValidToken()
    if (!token) {
      throw new Error("Not authenticated")
    }

    // Update on server using X-Desktop-Token header
    const response = await fetch(`${this.getApiUrl()}/api/user/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Desktop-Token": token,
      },
      body: JSON.stringify({
        display_name: updates.name,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(error.error || `Update failed: ${response.status}`)
    }

    // Update locally
    return this.store.updateUser({ name: updates.name ?? null })
  }

  /**
   * Fetch user's subscription plan from web backend
   * Used for PostHog analytics enrichment
   */
  async fetchUserPlan(): Promise<{ email: string; plan: string; status: string | null } | null> {
    const token = await this.getValidToken()
    if (!token) return null

    try {
      const response = await fetch(`${this.getApiUrl()}/api/desktop/user/plan`, {
        headers: { "X-Desktop-Token": token },
      })

      if (!response.ok) {
        console.error("[AuthManager] Failed to fetch user plan:", response.status)
        return null
      }

      return response.json()
    } catch (error) {
      console.error("[AuthManager] Failed to fetch user plan:", error)
      return null
    }
  }
}

// Global singleton instance
let authManagerInstance: AuthManager | null = null

/**
 * Initialize the global auth manager instance
 * Must be called once from main process initialization
 */
export function initAuthManager(isDev: boolean = false): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager(isDev)
  }
  return authManagerInstance
}

/**
 * Get the global auth manager instance
 * Returns null if not initialized
 */
export function getAuthManager(): AuthManager | null {
  return authManagerInstance
}
