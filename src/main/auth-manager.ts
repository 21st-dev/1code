/**
 * Simplified Auth Manager for Microsoft Foundry Claude credentials
 * Reads configuration from environment variables (via import.meta.env for electron-vite)
 * See: https://code.claude.com/docs/en/microsoft-foundry
 */
export class AuthManager {
  constructor(_isDev: boolean = false) {
    // No-op - we use environment variables now
  }

  /**
   * Check if Foundry credentials are configured via environment variables
   */
  isAuthenticated(): boolean {
    // In electron-vite, MAIN_VITE_ prefixed vars are available via import.meta.env
    const useFoundry = import.meta.env.MAIN_VITE_CLAUDE_CODE_USE_FOUNDRY
    const resource = import.meta.env.MAIN_VITE_ANTHROPIC_FOUNDRY_RESOURCE
    const apiKey = import.meta.env.MAIN_VITE_ANTHROPIC_FOUNDRY_API_KEY

    console.log("[AuthManager] isAuthenticated() check:")
    console.log("[AuthManager]   MAIN_VITE_CLAUDE_CODE_USE_FOUNDRY:", useFoundry || "(not set)")
    console.log("[AuthManager]   MAIN_VITE_ANTHROPIC_FOUNDRY_RESOURCE:", resource || "(not set)")
    console.log("[AuthManager]   MAIN_VITE_ANTHROPIC_FOUNDRY_API_KEY:", apiKey ? `${apiKey.slice(0, 8)}...` : "(not set)")

    const result = !!(useFoundry && resource && apiKey)
    console.log("[AuthManager]   Result:", result ? "✓ Authenticated (Foundry)" : "✗ Not authenticated")
    return result
  }

  /**
   * Get Foundry configuration from environment variables
   */
  getConfig(): { resource: string; apiKey: string; model: string } | null {
    const useFoundry = import.meta.env.MAIN_VITE_CLAUDE_CODE_USE_FOUNDRY
    const resource = import.meta.env.MAIN_VITE_ANTHROPIC_FOUNDRY_RESOURCE
    const apiKey = import.meta.env.MAIN_VITE_ANTHROPIC_FOUNDRY_API_KEY
    const model = import.meta.env.MAIN_VITE_ANTHROPIC_DEFAULT_OPUS_MODEL

    if (!useFoundry || !resource || !apiKey) {
      return null
    }

    return { resource, apiKey, model: model || "claude-opus-4-5" }
  }

  /**
   * Get user info (stub for compatibility - returns null since we use API keys)
   */
  getUser(): null {
    return null
  }

  /**
   * Logout - no-op since we use env vars
   */
  logout(): void {
    console.log("[Auth] Logout called but using env vars - no action needed")
  }

  // Legacy methods for compatibility - these are no-ops now
  setOnTokenRefresh(_callback: (authData: any) => void): void {
    // No-op
  }

  startAuthFlow(_mainWindow: any): void {
    console.log("[Auth] startAuthFlow called but using env vars - configure in .env.local")
  }

  async getValidToken(): Promise<string | null> {
    return import.meta.env.MAIN_VITE_AZURE_API_KEY || null
  }

  async updateUser(_updates: { name?: string }): Promise<null> {
    return null
  }

  saveConfig(_config: any): void {
    console.log("[Auth] saveConfig called but using env vars - configure in .env.local")
  }
}
