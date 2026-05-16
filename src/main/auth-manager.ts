import { app } from "electron"
import { AuthStore, AuthUser } from "./auth-store"

export class AuthManager {
  private store: AuthStore

  constructor(_isDev: boolean = false) {
    this.store = new AuthStore(app.getPath("userData"))
  }

  isAuthenticated(): boolean {
    return false
  }

  getUser(): AuthUser | null {
    return null
  }

  logout(): void {
    this.store.clear()
  }
}

let authManagerInstance: AuthManager | null = null

export function initAuthManager(isDev: boolean = false): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager(isDev)
  }
  return authManagerInstance
}

export function getAuthManager(): AuthManager | null {
  return authManagerInstance
}
