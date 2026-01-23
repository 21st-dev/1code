import { AuthStore, AuthData, AuthUser } from "./auth-store"
import { app, BrowserWindow } from "electron"

/**
 * AuthManager - Stubbed for ii (Intelligence Interface)
 *
 * 21st.dev authentication has been removed. This class is kept for backwards
 * compatibility but all methods either return stub values or are no-ops.
 *
 * Claude Code authentication is now handled via local OAuth server
 * in oauth-server.ts and claude-code.ts router.
 */
export class AuthManager {
  private store: AuthStore
  private isDev: boolean

  constructor(isDev: boolean = false) {
    this.store = new AuthStore(app.getPath("userData"))
    this.isDev = isDev
  }

  /**
   * @deprecated No-op - 21st.dev auth removed
   */
  setOnTokenRefresh(_callback: (authData: AuthData) => void): void {
    // No-op
  }

  /**
   * @deprecated Returns null - 21st.dev auth removed
   */
  async exchangeCode(_code: string): Promise<AuthData> {
    throw new Error("21st.dev authentication has been removed. Use Claude OAuth instead.")
  }

  /**
   * @deprecated Returns null - 21st.dev auth removed
   */
  async getValidToken(): Promise<string | null> {
    return null
  }

  /**
   * @deprecated Returns false - 21st.dev auth removed
   */
  async refresh(): Promise<boolean> {
    return false
  }

  /**
   * Always returns true - authentication check bypassed
   */
  isAuthenticated(): boolean {
    return true
  }

  /**
   * Returns null - no 21st.dev user
   */
  getUser(): AuthUser | null {
    return null
  }

  /**
   * Returns null - no 21st.dev auth data
   */
  getAuth(): AuthData | null {
    return null
  }

  /**
   * No-op - nothing to logout from
   */
  logout(): void {
    // No-op
  }

  /**
   * @deprecated No-op - 21st.dev auth removed
   */
  startAuthFlow(_mainWindow: BrowserWindow | null): void {
    console.warn("startAuthFlow is deprecated. Use Claude OAuth via startLocalAuth instead.")
  }

  /**
   * @deprecated Throws - 21st.dev auth removed
   */
  async updateUser(_updates: { name?: string }): Promise<AuthUser | null> {
    throw new Error("21st.dev authentication has been removed.")
  }
}
