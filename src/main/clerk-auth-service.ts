import { shell } from "electron"
import {
  getClerkTokens,
  storeClerkTokens,
  clearClerkTokens,
  hasStoredTokens,
  type ClerkTokens,
} from "./clerk-token-store"

// Web app URL - baked in at build time, defaults to production
const WEB_APP_URL =
  import.meta.env.MAIN_VITE_WEB_APP_URL || "https://anchor.kosal.io"
const API_URL = `${WEB_APP_URL}/api`

export interface ClerkUser {
  id: string
  email?: string
  name?: string
  imageUrl?: string
  subscriptionTier?: "free" | "pro" | "enterprise"
}

/**
 * Clerk Authentication Service
 * Handles authentication flow with web app using deep links
 */
export class ClerkAuthService {
  private user: ClerkUser | null = null

  constructor() {
    // Load user info from stored tokens on init
    this.loadUserFromTokens()
  }

  /**
   * Load user info from stored tokens
   */
  private async loadUserFromTokens(): Promise<void> {
    const tokens = await getClerkTokens()
    if (tokens) {
      this.user = {
        id: tokens.userId,
        email: tokens.email,
        name: tokens.name,
        imageUrl: tokens.imageUrl,
      }
      console.log("[ClerkAuth] User loaded from stored tokens:", {
        id: this.user.id,
        email: this.user.email,
        name: this.user.name,
        imageUrl: this.user.imageUrl,
      })
    }
  }

  /**
   * Initiate sign-in flow by opening browser
   */
  async initiateLogin(): Promise<void> {
    console.log("[ClerkAuth] Initiating login flow")
    const authUrl = `${WEB_APP_URL}/sign-in?redirect=desktop`
    await shell.openExternal(authUrl)
  }

  /**
   * Initiate sign-up flow by opening browser
   */
  async initiateSignup(): Promise<void> {
    console.log("[ClerkAuth] Initiating signup flow")
    const authUrl = `${WEB_APP_URL}/sign-up?redirect=desktop`
    await shell.openExternal(authUrl)
  }

  /**
   * Handle authentication callback from deep link
   */
  async handleAuthCallback(url: string): Promise<boolean> {
    try {
      const parsedUrl = new URL(url)
      const token = parsedUrl.searchParams.get("token")
      const refresh = parsedUrl.searchParams.get("refresh")
      const userId = parsedUrl.searchParams.get("userId")
      const email = parsedUrl.searchParams.get("email")
      const name = parsedUrl.searchParams.get("name")
      const imageUrl = parsedUrl.searchParams.get("imageUrl")

      if (!token || !refresh || !userId) {
        console.error("[ClerkAuth] Missing required parameters in callback")
        return false
      }

      // Store tokens
      storeClerkTokens({
        accessToken: token,
        refreshToken: refresh,
        userId,
        email: email || undefined,
        name: name || undefined,
        imageUrl: imageUrl || undefined,
      })

      // Update user info
      this.user = {
        id: userId,
        email: email || undefined,
        name: name || undefined,
        imageUrl: imageUrl || undefined,
      }

      console.log("[ClerkAuth] Authentication successful for user:", userId)
      return true
    } catch (error) {
      console.error("[ClerkAuth] Failed to handle auth callback:", error)
      return false
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return await hasStoredTokens()
  }

  /**
   * Get current user info (loads from tokens if not cached)
   */
  async getUser(): Promise<ClerkUser | null> {
    // If user is not loaded yet, try loading from tokens
    if (!this.user) {
      await this.loadUserFromTokens()
    }
    return this.user
  }

  /**
   * Get access token (auto-refresh if needed)
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await getClerkTokens()
    if (!tokens) {
      return null
    }

    // TODO: Check token expiry and refresh if needed
    // For now, just return the token
    return tokens.accessToken
  }

  /**
   * Validate current token with server
   */
  async validateToken(): Promise<boolean> {
    const token = await this.getAccessToken()
    if (!token) {
      return false
    }

    try {
      const response = await fetch(`${API_URL}/desktop/validate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        // Update user info from validation response
        if (data.userId) {
          this.user = {
            id: data.userId,
            email: data.email,
            name: data.name,
          }
        }
        return true
      }

      return false
    } catch (error) {
      console.error("[ClerkAuth] Token validation failed:", error)
      return false
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<boolean> {
    const tokens = await getClerkTokens()
    if (!tokens) {
      return false
    }

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refreshToken: tokens.refreshToken,
        }),
      })

      if (!response.ok) {
        console.error("[ClerkAuth] Token refresh failed:", response.status)
        await this.logout()
        return false
      }

      const { accessToken } = await response.json()

      // Update stored access token
      await storeClerkTokens({
        accessToken,
        refreshToken: tokens.refreshToken,
        userId: tokens.userId,
        email: tokens.email,
        name: tokens.name,
      })

      console.log("[ClerkAuth] Access token refreshed successfully")
      return true
    } catch (error) {
      console.error("[ClerkAuth] Token refresh error:", error)
      await this.logout()
      return false
    }
  }

  /**
   * Logout and clear all tokens
   */
  async logout(): Promise<void> {
    console.log("[ClerkAuth] Logging out")
    await clearClerkTokens()
    this.user = null
  }

  /**
   * Make authenticated API request with auto-refresh
   */
  async apiRequest(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<Response> {
    let token = await this.getAccessToken()
    if (!token) {
      throw new Error("Not authenticated")
    }

    // First attempt
    let response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })

    // If unauthorized, try refreshing token
    if (response.status === 401) {
      console.log("[ClerkAuth] Token expired, attempting refresh")
      const refreshed = await this.refreshAccessToken()

      if (!refreshed) {
        throw new Error("Session expired. Please login again.")
      }

      // Retry with new token
      token = await this.getAccessToken()
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
    }

    return response
  }
}

// Singleton instance
let clerkAuthService: ClerkAuthService | null = null

export function getClerkAuthService(): ClerkAuthService {
  if (!clerkAuthService) {
    clerkAuthService = new ClerkAuthService()
  }
  return clerkAuthService
}
